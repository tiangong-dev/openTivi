use serde::Deserialize;

use crate::core::models::channel::ParsedChannel;
use crate::error::AppResult;

#[derive(Debug, Deserialize)]
pub struct XtreamStream {
    #[serde(default)]
    pub stream_id: Option<u64>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub stream_icon: Option<String>,
    #[serde(default)]
    pub epg_channel_id: Option<String>,
    #[serde(default)]
    pub category_name: Option<String>,
    #[serde(default)]
    pub num: Option<u64>,
    #[serde(default)]
    pub container_extension: Option<String>,
}

pub fn parse_xtream_live_streams(
    json_data: &str,
    server_url: &str,
    username: &str,
    password: &str,
) -> AppResult<Vec<ParsedChannel>> {
    let streams: Vec<XtreamStream> = serde_json::from_str(json_data)?;
    let base = server_url.trim_end_matches('/');

    let channels = streams
        .into_iter()
        .filter_map(|s| {
            let stream_id = s.stream_id?;
            let name = s.name.unwrap_or_else(|| format!("Stream {}", stream_id));
            let ext = s.container_extension.as_deref().unwrap_or("ts");
            let stream_url = format!(
                "{}/live/{}/{}/{}.{}",
                base, username, password, stream_id, ext
            );

            Some(ParsedChannel {
                channel_key: format!("xtream:{}", stream_id),
                external_id: Some(stream_id.to_string()),
                name,
                channel_number: s.num.map(|n| n.to_string()),
                group_name: s.category_name,
                tvg_id: s.epg_channel_id,
                tvg_name: None,
                logo_url: s.stream_icon,
                stream_url,
                container_extension: s.container_extension,
                is_live: true,
            })
        })
        .collect();

    Ok(channels)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_xtream_basic() {
        let json = r#"[
            {"stream_id":101,"name":"Test Channel","stream_icon":"http://icon.png","epg_channel_id":"test.ch","category_name":"News","num":1,"container_extension":"m3u8"},
            {"stream_id":102,"name":"Sports Live","stream_icon":"http://icon2.png","epg_channel_id":"sport.ch","category_name":"Sports","num":2,"container_extension":"ts"}
        ]"#;
        let channels =
            parse_xtream_live_streams(json, "http://server.com", "user", "pass").unwrap();
        assert_eq!(channels.len(), 2);
        assert_eq!(channels[0].name, "Test Channel");
        assert_eq!(
            channels[0].stream_url,
            "http://server.com/live/user/pass/101.m3u8"
        );
        assert_eq!(channels[1].name, "Sports Live");
        assert_eq!(
            channels[1].stream_url,
            "http://server.com/live/user/pass/102.ts"
        );
    }

    #[test]
    fn test_parse_xtream_missing_stream_id() {
        let json = r#"[
            {"name":"No ID Channel","category_name":"News"},
            {"stream_id":200,"name":"Valid Channel","container_extension":"ts"}
        ]"#;
        let channels =
            parse_xtream_live_streams(json, "http://server.com", "user", "pass").unwrap();
        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].name, "Valid Channel");
    }

    #[test]
    fn test_parse_xtream_default_extension() {
        let json = r#"[{"stream_id":300,"name":"Default Ext"}]"#;
        let channels =
            parse_xtream_live_streams(json, "http://server.com", "user", "pass").unwrap();
        assert_eq!(channels.len(), 1);
        assert_eq!(
            channels[0].stream_url,
            "http://server.com/live/user/pass/300.ts"
        );
    }

    #[test]
    fn test_parse_empty_array() {
        let channels =
            parse_xtream_live_streams("[]", "http://server.com", "user", "pass").unwrap();
        assert_eq!(channels.len(), 0);
    }
}
