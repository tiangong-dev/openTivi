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
    #[serde(default)]
    pub tv_archive: Option<i64>,
    #[serde(default)]
    pub tv_archive_duration: Option<i64>,
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

            // Catchup is exposed via `tv_archive` (0/1 flag); only an enabled
            // archive (== 1) yields catchup. Source stays None for Xtream.
            let archive_enabled = s.tv_archive == Some(1);
            let (catchup_type, catchup_days, catchup_hours) = if archive_enabled {
                let days = s.tv_archive_duration;
                (
                    Some("default".to_string()),
                    days.map(|d| d.to_string()),
                    days.map(|d| d * 24),
                )
            } else {
                (None, None, None)
            };

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
                catchup_type,
                catchup_source: None,
                catchup_days,
                catchup_hours,
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

    // ── P0d tests (TDD red): catchup 回看字段（Xtream 解析 + 存储） ───────────
    //
    // Expected to FAIL until P0d (parse_xtream_live_streams reads tv_archive /
    // tv_archive_duration + upsert persists catchup + migration 0013 adds columns)
    // is implemented.
    //
    // We assert the contract end-to-end through the DB (parse → upsert → raw SQL
    // SELECT of catchup columns) so the test crate compiles before the
    // ParsedChannel.catchup_* fields exist. Xtream live streams expose catchup via
    // `tv_archive` (0/1 flag) and `tv_archive_duration` (days). duration N days →
    // catchup_hours N*24.

    use rusqlite::Connection;

    /// Parse Xtream `json`, upsert into a fresh in-memory DB, and return the catchup
    /// tuple for the stream with `stream_id`.
    fn parse_xtream_and_fetch_catchup(
        json: &str,
        stream_id: u64,
    ) -> (
        Option<String>, // catchup_type
        Option<String>, // catchup_source
        Option<String>, // catchup_days
        Option<i64>,    // catchup_hours
    ) {
        use crate::core::models::source::SourceKind;
        use crate::platform::db::migrations::run_migrations;
        use crate::platform::db::repositories::{channel_repo, source_repo};

        let conn = Connection::open_in_memory().expect("db should open");
        run_migrations(&conn).expect("migrations should run");

        let source_id = source_repo::upsert_source(
            &conn,
            SourceKind::Xtream,
            "X",
            "http://server.com",
            Some("user"),
            Some("pass"),
            None,
        )
        .expect("source should be created");

        let channels = parse_xtream_live_streams(json, "http://server.com", "user", "pass")
            .expect("xtream should parse");
        channel_repo::upsert_channels(&conn, source_id, &channels)
            .expect("upsert should succeed");

        let channel_key = format!("xtream:{stream_id}");
        conn.query_row(
            "SELECT catchup_type, catchup_source, catchup_days, catchup_hours \
             FROM channels WHERE source_id = ?1 AND channel_key = ?2",
            rusqlite::params![source_id, channel_key],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .expect("channel row must exist")
    }

    /// P0d C1: `tv_archive:1` + `tv_archive_duration:7` enables catchup with a
    /// non-NULL type, days "7", hours 168.
    ///
    /// Catches: ignoring the Xtream tv_archive fields entirely, or not normalizing
    /// duration days → hours.
    #[test]
    fn p0d_xtream_tv_archive_enables_catchup() {
        let json = r#"[{"stream_id":101,"name":"Archive Ch","tv_archive":1,"tv_archive_duration":7}]"#;
        let (ctype, _csource, cdays, chours) = parse_xtream_and_fetch_catchup(json, 101);
        assert!(
            ctype.is_some(),
            "tv_archive:1 must produce a non-NULL catchup_type"
        );
        assert_eq!(cdays.as_deref(), Some("7"), "tv_archive_duration → catchup_days");
        assert_eq!(chours, Some(168), "duration 7 days → catchup_hours 168");
    }

    /// P0d C2: `tv_archive:0` (or missing) leaves all four catchup columns NULL.
    ///
    /// Catches: treating a disabled/missing archive as if catchup were enabled.
    #[test]
    fn p0d_xtream_no_archive_is_null() {
        let json = r#"[
            {"stream_id":201,"name":"Disabled","tv_archive":0,"tv_archive_duration":7},
            {"stream_id":202,"name":"Missing"}
        ]"#;
        for sid in [201u64, 202u64] {
            let (ctype, csource, cdays, chours) = parse_xtream_and_fetch_catchup(json, sid);
            assert_eq!(ctype, None, "stream {sid}: catchup_type must be NULL");
            assert_eq!(csource, None, "stream {sid}: catchup_source must be NULL");
            assert_eq!(cdays, None, "stream {sid}: catchup_days must be NULL");
            assert_eq!(chours, None, "stream {sid}: catchup_hours must be NULL");
        }
    }
}
