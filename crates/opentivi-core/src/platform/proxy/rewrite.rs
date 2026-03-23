use url::Url;

const ALLOWED_SCHEMES: &[&str] = &["http", "https"];

pub(super) fn is_playlist_content_type(content_type: &str) -> bool {
    let lower = content_type.to_ascii_lowercase();
    lower.contains("mpegurl") || lower.contains("m3u")
}

pub(super) fn is_playlist_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.contains(".m3u8") || lower.contains("m3u8")
}

pub(super) fn resolve_content_type(upstream_content_type: &str, url: &str) -> String {
    let ct_lower = upstream_content_type.to_ascii_lowercase();
    if !ct_lower.starts_with("application/octet-stream") {
        return upstream_content_type.to_string();
    }
    let path = url.split('?').next().unwrap_or(url);
    if path.ends_with(".ts") {
        "video/MP2T".to_string()
    } else if path.ends_with(".aac") {
        "audio/aac".to_string()
    } else if path.ends_with(".mp4") || path.ends_with(".m4s") {
        "video/mp4".to_string()
    } else if path.ends_with(".m4a") {
        "audio/mp4".to_string()
    } else {
        upstream_content_type.to_string()
    }
}

pub(super) fn insert_common_headers(
    headers: &mut warp::http::HeaderMap,
    content_type: &str,
    body_len: usize,
) {
    if let Ok(value) = warp::http::HeaderValue::from_str(content_type) {
        headers.insert(warp::http::header::CONTENT_TYPE, value);
    }
    headers.insert(
        warp::http::header::CONTENT_LENGTH,
        warp::http::HeaderValue::from(body_len),
    );
    headers.insert(
        warp::http::header::ACCESS_CONTROL_ALLOW_ORIGIN,
        warp::http::HeaderValue::from_static("*"),
    );
}

pub(super) fn validate_stream_url(raw: &str) -> Result<(), &'static str> {
    let parsed = Url::parse(raw).map_err(|_| "Invalid URL")?;
    let scheme = parsed.scheme().to_ascii_lowercase();
    if !ALLOWED_SCHEMES.contains(&scheme.as_str()) {
        return Err("Scheme not allowed");
    }
    let host = parsed.host_str().ok_or("Missing host")?;
    let lower = host.to_ascii_lowercase();
    if lower == "localhost"
        || lower == "127.0.0.1"
        || lower == "[::1]"
        || lower == "0.0.0.0"
        || lower.ends_with(".local")
    {
        return Err("Localhost access not allowed");
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        if is_private_ip(ip) {
            return Err("Private network access not allowed");
        }
    }
    Ok(())
}

fn is_private_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_documentation()
                || v4.is_unspecified()
        }
        std::net::IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unicast_link_local()
                || v6.is_unique_local()
                || v6.is_unspecified()
        }
    }
}

/// Rewrite URLs inside m3u8 playlists to go through the proxy.
pub(super) fn rewrite_m3u8(content: &str, base_url: &str, proxy_port: u16) -> String {
    let base = base_url
        .rfind('/')
        .map(|i| &base_url[..=i])
        .unwrap_or(base_url);
    let proxy_base = format!("http://127.0.0.1:{}", proxy_port);

    content
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                line.to_string()
            } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                format!("{}/stream?url={}", proxy_base, urlencoding::encode(trimmed))
            } else {
                let absolute = format!("{}{}", base, trimmed);
                format!("{}/stream?url={}", proxy_base, urlencoding::encode(&absolute))
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub(super) fn extract_segment_urls(
    content: &str,
    base_url: &str,
    segment_count: usize,
) -> Vec<String> {
    let base = match Url::parse(base_url) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    let mut urls = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let resolved = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            Url::parse(trimmed).ok()
        } else {
            base.join(trimmed).ok()
        };
        if let Some(url) = resolved {
            urls.push(url.to_string());
        }
        if urls.len() >= segment_count {
            break;
        }
    }
    urls
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
    const TEST_PORT: u16 = 12345;

    #[test]
    fn test_rewrite_absolute_urls() {
        let result = rewrite_m3u8(M3U8_CONTENT, BASE_URL, TEST_PORT);
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(
            lines[4],
            format!(
                "http://127.0.0.1:{}/stream?url={}",
                TEST_PORT,
                urlencoding::encode("http://example.com/seg1.ts")
            )
        );
    }

    #[test]
    fn test_rewrite_relative_urls() {
        let result = rewrite_m3u8(M3U8_CONTENT, BASE_URL, TEST_PORT);
        let lines: Vec<&str> = result.lines().collect();
        let expected_absolute = "http://example.com/live/segment2.ts";
        assert_eq!(
            lines[6],
            format!(
                "http://127.0.0.1:{}/stream?url={}",
                TEST_PORT,
                urlencoding::encode(expected_absolute)
            )
        );
    }

    #[test]
    fn test_rewrite_preserves_comments() {
        let result = rewrite_m3u8(M3U8_CONTENT, BASE_URL, TEST_PORT);
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
        let result = rewrite_m3u8(content, BASE_URL, TEST_PORT);
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(lines[1], "");
    }

    #[test]
    fn test_extract_segment_urls_handles_absolute_and_relative() {
        let content =
            "#EXTM3U\n#EXTINF:10,\nsegment1.ts\n#EXTINF:10,\nhttps://cdn.example.com/segment2.ts";
        let urls = extract_segment_urls(content, BASE_URL, 2);
        assert_eq!(
            urls,
            vec![
                "http://example.com/live/segment1.ts".to_string(),
                "https://cdn.example.com/segment2.ts".to_string()
            ]
        );
    }

    #[test]
    fn test_extract_segment_urls_handles_root_and_query() {
        let content = "#EXTM3U\n#EXTINF:10,\n/seg1.ts?token=abc\n#EXTINF:10,\nseg2.ts?token=def";
        let urls = extract_segment_urls(content, BASE_URL, 2);
        assert_eq!(
            urls,
            vec![
                "http://example.com/seg1.ts?token=abc".to_string(),
                "http://example.com/live/seg2.ts?token=def".to_string()
            ]
        );
    }

    #[test]
    fn test_validate_stream_url_rejects_private_ip() {
        assert!(validate_stream_url("http://10.1.2.3/stream.m3u8").is_err());
        assert!(validate_stream_url("http://192.168.0.10/stream.m3u8").is_err());
        assert!(validate_stream_url("http://172.16.5.1/stream.m3u8").is_err());
    }
}
