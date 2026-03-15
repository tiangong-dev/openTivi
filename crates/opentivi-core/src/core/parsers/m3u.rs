use crate::core::models::channel::ParsedChannel;
use crate::error::{AppError, AppResult};

/// Parse M3U content (extended M3U format) into a list of channels.
pub fn parse_m3u(content: &str) -> AppResult<Vec<ParsedChannel>> {
    let mut channels = Vec::new();
    let mut lines = content.lines().peekable();

    // Skip BOM if present
    if let Some(first) = lines.peek() {
        if !first.contains("#EXTM3U") && !first.starts_with("#EXTINF") {
            lines.next();
        }
    }

    while let Some(line) = lines.next() {
        let line = line.trim();
        if line.starts_with("#EXTINF:") {
            let attrs = parse_extinf_attrs(line);
            let name = parse_extinf_name(line);

            // Next non-comment, non-empty line should be the URL
            let url = loop {
                match lines.next() {
                    Some(l) => {
                        let l = l.trim();
                        if !l.is_empty() && !l.starts_with('#') {
                            break l.to_string();
                        }
                    }
                    None => return Err(AppError::Parse("Unexpected end of M3U file".into())),
                }
            };

            let tvg_id = attrs.get("tvg-id").cloned();
            let tvg_name = attrs.get("tvg-name").cloned();
            let logo_url = attrs.get("tvg-logo").cloned();
            let group_name = attrs.get("group-title").cloned();
            let channel_number = attrs.get("tvg-chno").cloned();

            let channel_key = if let Some(ref tid) = tvg_id {
                if !tid.is_empty() {
                    tid.clone()
                } else {
                    format!("{}|{}", name, url)
                }
            } else {
                format!("{}|{}", name, url)
            };

            channels.push(ParsedChannel {
                channel_key,
                external_id: None,
                name,
                channel_number,
                group_name,
                tvg_id,
                tvg_name,
                logo_url,
                stream_url: url,
                container_extension: None,
                is_live: true,
            });
        }
    }

    Ok(channels)
}

fn parse_extinf_attrs(line: &str) -> std::collections::HashMap<String, String> {
    let mut attrs = std::collections::HashMap::new();
    let extinf_meta = line.split_once(',').map(|(meta, _)| meta).unwrap_or(line);
    let attrs_part = extinf_meta
        .split_once(' ')
        .map(|(_, rest)| rest)
        .unwrap_or("");
    let chars: Vec<char> = attrs_part.chars().collect();
    let mut i = 0usize;

    while i < chars.len() {
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }

        let key_start = i;
        while i < chars.len()
            && (chars[i].is_ascii_alphanumeric() || chars[i] == '-' || chars[i] == '_')
        {
            i += 1;
        }
        if key_start == i {
            i += 1;
            continue;
        }
        let key: String = chars[key_start..i].iter().collect();

        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i >= chars.len() || chars[i] != '=' {
            continue;
        }
        i += 1;
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i >= chars.len() || chars[i] != '"' {
            continue;
        }
        i += 1;

        let value_start = i;
        while i < chars.len() && chars[i] != '"' {
            i += 1;
        }
        if i > value_start {
            let value: String = chars[value_start..i].iter().collect();
            attrs.insert(key, value);
        }
        if i < chars.len() && chars[i] == '"' {
            i += 1;
        }
    }
    attrs
}

fn parse_extinf_name(line: &str) -> String {
    // Name is after the last comma in #EXTINF line
    if let Some(pos) = line.rfind(',') {
        line[pos + 1..].trim().to_string()
    } else {
        "Unknown".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_M3U: &str = "#EXTM3U\n\
#EXTINF:-1 tvg-chno=\"1\" tvg-id=\"ch1\" tvg-name=\"Channel 1\" tvg-logo=\"http://logo.png\" group-title=\"News\",Channel One\n\
http://example.com/stream1\n\
#EXTINF:-1 tvg-chno=\"2\" group-title=\"Sports\",Channel Two\n\
http://example.com/stream2\n";

    #[test]
    fn test_parse_basic_m3u() {
        let channels = parse_m3u(TEST_M3U).unwrap();
        assert_eq!(channels.len(), 2);
        assert_eq!(channels[0].name, "Channel One");
        assert_eq!(channels[0].stream_url, "http://example.com/stream1");
        assert_eq!(channels[0].group_name.as_deref(), Some("News"));
        assert_eq!(channels[1].name, "Channel Two");
        assert_eq!(channels[1].stream_url, "http://example.com/stream2");
        assert_eq!(channels[1].group_name.as_deref(), Some("Sports"));
    }

    #[test]
    fn test_parse_m3u_with_tvg_attrs() {
        let channels = parse_m3u(TEST_M3U).unwrap();
        let ch = &channels[0];
        assert_eq!(ch.tvg_id.as_deref(), Some("ch1"));
        assert_eq!(ch.tvg_name.as_deref(), Some("Channel 1"));
        assert_eq!(ch.logo_url.as_deref(), Some("http://logo.png"));
        assert_eq!(ch.group_name.as_deref(), Some("News"));
        assert_eq!(ch.channel_number.as_deref(), Some("1"));
    }

    #[test]
    fn test_parse_m3u_channel_key_uses_tvg_id() {
        let channels = parse_m3u(TEST_M3U).unwrap();
        assert_eq!(channels[0].channel_key, "ch1");
    }

    #[test]
    fn test_parse_m3u_channel_key_fallback() {
        let channels = parse_m3u(TEST_M3U).unwrap();
        // Channel Two has no tvg-id so channel_key falls back to "name|url"
        assert_eq!(
            channels[1].channel_key,
            "Channel Two|http://example.com/stream2"
        );
    }

    #[test]
    fn test_parse_empty_m3u() {
        let channels = parse_m3u("").unwrap();
        assert_eq!(channels.len(), 0);
    }

    #[test]
    fn test_parse_m3u_with_bom() {
        let content = format!("\u{FEFF}{}", TEST_M3U);
        let channels = parse_m3u(&content).unwrap();
        assert_eq!(channels.len(), 2);
        assert_eq!(channels[0].name, "Channel One");
    }
}
