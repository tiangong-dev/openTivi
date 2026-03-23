use std::collections::HashMap;
use std::convert::Infallible;
use std::net::TcpListener;

use warp::{Filter, Reply};

mod rewrite;
mod state;

use rewrite::{
    insert_common_headers, is_playlist_content_type, is_playlist_url, resolve_content_type,
    rewrite_m3u8, validate_stream_url,
};
use state::{
    cache_playlist, get_cached_playlist_response, maybe_schedule_host_warm,
    prefetch_playlist_segments, warm_playlist_cache, CachedPlaylist, ProxyState,
};

/// Start a local HTTP proxy server for streaming.
/// Returns the port it's listening on.
pub async fn start_proxy_server() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("Failed to bind proxy port");
    let port = listener.local_addr().unwrap().port();
    drop(listener);

    let client = state::build_proxy_http_client();
    let state = ProxyState::new(client, port);

    let stream_route = warp::path("stream")
        .and(warp::query::<HashMap<String, String>>())
        .and(with_proxy_state(state.clone()))
        .and_then(handle_proxy);
    let warm_route = warp::path("warm")
        .and(warp::query::<HashMap<String, String>>())
        .and(with_proxy_state(state))
        .and_then(handle_warm);
    let route = stream_route.or(warm_route);

    tokio::spawn(async move {
        warp::serve(route).run(([127, 0, 0, 1], port)).await;
    });

    eprintln!("[proxy] started on 127.0.0.1:{}", port);

    port
}

async fn handle_proxy(
    params: HashMap<String, String>,
    state: ProxyState,
) -> Result<warp::reply::Response, warp::Rejection> {
    let url = match params.get("url") {
        Some(u) => u.clone(),
        None => {
            return Ok(warp::reply::with_status(
                "Missing 'url' parameter",
                warp::http::StatusCode::BAD_REQUEST,
            )
            .into_response())
        }
    };

    eprintln!("[proxy] /stream request url={}", url);

    if let Err(reason) = validate_stream_url(&url) {
        eprintln!("[proxy] URL rejected: {}", reason);
        return Ok(
            warp::reply::with_status(reason.to_string(), warp::http::StatusCode::FORBIDDEN)
                .into_response(),
        );
    }

    maybe_schedule_host_warm(state.clone(), &url).await;

    if let Some(cached) = get_cached_playlist_response(&state, &url).await {
        eprintln!("[proxy] serving cached playlist for {}", url);
        return Ok(cached);
    }

    let response = match state.client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[proxy] fetch error for {}: {}", url, e);
            return Ok(warp::reply::with_status(
                format!("Fetch error: {}", e),
                warp::http::StatusCode::BAD_GATEWAY,
            )
            .into_response());
        }
    };

    let status_u16 = response.status().as_u16();
    let status =
        warp::http::StatusCode::from_u16(status_u16).unwrap_or(warp::http::StatusCode::BAD_GATEWAY);
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let is_playlist = is_playlist_content_type(&content_type) || is_playlist_url(&url);

    eprintln!(
        "[proxy] upstream status={} content_type={} is_playlist={}",
        status_u16, content_type, is_playlist
    );

    if is_playlist {
        let body = match response.bytes().await {
            Ok(b) => b,
            Err(e) => {
                eprintln!("[proxy] body read error: {}", e);
                return Ok(warp::reply::with_status(
                    format!("Body read error: {}", e),
                    warp::http::StatusCode::BAD_GATEWAY,
                )
                .into_response());
            }
        };

        let text = String::from_utf8_lossy(&body);
        eprintln!(
            "[proxy] playlist body ({} bytes):\n{}",
            body.len(),
            &text[..text.len().min(500)]
        );
        let rewritten = rewrite_m3u8(&text, &url, state.port);
        eprintln!(
            "[proxy] rewritten playlist:\n{}",
            &rewritten[..rewritten.len().min(500)]
        );
        let body_bytes = rewritten.into_bytes();
        cache_playlist(
            &state,
            &url,
            CachedPlaylist::new(status_u16, content_type.clone(), body_bytes.clone()),
        )
        .await;
        let len = body_bytes.len();
        let mut reply = warp::reply::Response::new(warp::hyper::Body::from(body_bytes));
        *reply.status_mut() = status;
        insert_common_headers(reply.headers_mut(), &content_type, len);
        return Ok(reply);
    }

    let body = match response.bytes().await {
        Ok(b) => b,
        Err(e) => {
            eprintln!("[proxy] segment body read error: {}", e);
            return Ok(warp::reply::with_status(
                format!("Body read error: {}", e),
                warp::http::StatusCode::BAD_GATEWAY,
            )
            .into_response());
        }
    };
    let resolved_ct = resolve_content_type(&content_type, &url);
    let body = body.to_vec();

    let len = body.len();
    eprintln!(
        "[proxy] serving segment {} bytes, content_type={} (was {})",
        len, resolved_ct, content_type
    );
    let mut reply = warp::reply::Response::new(warp::hyper::Body::from(body));
    *reply.status_mut() = status;
    insert_common_headers(reply.headers_mut(), &resolved_ct, len);
    Ok(reply)
}

async fn handle_warm(
    params: HashMap<String, String>,
    state: ProxyState,
) -> Result<warp::reply::Response, warp::Rejection> {
    let url = match params.get("url") {
        Some(u) => u.clone(),
        None => {
            return Ok(warp::reply::with_status(
                "Missing 'url' parameter",
                warp::http::StatusCode::BAD_REQUEST,
            )
            .into_response())
        }
    };

    if let Err(reason) = validate_stream_url(&url) {
        return Ok(
            warp::reply::with_status(reason.to_string(), warp::http::StatusCode::FORBIDDEN)
                .into_response(),
        );
    }

    maybe_schedule_host_warm(state.clone(), &url).await;
    let mode = params
        .get("mode")
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_else(|| "auto".to_string());
    let segment_count = params
        .get("segment_count")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(1)
        .max(1)
        .min(3);
    match mode.as_str() {
        "conn" => {}
        "playlist" => {
            if is_playlist_url(&url) {
                let _ = warm_playlist_cache(state, url).await;
            }
        }
        "segment" => {
            if is_playlist_url(&url) {
                let _ = warm_playlist_cache(state.clone(), url.clone()).await;
                let _ = prefetch_playlist_segments(state, url, segment_count).await;
            }
        }
        _ => {
            if is_playlist_url(&url) {
                let _ = warm_playlist_cache(state, url).await;
            }
        }
    }

    Ok(warp::reply::with_status("", warp::http::StatusCode::NO_CONTENT).into_response())
}

fn with_proxy_state(
    state: ProxyState,
) -> impl Filter<Extract = (ProxyState,), Error = Infallible> + Clone {
    warp::any().map(move || state.clone())
}
