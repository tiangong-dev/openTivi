use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::RwLock;
use url::Url;
use super::rewrite::{extract_segment_urls, is_playlist_content_type, is_playlist_url, rewrite_m3u8};

const PLAYLIST_CACHE_TTL: Duration = Duration::from_secs(2);
const PLAYLIST_CACHE_MAX_ENTRIES: usize = 64;
const HOST_WARM_TTL: Duration = Duration::from_secs(12);
const SEGMENT_PREFETCH_TIMEOUT: Duration = Duration::from_millis(1500);
const SEGMENT_PREFETCH_RANGE: &str = "bytes=0-65535";

#[derive(Clone)]
pub(super) struct ProxyState {
    pub(super) client: reqwest::Client,
    pub(super) port: u16,
    playlist_cache: Arc<RwLock<HashMap<String, CachedPlaylist>>>,
    host_warm_marks: Arc<RwLock<HashMap<String, Instant>>>,
}

impl ProxyState {
    pub(super) fn new(client: reqwest::Client, port: u16) -> Self {
        Self {
            client,
            port,
            playlist_cache: Arc::new(RwLock::new(HashMap::new())),
            host_warm_marks: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[derive(Clone)]
pub(super) struct CachedPlaylist {
    status: u16,
    content_type: String,
    body: Vec<u8>,
    created_at: Instant,
    expires_at: Instant,
}

impl CachedPlaylist {
    pub(super) fn new(status: u16, content_type: String, body: Vec<u8>) -> Self {
        let now = Instant::now();
        Self {
            status,
            content_type,
            body,
            created_at: now,
            expires_at: now + PLAYLIST_CACHE_TTL,
        }
    }
}

pub(super) fn build_proxy_http_client() -> reqwest::Client {
    let mut default_headers = reqwest::header::HeaderMap::new();
    default_headers.insert(
        reqwest::header::ACCEPT_ENCODING,
        reqwest::header::HeaderValue::from_static("identity"),
    );
    reqwest::Client::builder()
        .pool_max_idle_per_host(8)
        .gzip(false)
        .default_headers(default_headers)
        .build()
        .expect("Failed to create proxy HTTP client")
}

pub(super) async fn get_cached_playlist_response(
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
    let len = item.body.len();
    let mut reply = warp::reply::Response::new(warp::hyper::Body::from(item.body.clone()));
    *reply.status_mut() = status;
    super::rewrite::insert_common_headers(reply.headers_mut(), &item.content_type, len);
    reply
}

pub(super) async fn cache_playlist(state: &ProxyState, url: &str, item: CachedPlaylist) {
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

pub(super) async fn warm_playlist_cache(state: ProxyState, url: String) -> Result<(), ()> {
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
    let rewritten = rewrite_m3u8(&text, &url, state.port).into_bytes();
    cache_playlist(
        &state,
        &url,
        CachedPlaylist::new(status, content_type, rewritten),
    )
    .await;
    Ok(())
}

pub(super) async fn prefetch_playlist_segments(
    state: ProxyState,
    playlist_url: String,
    segment_count: usize,
) -> Result<usize, ()> {
    let response = state
        .client
        .get(&playlist_url)
        .send()
        .await
        .map_err(|_| ())?;
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    if !is_playlist_content_type(&content_type) && !is_playlist_url(&playlist_url) {
        return Ok(0);
    }
    let body = response.bytes().await.map_err(|_| ())?;
    let playlist_text = String::from_utf8_lossy(&body);
    let segment_urls = extract_segment_urls(&playlist_text, &playlist_url, segment_count);
    let mut prefetched = 0usize;
    for segment_url in segment_urls {
        if prefetch_segment(state.client.clone(), segment_url)
            .await
            .is_ok()
        {
            prefetched += 1;
        }
    }
    Ok(prefetched)
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

pub(super) async fn maybe_schedule_host_warm(state: ProxyState, raw_url: &str) {
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
