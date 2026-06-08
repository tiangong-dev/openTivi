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
    cache_playlist, get_cached_playlist_response, maybe_schedule_host_warm, playlist_cache_key,
    prefetch_playlist_segments, stream_headers, warm_playlist_cache, CachedPlaylist, ProxyState,
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

    let ua = params
        .get("ua")
        .filter(|v| !v.is_empty())
        .cloned();
    let referer = params
        .get("referer")
        .filter(|v| !v.is_empty())
        .cloned();

    eprintln!("[proxy] /stream request url={}", url);

    if let Err(reason) = validate_stream_url(&url) {
        eprintln!("[proxy] URL rejected: {}", reason);
        return Ok(
            warp::reply::with_status(reason.to_string(), warp::http::StatusCode::FORBIDDEN)
                .into_response(),
        );
    }

    maybe_schedule_host_warm(state.clone(), &url).await;

    let cache_key = playlist_cache_key(&url, ua.as_deref(), referer.as_deref());

    if let Some(cached) = get_cached_playlist_response(&state, &cache_key).await {
        eprintln!("[proxy] serving cached playlist for {}", url);
        return Ok(cached);
    }

    // For playlists, use GET; for segments, probe with HEAD first
    let is_playlist = is_playlist_url(&url);

    if is_playlist {
        let mut rb = state.client.get(&url);
        for (k, v) in stream_headers(&ua, &referer) {
            rb = rb.header(k, v);
        }
        let response = match rb.send().await {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[proxy] fetch error: {}", e);
                return Ok(warp::reply::with_status(
                    format!("Fetch error: {}", e),
                    warp::http::StatusCode::BAD_GATEWAY,
                )
                .into_response());
            }
        };
        let status_u16 = response.status().as_u16();
        let status = warp::http::StatusCode::from_u16(status_u16)
            .unwrap_or(warp::http::StatusCode::BAD_GATEWAY);
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();

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
        let rewritten = rewrite_m3u8(&text, &url, state.port, ua.as_deref(), referer.as_deref());
        let body_bytes = rewritten.into_bytes();
        cache_playlist(
            &state,
            &cache_key,
            CachedPlaylist::new(status_u16, content_type.clone(), body_bytes.clone()),
        )
        .await;
        let len = body_bytes.len();
        let mut reply = warp::reply::Response::new(warp::hyper::Body::from(body_bytes));
        *reply.status_mut() = status;
        insert_common_headers(reply.headers_mut(), &content_type, len);
        return Ok(reply);
    }

    // --- Segment handling: use HEAD to probe, then accelerated concurrent download ---
    const CHUNK_THRESHOLD: u64 = 1_000_000;
    const CONCURRENT_CHUNKS: u64 = 4;

    let head_resp = {
        let mut rb = state.client.head(&url);
        for (k, v) in stream_headers(&ua, &referer) {
            rb = rb.header(k, v);
        }
        rb.send().await
    };
    let head_resp = match head_resp {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[proxy] HEAD error: {}", e);
            return Ok(warp::reply::with_status(
                format!("Fetch error: {}", e),
                warp::http::StatusCode::BAD_GATEWAY,
            )
            .into_response());
        }
    };

    let status_u16 = head_resp.status().as_u16();
    let status = warp::http::StatusCode::from_u16(status_u16)
        .unwrap_or(warp::http::StatusCode::BAD_GATEWAY);
    let content_type = head_resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let resolved_ct = resolve_content_type(&content_type, &url);
    let accept_ranges = head_resp
        .headers()
        .get("accept-ranges")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.contains("bytes"))
        .unwrap_or(false);
    let content_length = head_resp
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok());
    drop(head_resp);

    if accept_ranges && content_length.map_or(false, |len| len >= CHUNK_THRESHOLD) {
        let total_len = content_length.unwrap();
        eprintln!(
            "[proxy] accelerated: {} bytes / {} chunks",
            total_len, CONCURRENT_CHUNKS
        );

        // Spawn all chunk downloads concurrently
        let chunk_size = total_len / CONCURRENT_CHUNKS;
        let mut handles = Vec::with_capacity(CONCURRENT_CHUNKS as usize);
        for i in 0..CONCURRENT_CHUNKS {
            let start = i * chunk_size;
            let end = if i == CONCURRENT_CHUNKS - 1 {
                total_len - 1
            } else {
                (i + 1) * chunk_size - 1
            };
            let client = state.client.clone();
            let segment_url = url.clone();
            let ua = ua.clone();
            let referer = referer.clone();
            handles.push(tokio::spawn(async move {
                let range = format!("bytes={}-{}", start, end);
                let mut rb = client
                    .get(&segment_url)
                    .header(reqwest::header::RANGE, &range);
                for (k, v) in stream_headers(&ua, &referer) {
                    rb = rb.header(k, v);
                }
                let resp = rb.send().await.map_err(|e| e.to_string())?;
                resp.bytes().await.map_err(|e| e.to_string())
            }));
        }

        // Await chunks IN ORDER and assemble. All downloads run concurrently,
        // but we await handle[0] first so the total wall time = slowest chunk.
        let mut full_body = Vec::with_capacity(total_len as usize);
        for (i, handle) in handles.into_iter().enumerate() {
            match handle.await {
                Ok(Ok(bytes)) => {
                    eprintln!("[proxy] chunk {} done: {} bytes", i, bytes.len());
                    full_body.extend_from_slice(&bytes);
                }
                Ok(Err(e)) => {
                    eprintln!("[proxy] chunk {} error: {}", i, e);
                    return Ok(warp::reply::with_status(
                        format!("Chunk error: {}", e),
                        warp::http::StatusCode::BAD_GATEWAY,
                    )
                    .into_response());
                }
                Err(e) => {
                    eprintln!("[proxy] chunk {} join error: {}", i, e);
                    return Ok(warp::reply::with_status(
                        "Internal error",
                        warp::http::StatusCode::INTERNAL_SERVER_ERROR,
                    )
                    .into_response());
                }
            }
        }

        let len = full_body.len();
        eprintln!("[proxy] accelerated complete: {} bytes", len);
        let mut reply = warp::reply::Response::new(warp::hyper::Body::from(full_body));
        *reply.status_mut() = status;
        insert_common_headers(reply.headers_mut(), &resolved_ct, len);
        return Ok(reply);
    }

    // Fallback: single GET, stream through
    eprintln!("[proxy] fallback stream for {}", &url[..url.len().min(80)]);
    let response = {
        let mut rb = state.client.get(&url);
        for (k, v) in stream_headers(&ua, &referer) {
            rb = rb.header(k, v);
        }
        rb.send().await
    };
    let response = match response {
        Ok(r) => r,
        Err(e) => {
            return Ok(warp::reply::with_status(
                format!("Fetch error: {}", e),
                warp::http::StatusCode::BAD_GATEWAY,
            )
            .into_response());
        }
    };
    let byte_stream = response.bytes_stream();
    let body = warp::hyper::Body::wrap_stream(byte_stream);
    let mut reply = warp::reply::Response::new(body);
    *reply.status_mut() = status;
    if let Ok(value) = warp::http::HeaderValue::from_str(&resolved_ct) {
        reply
            .headers_mut()
            .insert(warp::http::header::CONTENT_TYPE, value);
    }
    if let Some(len) = content_length {
        reply.headers_mut().insert(
            warp::http::header::CONTENT_LENGTH,
            warp::http::HeaderValue::from(len as usize),
        );
    }
    reply.headers_mut().insert(
        warp::http::header::ACCESS_CONTROL_ALLOW_ORIGIN,
        warp::http::HeaderValue::from_static("*"),
    );
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
