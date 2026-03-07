use std::collections::HashMap;
use std::net::TcpListener;

use warp::Filter;

/// Start a local HTTP proxy server for streaming.
/// Returns the port it's listening on.
pub fn start_proxy_server() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("Failed to bind proxy port");
    let port = listener.local_addr().unwrap().port();
    drop(listener);

    let route = warp::path("stream")
        .and(warp::query::<HashMap<String, String>>())
        .and_then(handle_proxy);

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
) -> Result<Box<dyn warp::Reply>, warp::Rejection> {
    let url = match params.get("url") {
        Some(u) => u.clone(),
        None => {
            return Ok(Box::new(warp::reply::with_status(
                "Missing 'url' parameter",
                warp::http::StatusCode::BAD_REQUEST,
            )))
        }
    };

    let client = reqwest::Client::new();
    let response = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            return Ok(Box::new(warp::reply::with_status(
                format!("Fetch error: {}", e),
                warp::http::StatusCode::BAD_GATEWAY,
            )));
        }
    };

    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();

    let body = match response.bytes().await {
        Ok(b) => b,
        Err(e) => {
            return Ok(Box::new(warp::reply::with_status(
                format!("Body read error: {}", e),
                warp::http::StatusCode::BAD_GATEWAY,
            )));
        }
    };

    // For m3u8 playlists, rewrite absolute URLs to go through proxy
    let body_bytes = if content_type.contains("mpegurl") || content_type.contains("m3u") {
        let text = String::from_utf8_lossy(&body);
        let rewritten = rewrite_m3u8(&text, &url);
        rewritten.into_bytes()
    } else {
        body.to_vec()
    };

    let reply = warp::http::Response::builder()
        .status(status)
        .header("content-type", &content_type)
        .header("access-control-allow-origin", "*")
        .body(body_bytes)
        .unwrap();

    Ok(Box::new(reply))
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
}
