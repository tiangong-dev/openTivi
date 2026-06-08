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

            // Inline EXTINF attributes provide defaults; EXTVLCOPT lines (read
            // below, before the URL) take priority when present.
            let mut user_agent = attrs.get("user-agent").cloned();
            let mut referer = attrs
                .get("http-referrer")
                .or_else(|| attrs.get("referrer"))
                .cloned();

            // Next non-comment, non-empty line should be the URL. Along the way we
            // pick off `#EXTVLCOPT:` lines (http-user-agent / http-referrer).
            let url = loop {
                match lines.next() {
                    Some(l) => {
                        let l = l.trim();
                        if let Some(opt) = l.strip_prefix("#EXTVLCOPT:") {
                            if let Some((key, value)) = opt.split_once('=') {
                                match key.trim() {
                                    "http-user-agent" => {
                                        user_agent = Some(value.trim().to_string())
                                    }
                                    "http-referrer" => referer = Some(value.trim().to_string()),
                                    _ => {}
                                }
                            }
                            continue;
                        }
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

            // catchup type: prefer the bare `catchup`, then `catchup-type`,
            // then `tvg-rec` (which often carries no useful value → "default").
            let catchup_type = attrs
                .get("catchup")
                .cloned()
                .or_else(|| attrs.get("catchup-type").cloned())
                .or_else(|| {
                    attrs.get("tvg-rec").map(|v| {
                        if v.is_empty() {
                            "default".to_string()
                        } else {
                            v.clone()
                        }
                    })
                });
            let catchup_source = attrs.get("catchup-source").cloned();
            // catchup days raw: `catchup-days` then the `timeshift` alias.
            let catchup_days = attrs
                .get("catchup-days")
                .cloned()
                .or_else(|| attrs.get("timeshift").cloned());
            let catchup_hours = catchup_days
                .as_deref()
                .and_then(super::catchup_days_to_hours);

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
                catchup_type,
                catchup_source,
                catchup_days,
                catchup_hours,
                user_agent,
                referer,
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

    // ── P0d tests (TDD red): catchup 回看字段（M3U 解析 + 存储） ──────────────
    //
    // Expected to FAIL until P0d (parse_m3u extracts catchup attrs +
    // upsert_channels persists them + migration 0013 adds the columns) is
    // implemented.
    //
    // To avoid referencing not-yet-existing Rust fields (ParsedChannel.catchup_*),
    // which would break COMPILATION of the whole test crate, we assert the contract
    // end-to-end through the DB: parse_m3u → upsert_channels → raw SQL SELECT of the
    // catchup columns (string literals). Before the columns exist, the SELECT fails
    // at RUNTIME with "no such column" (red); before parsing/persisting is wired up,
    // the columns are NULL (red on value asserts).

    use rusqlite::Connection;

    /// Parse `m3u`, upsert into a fresh in-memory DB under a seeded source, and
    /// return the catchup tuple for the channel matching `channel_key`.
    ///
    /// Uses string-literal column references so the test crate compiles before the
    /// catchup columns / fields exist.
    fn parse_and_fetch_catchup(
        m3u: &str,
        channel_key: &str,
    ) -> (
        Option<String>, // catchup_type
        Option<String>, // catchup_source
        Option<String>, // catchup_days (raw)
        Option<i64>,    // catchup_hours (days * 24)
    ) {
        use crate::core::models::source::SourceKind;
        use crate::platform::db::migrations::run_migrations;
        use crate::platform::db::repositories::{channel_repo, source_repo};

        let conn = Connection::open_in_memory().expect("db should open");
        run_migrations(&conn).expect("migrations should run");

        let source_id = source_repo::upsert_source(
            &conn,
            SourceKind::M3u,
            "S",
            "http://example.com/s.m3u",
            None,
            None,
            None,
        )
        .expect("source should be created");

        let channels = parse_m3u(m3u).expect("m3u should parse");
        channel_repo::upsert_channels(&conn, source_id, &channels)
            .expect("upsert should succeed");

        conn.query_row(
            "SELECT catchup_type, catchup_source, catchup_days, catchup_hours \
             FROM channels WHERE source_id = ?1 AND channel_key = ?2",
            rusqlite::params![source_id, channel_key],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .expect("channel row must exist")
    }

    /// P0d B1: raw catchup values are preserved through parse → store.
    /// `catchup="append"` → type "append"; `catchup-source` with `{utc}` is kept
    /// verbatim (not URL-rewritten/stripped); `catchup-days="7"` → days "7".
    ///
    /// Catches: dropping the catchup attributes during parse, or mangling the
    /// catchup-source template placeholders.
    #[test]
    fn p0d_m3u_catchup_raw_values_preserved() {
        let m3u = "#EXTM3U\n\
#EXTINF:-1 tvg-id=\"c1\" catchup=\"append\" catchup-source=\"http://x?utc={utc}\" catchup-days=\"7\",Catchup Ch\n\
http://example.com/c1\n";
        let (ctype, csource, cdays, _chours) = parse_and_fetch_catchup(m3u, "c1");
        assert_eq!(ctype.as_deref(), Some("append"), "catchup → catchup_type");
        assert_eq!(
            csource.as_deref(),
            Some("http://x?utc={utc}"),
            "catchup-source must be stored verbatim, {{utc}} placeholder intact"
        );
        assert_eq!(cdays.as_deref(), Some("7"), "catchup-days raw value preserved");
    }

    /// P0d B2: days are normalized to hours (days * 24). days "7" → hours 168.
    ///
    /// Catches: forgetting to compute catchup_hours, or using the wrong factor.
    #[test]
    fn p0d_m3u_catchup_days_normalized_to_hours() {
        let m3u = "#EXTM3U\n\
#EXTINF:-1 tvg-id=\"c1\" catchup=\"append\" catchup-days=\"7\",Catchup Ch\n\
http://example.com/c1\n";
        let (_ctype, _csource, cdays, chours) = parse_and_fetch_catchup(m3u, "c1");
        assert_eq!(cdays.as_deref(), Some("7"));
        assert_eq!(chours, Some(168), "catchup_hours must be days(7) * 24 = 168");
    }

    /// P0d B3: variant attribute fallbacks. `catchup-type` (without a bare
    /// `catchup`) still yields catchup_type; `timeshift` is an alias for
    /// catchup-days → days "3" / hours 72.
    ///
    /// Catches: only honoring the canonical `catchup`/`catchup-days` spellings and
    /// ignoring the `catchup-type` / `timeshift` aliases.
    #[test]
    fn p0d_m3u_catchup_variant_aliases() {
        let m3u = "#EXTM3U\n\
#EXTINF:-1 tvg-id=\"c1\" catchup-type=\"shift\" timeshift=\"3\",Variant Ch\n\
http://example.com/c1\n";
        let (ctype, _csource, cdays, chours) = parse_and_fetch_catchup(m3u, "c1");
        assert_eq!(
            ctype.as_deref(),
            Some("shift"),
            "catchup-type alias must populate catchup_type"
        );
        assert_eq!(cdays.as_deref(), Some("3"), "timeshift alias → catchup_days");
        assert_eq!(chours, Some(72), "timeshift 3 → hours 72");
    }

    /// P0d B4: a channel with no catchup attributes stores all four columns as NULL.
    ///
    /// Catches: writing bogus non-NULL defaults for channels without catchup.
    #[test]
    fn p0d_m3u_no_catchup_is_null() {
        let m3u = "#EXTM3U\n\
#EXTINF:-1 tvg-id=\"c1\",Plain Ch\n\
http://example.com/c1\n";
        let (ctype, csource, cdays, chours) = parse_and_fetch_catchup(m3u, "c1");
        assert_eq!(ctype, None, "no catchup → catchup_type NULL");
        assert_eq!(csource, None, "no catchup → catchup_source NULL");
        assert_eq!(cdays, None, "no catchup → catchup_days NULL");
        assert_eq!(chours, None, "no catchup → catchup_hours NULL");
    }

    /// P0d B5: a non-numeric `catchup-days` is preserved verbatim, but produces no
    /// hours (catchup_hours NULL) rather than a panic or garbage value.
    ///
    /// Catches: unwrapping a parse on catchup-days (panic), or coercing "abc" → 0.
    #[test]
    fn p0d_m3u_invalid_days_keeps_raw_and_null_hours() {
        let m3u = "#EXTM3U\n\
#EXTINF:-1 tvg-id=\"c1\" catchup=\"append\" catchup-days=\"abc\",Bad Days Ch\n\
http://example.com/c1\n";
        let (_ctype, _csource, cdays, chours) = parse_and_fetch_catchup(m3u, "c1");
        assert_eq!(cdays.as_deref(), Some("abc"), "invalid days kept verbatim");
        assert_eq!(chours, None, "invalid days → catchup_hours NULL (no coercion)");
    }

    // ── P0f-core tests (TDD red): UA/referer 解析 + 存储 ──────────────────────
    //
    // Expected to FAIL until P0f-core (parse_m3u extracts UA/referer from
    // #EXTVLCOPT lines + inline EXTINF attrs, ParsedChannel/Channel carry the
    // fields, upsert_channels persists them, migration 0015 adds the columns) is
    // implemented.
    //
    // These are RUNTIME-red, COMPILE-clean: like the P0d catchup tests above, the
    // contract is asserted end-to-end through the DB via raw-SQL string-literal
    // column references (SELECT user_agent, referer ...). We deliberately do NOT
    // reference ParsedChannel.user_agent / .referer (those fields don't exist yet),
    // so the test crate still COMPILES; the failure surfaces at RUNTIME:
    //   • before migration 0015: "no such column: user_agent" (red)
    //   • before parse/persist wiring: columns are NULL → value asserts fail (red)

    /// Parse `m3u`, upsert into a fresh in-memory DB under a seeded source, and
    /// return the (user_agent, referer) tuple for the channel matching `channel_key`.
    ///
    /// Uses string-literal column references so the test crate compiles before the
    /// user_agent / referer columns / fields exist.
    fn parse_and_fetch_ua_referer(
        m3u: &str,
        channel_key: &str,
    ) -> (Option<String>, Option<String>) {
        use crate::core::models::source::SourceKind;
        use crate::platform::db::migrations::run_migrations;
        use crate::platform::db::repositories::{channel_repo, source_repo};

        let conn = Connection::open_in_memory().expect("db should open");
        run_migrations(&conn).expect("migrations should run");

        let source_id = source_repo::upsert_source(
            &conn,
            SourceKind::M3u,
            "S",
            "http://example.com/s.m3u",
            None,
            None,
            None,
        )
        .expect("source should be created");

        let channels = parse_m3u(m3u).expect("m3u should parse");
        channel_repo::upsert_channels(&conn, source_id, &channels)
            .expect("upsert should succeed");

        conn.query_row(
            "SELECT user_agent, referer FROM channels \
             WHERE source_id = ?1 AND channel_key = ?2",
            rusqlite::params![source_id, channel_key],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("channel row must exist")
    }

    /// P0f M1: independent `#EXTVLCOPT` lines after EXTINF populate UA + referer.
    /// `http-user-agent=...` → user_agent; `http-referrer=...` → referer (note the
    /// VLC double-r spelling of "referrer" maps onto our `referer` column).
    ///
    /// Catches: ignoring EXTVLCOPT lines entirely, or wiring http-referrer to the
    /// wrong column.
    #[test]
    fn p0f_m3u_extvlcopt_lines_populate_ua_and_referer() {
        let m3u = "#EXTM3U\n\
#EXTINF:-1 tvg-id=\"c1\",VLCOPT Ch\n\
#EXTVLCOPT:http-user-agent=MyAgent/1.0\n\
#EXTVLCOPT:http-referrer=http://ref.example.com/\n\
http://example.com/c1\n";
        let (ua, referer) = parse_and_fetch_ua_referer(m3u, "c1");
        assert_eq!(
            ua.as_deref(),
            Some("MyAgent/1.0"),
            "#EXTVLCOPT:http-user-agent must populate user_agent"
        );
        assert_eq!(
            referer.as_deref(),
            Some("http://ref.example.com/"),
            "#EXTVLCOPT:http-referrer must populate referer"
        );
    }

    /// P0f M2: inline EXTINF attributes `user-agent="..."` / `http-referrer="..."`
    /// populate UA + referer when no EXTVLCOPT line is present.
    ///
    /// Catches: only honoring EXTVLCOPT and ignoring the inline-attribute form.
    #[test]
    fn p0f_m3u_inline_attrs_populate_ua_and_referer() {
        let m3u = "#EXTM3U\n\
#EXTINF:-1 tvg-id=\"c1\" user-agent=\"InlineAgent/2.0\" http-referrer=\"http://inline.example.com/\",Inline Ch\n\
http://example.com/c1\n";
        let (ua, referer) = parse_and_fetch_ua_referer(m3u, "c1");
        assert_eq!(
            ua.as_deref(),
            Some("InlineAgent/2.0"),
            "inline user-agent attr must populate user_agent"
        );
        assert_eq!(
            referer.as_deref(),
            Some("http://inline.example.com/"),
            "inline http-referrer attr must populate referer"
        );
    }

    /// P0f M3: PRIORITY — when both an EXTVLCOPT line AND an inline attribute are
    /// present, EXTVLCOPT wins for BOTH user_agent and referer.
    ///
    /// Catches: inline attrs overwriting EXTVLCOPT (wrong precedence), or only
    /// applying precedence to one of the two fields.
    #[test]
    fn p0f_m3u_extvlcopt_takes_priority_over_inline() {
        let m3u = "#EXTM3U\n\
#EXTINF:-1 tvg-id=\"c1\" user-agent=\"InlineAgent\" http-referrer=\"http://inline/\",Prio Ch\n\
#EXTVLCOPT:http-user-agent=VlcAgent\n\
#EXTVLCOPT:http-referrer=http://vlc/\n\
http://example.com/c1\n";
        let (ua, referer) = parse_and_fetch_ua_referer(m3u, "c1");
        assert_eq!(
            ua.as_deref(),
            Some("VlcAgent"),
            "EXTVLCOPT user-agent must take priority over inline"
        );
        assert_eq!(
            referer.as_deref(),
            Some("http://vlc/"),
            "EXTVLCOPT referrer must take priority over inline"
        );
    }

    /// P0f M4: a channel with no UA/referer (neither EXTVLCOPT nor inline) stores
    /// both columns as NULL.
    ///
    /// Catches: writing bogus non-NULL defaults for channels without UA/referer.
    #[test]
    fn p0f_m3u_no_ua_referer_is_null() {
        let m3u = "#EXTM3U\n\
#EXTINF:-1 tvg-id=\"c1\",Plain Ch\n\
http://example.com/c1\n";
        let (ua, referer) = parse_and_fetch_ua_referer(m3u, "c1");
        assert_eq!(ua, None, "no UA → user_agent NULL");
        assert_eq!(referer, None, "no referer → referer NULL");
    }
}
