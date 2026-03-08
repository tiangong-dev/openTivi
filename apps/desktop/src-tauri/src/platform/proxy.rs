use std::collections::HashMap;
use std::convert::Infallible;
use std::net::TcpListener;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::RwLock;
use url::Url;
use warp::{Filter, Reply};

const PLAYLIST_CACHE_TTL: Duration = Duration::from_secs(2);
const PLAYLIST_CACHE_MAX_ENTRIES: usize = 64;
const HOST_WARM_TTL: Duration = Duration::from_secs(12);
const SEGMENT_PREFETCH_TIMEOUT: Duration = Duration::from_millis(1500);
const SEGMENT_PREFETCH_RANGE: &str = "bytes=0-65535";

#[derive(Clone)]
struct ProxyState {
    client: reqwest::Client,
    playlist_cache: Arc<RwLock<HashMap<String, CachedPlaylist>>>,
    host_warm_marks: Arc<RwLock<HashMap<String, Instant>>>,
}

#[derive(Clone)]
struct CachedPlaylist {
    status: u16,
    content_type: String,
    body: Vec<u8>,
    created_at: Instant,
    expires_at: Instant,
}

/// Start a local HTTP proxy server for streaming.
/// Returns the port it's listening on.
pub fn start_proxy_server() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("Failed to bind proxy port");
    let port = listener.local_addr().unwrap().port();
    drop(listener);

    let client = reqwest::Client::builder()
        .pool_max_idle_per_host(8)
        .build()
        .expect("Failed to create proxy HTTP client");
    let state = ProxyState {
        client,
        playlist_cache: Arc::new(RwLock::new(HashMap::new())),
        host_warm_marks: Arc::new(RwLock::new(HashMap::new())),
    };

    let stream_route = warp::path("stream")
        .and(warp::query::<HashMap<String, String>>())
        .and(with_proxy_state(state.clone()))
        .and_then(handle_proxy);
    let warm_route = warp::path("warm")
        .and(warp::query::<HashMap<String, String>>())
        .and(with_proxy_state(state))
        .and_then(handle_warm);
    let route = stream_route.or(warm_route);

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create proxy runtime");
        rt.block_on(async move {
            warp::serve(route).run(([127, 0, 0, 1], port)).await;
        });
    });

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

    maybe_schedule_host_warm(state.clone(), &url).await;

    if let Some(cached) = get_cached_playlist_response(&state, &url).await {
        return Ok(cached);
    }

    let response = match state.client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
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

    if is_playlist {
        let body = match response.bytes().await {
            Ok(b) => b,
            Err(e) => {
                return Ok(warp::reply::with_status(
                    format!("Body read error: {}", e),
                    warp::http::StatusCode::BAD_GATEWAY,
                )
                .into_response());
            }
        };

        let text = String::from_utf8_lossy(&body);
        let rewritten = rewrite_m3u8(&text, &url);
        let body_bytes = rewritten.into_bytes();
        cache_playlist(
            &state,
            &url,
            CachedPlaylist {
                status: status_u16,
                content_type: content_type.clone(),
                body: body_bytes.clone(),
                created_at: Instant::now(),
                expires_at: Instant::now() + PLAYLIST_CACHE_TTL,
            },
        )
        .await;
        let mut reply = warp::reply::Response::new(warp::hyper::Body::from(body_bytes));
        *reply.status_mut() = status;
        insert_common_headers(reply.headers_mut(), &content_type);
        return Ok(reply);
    }

    let mut reply =
        warp::reply::Response::new(warp::hyper::Body::wrap_stream(response.bytes_stream()));
    *reply.status_mut() = status;
    insert_common_headers(reply.headers_mut(), &content_type);
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

async fn get_cached_playlist_response(
    state: &ProxyState,
    url: &str,
) -> Option<warp::reply::Response> {
    let now = Instant::now();
    {
        let cache = state.playlist_cache.read().await;
        if let Some(item) = cache.get(url) {
            if item.expires_at > now {
                return Some(build_cached_playlist_response(item));
            }
        }
    }
    let mut cache = state.playlist_cache.write().await;
    if let Some(item) = cache.get(url) {
        if item.expires_at <= now {
            cache.remove(url);
        } else {
            return Some(build_cached_playlist_response(item));
        }
    }
    None
}

fn build_cached_playlist_response(item: &CachedPlaylist) -> warp::reply::Response {
    let status = warp::http::StatusCode::from_u16(item.status)
        .unwrap_or(warp::http::StatusCode::BAD_GATEWAY);
    let mut reply = warp::reply::Response::new(warp::hyper::Body::from(item.body.clone()));
    *reply.status_mut() = status;
    insert_common_headers(reply.headers_mut(), &item.content_type);
    reply
}

async fn cache_playlist(state: &ProxyState, url: &str, item: CachedPlaylist) {
    let mut cache = state.playlist_cache.write().await;
    cache.insert(url.to_string(), item);
    if cache.len() <= PLAYLIST_CACHE_MAX_ENTRIES {
        return;
    }
    let mut entries: Vec<(String, Instant)> = cache
        .iter()
        .map(|(key, value)| (key.clone(), value.created_at))
        .collect();
    entries.sort_by_key(|(_key, created_at)| *created_at);
    let remove_count = cache.len().saturating_sub(PLAYLIST_CACHE_MAX_ENTRIES);
    for (key, _created_at) in entries.into_iter().take(remove_count) {
        cache.remove(&key);
    }
}

async fn warm_playlist_cache(state: ProxyState, url: String) -> Result<(), ()> {
    if get_cached_playlist_response(&state, &url).await.is_some() {
        return Ok(());
    }
    let response = state.client.get(&url).send().await.map_err(|_| ())?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    if !is_playlist_content_type(&content_type) && !is_playlist_url(&url) {
        return Ok(());
    }
    let body = response.bytes().await.map_err(|_| ())?;
    let text = String::from_utf8_lossy(&body);
    let rewritten = rewrite_m3u8(&text, &url).into_bytes();
    cache_playlist(
        &state,
        &url,
        CachedPlaylist {
            status,
            content_type,
            body: rewritten,
            created_at: Instant::now(),
            expires_at: Instant::now() + PLAYLIST_CACHE_TTL,
        },
    )
    .await;
    Ok(())
}

async fn prefetch_playlist_segments(
    state: ProxyState,
    playlist_url: String,
    segment_count: usize,
) -> Result<(), ()> {
    let response = state.client.get(&playlist_url).send().await.map_err(|_| ())?;
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    if !is_playlist_content_type(&content_type) && !is_playlist_url(&playlist_url) {
        return Ok(());
    }
    let body = response.bytes().await.map_err(|_| ())?;
    let playlist_text = String::from_utf8_lossy(&body);
    let segment_urls = extract_segment_urls(&playlist_text, &playlist_url, segment_count);
    for segment_url in segment_urls {
        let _ = prefetch_segment(state.client.clone(), segment_url).await;
    }
    Ok(())
}

fn extract_segment_urls(content: &str, base_url: &str, segment_count: usize) -> Vec<String> {
    let base = base_url
        .rfind('/')
        .map(|i| &base_url[..=i])
        .unwrap_or(base_url);
    let mut urls = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let url = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            trimmed.to_string()
        } else {
            format!("{}{}", base, trimmed)
        };
        urls.push(url);
        if urls.len() >= segment_count {
            break;
        }
    }
    urls
}

async fn prefetch_segment(client: reqwest::Client, segment_url: String) -> Result<(), ()> {
    let request = client
        .get(segment_url)
        .header(reqwest::header::RANGE, SEGMENT_PREFETCH_RANGE)
        .send();
    let mut response = match tokio::time::timeout(SEGMENT_PREFETCH_TIMEOUT, request).await {
        Ok(Ok(resp)) => resp,
        _ => return Err(()),
    };
    let _ = tokio::time::timeout(SEGMENT_PREFETCH_TIMEOUT, response.chunk()).await;
    Ok(())
}

async fn maybe_schedule_host_warm(state: ProxyState, raw_url: &str) {
    let parsed = match Url::parse(raw_url) {
        Ok(value) => value,
        Err(_) => return,
    };
    let host = match parsed.host_str() {
        Some(value) => value,
        None => return,
    };
    let port = parsed.port_or_known_default().unwrap_or_default();
    let host_key = format!("{}://{}:{}", parsed.scheme(), host, port);
    let now = Instant::now();
    {
        let mut marks = state.host_warm_marks.write().await;
        if let Some(last) = marks.get(&host_key) {
            if now.duration_since(*last) < HOST_WARM_TTL {
                return;
            }
        }
        marks.insert(host_key, now);
    }
    let origin = if parsed.port().is_some() {
        format!("{}://{}:{}/", parsed.scheme(), host, port)
    } else {
        format!("{}://{}/", parsed.scheme(), host)
    };
    let client = state.client.clone();
    tokio::spawn(async move {
        let _ = client.head(origin).send().await;
    });
}

fn is_playlist_content_type(content_type: &str) -> bool {
    let lower = content_type.to_ascii_lowercase();
    lower.contains("mpegurl") || lower.contains("m3u")
}

fn is_playlist_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.contains(".m3u8") || lower.contains("m3u8")
}

fn insert_common_headers(headers: &mut warp::http::HeaderMap, content_type: &str) {
    if let Ok(value) = warp::http::HeaderValue::from_str(content_type) {
        headers.insert(warp::http::header::CONTENT_TYPE, value);
    }
    headers.insert(
        warp::http::header::ACCESS_CONTROL_ALLOW_ORIGIN,
        warp::http::HeaderValue::from_static("*"),
    );
}

/// Rewrite URLs inside m3u8 playlists to go through the proxy.
fn rewrite_m3u8(content: &str, base_url: &str) -> String {
    let base = base_url
        .rfind('/')
        .map(|i| &base_url[..=i])
        .unwrap_or(base_url);

    content
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                line.to_string()
            } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                format!("/stream?url={}", urlencoding::encode(trimmed))
            } else {
                // Relative URL — resolve against base
                let absolute = format!("{}{}", base, trimmed);
                format!("/stream?url={}", urlencoding::encode(&absolute))
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const M3U8_CONTENT: &str = "\
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10,
http://example.com/seg1.ts
#EXTINF:10,
segment2.ts";

    const BASE_URL: &str = "http://example.com/live/playlist.m3u8";

    #[test]
    fn test_rewrite_absolute_urls() {
        let result = rewrite_m3u8(M3U8_CONTENT, BASE_URL);
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(
            lines[4],
            format!(
                "/stream?url={}",
                urlencoding::encode("http://example.com/seg1.ts")
            )
        );
    }

    #[test]
    fn test_rewrite_relative_urls() {
        let result = rewrite_m3u8(M3U8_CONTENT, BASE_URL);
        let lines: Vec<&str> = result.lines().collect();
        let expected_absolute = "http://example.com/live/segment2.ts";
        assert_eq!(
            lines[6],
            format!("/stream?url={}", urlencoding::encode(expected_absolute))
        );
    }

    #[test]
    fn test_rewrite_preserves_comments() {
        let result = rewrite_m3u8(M3U8_CONTENT, BASE_URL);
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(lines[0], "#EXTM3U");
        assert_eq!(lines[1], "#EXT-X-VERSION:3");
        assert_eq!(lines[2], "#EXT-X-TARGETDURATION:10");
        assert_eq!(lines[3], "#EXTINF:10,");
        assert_eq!(lines[5], "#EXTINF:10,");
    }

    #[test]
    fn test_rewrite_preserves_empty_lines() {
        let content = "#EXTM3U\n\n#EXTINF:10,\nhttp://example.com/seg.ts";
        let result = rewrite_m3u8(content, BASE_URL);
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(lines[1], "");
    }

    #[test]
    fn test_extract_segment_urls_handles_absolute_and_relative() {
        let content = "#EXTM3U\n#EXTINF:10,\nsegment1.ts\n#EXTINF:10,\nhttps://cdn.example.com/segment2.ts";
        let urls = extract_segment_urls(content, BASE_URL, 2);
        assert_eq!(
            urls,
            vec![
                "http://example.com/live/segment1.ts".to_string(),
                "https://cdn.example.com/segment2.ts".to_string()
            ]
        );
    }
}
