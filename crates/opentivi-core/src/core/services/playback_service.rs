use std::time::Duration;

use crate::context::CoreContext;
use crate::dto::PlaybackSourceDto;
use crate::error::{AppError, AppResult};

const HEALTH_FRESH_MINUTES: i64 = 10;
const PLAYBACK_PROBE_TIMEOUT: Duration = Duration::from_millis(1200);

pub async fn resolve_playback(ctx: &CoreContext, channel_id: i64) -> AppResult<PlaybackSourceDto> {
    let candidates = list_playback_candidates(ctx, channel_id).await?;
    if candidates.len() <= 1 {
        return candidates
            .into_iter()
            .next()
            .ok_or_else(|| AppError::NotFound(format!("Channel {} not found", channel_id)));
    }

    // Multiple candidates available — just pick the first (already sorted by
    // health: alive+fastest first from list_playback_candidates).
    Ok(candidates.into_iter().next().unwrap())
}

pub async fn list_playback_candidates(
    ctx: &CoreContext,
    channel_id: i64,
) -> AppResult<Vec<PlaybackSourceDto>> {
    ctx.db
        .run(move |conn| {
            let channel = crate::platform::db::repositories::channel_repo::get_enabled_by_id(
                conn, channel_id,
            )?
            .ok_or_else(|| AppError::NotFound(format!("Channel {} not found", channel_id)))?;

            let _ = crate::platform::db::repositories::recents_repo::mark_watched(conn, channel_id);

            let candidates =
                crate::platform::db::repositories::channel_repo::list_playback_candidates(
                    conn, channel_id,
                )
                .unwrap_or_default();

            if candidates.is_empty() {
                let kind = Some(infer_playback_kind_from_url(&channel.stream_url).to_string());
                let proxy_recommended =
                    should_recommend_proxy(&channel.user_agent, &channel.referer);
                let health = health_status(conn, channel.id);
                return Ok(vec![PlaybackSourceDto {
                    channel_id: channel.id,
                    resolved_channel_id: channel.id,
                    source_id: channel.source_id,
                    channel_name: channel.name,
                    stream_url: channel.stream_url,
                    logo_url: channel.logo_url,
                    user_agent: channel.user_agent,
                    referer: channel.referer,
                    proxy_recommended,
                    kind,
                    priority: 0,
                    catchup_type: channel.catchup_type,
                    catchup_source: channel.catchup_source,
                    catchup_days: channel.catchup_days,
                    catchup_hours: channel.catchup_hours,
                    health,
                    expires_at: None,
                    needs_reresolve: false,
                    failure_reason: None,
                }]);
            }

            let mut healthy: Vec<_> = candidates
                .iter()
                .filter(|c| {
                    !crate::platform::db::repositories::channel_health_repo::is_fresh_dead(
                        conn,
                        c.id,
                        HEALTH_FRESH_MINUTES,
                    )
                    .unwrap_or(false)
                })
                .collect();

            if healthy.is_empty() {
                healthy.push(&candidates[0]);
            }

            let proxy_recommended =
                should_recommend_proxy(&channel.user_agent, &channel.referer);

            let prioritized = healthy
                .into_iter()
                .chain(candidates.iter().filter(|candidate| {
                    crate::platform::db::repositories::channel_health_repo::is_fresh_dead(
                        conn,
                        candidate.id,
                        HEALTH_FRESH_MINUTES,
                    )
                    .unwrap_or(false)
                }))
                .enumerate()
                .map(|(priority, candidate)| PlaybackSourceDto {
                    channel_id: channel.id,
                    resolved_channel_id: candidate.id,
                    source_id: candidate.source_id,
                    channel_name: channel.name.clone(),
                    stream_url: candidate.stream_url.clone(),
                    logo_url: candidate
                        .logo_url
                        .clone()
                        .or_else(|| channel.logo_url.clone()),
                    user_agent: channel.user_agent.clone(),
                    referer: channel.referer.clone(),
                    proxy_recommended,
                    kind: Some(infer_playback_kind_from_url(&candidate.stream_url).to_string()),
                    priority: priority as i32,
                    catchup_type: channel.catchup_type.clone(),
                    catchup_source: channel.catchup_source.clone(),
                    catchup_days: channel.catchup_days.clone(),
                    catchup_hours: channel.catchup_hours,
                    health: health_status(conn, candidate.id),
                    expires_at: None,
                    needs_reresolve: false,
                    failure_reason: None,
                })
                .collect();

            Ok(prioritized)
        })
        .await
}

/// A proxy is recommended whenever the stream carries custom HTTP headers
/// (User-Agent / Referer) that an embedded player cannot inject directly.
fn should_recommend_proxy(user_agent: &Option<String>, referer: &Option<String>) -> bool {
    user_agent.is_some() || referer.is_some()
}

/// Best-effort lookup of a channel's last-known health status. Returns None when
/// no health row exists or the query fails.
fn health_status(conn: &rusqlite::Connection, channel_id: i64) -> Option<String> {
    conn.query_row(
        "SELECT health_status FROM channel_health WHERE channel_id = ?1",
        [channel_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .ok()
    .flatten()
}

pub async fn probe_playback_kind(stream_url: &str) -> String {
    let fallback = infer_playback_kind_from_url(stream_url);
    let client = match reqwest::Client::builder()
        .timeout(PLAYBACK_PROBE_TIMEOUT)
        .connect_timeout(PLAYBACK_PROBE_TIMEOUT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
    {
        Ok(client) => client,
        Err(_) => return fallback.to_string(),
    };

    if let Ok(response) = client.head(stream_url).send().await {
        if let Some(kind) = detect_playback_kind_from_response(&response) {
            return kind.to_string();
        }
    }

    let response = match client
        .get(stream_url)
        .header(reqwest::header::RANGE, "bytes=0-4095")
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => return fallback.to_string(),
    };

    if let Some(kind) = detect_playback_kind_from_response(&response) {
        return kind.to_string();
    }

    match response.bytes().await {
        Ok(bytes) => {
            if looks_like_hls_playlist(&bytes) {
                return "hls".to_string();
            }
            if looks_like_mpegts(&bytes) {
                return "mpegts".to_string();
            }
            fallback.to_string()
        }
        Err(_) => fallback.to_string(),
    }
}

fn detect_playback_kind_from_response(response: &reqwest::Response) -> Option<&'static str> {
    response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(detect_playback_kind_from_content_type)
}

fn detect_playback_kind_from_content_type(content_type: &str) -> Option<&'static str> {
    let lower = content_type.to_ascii_lowercase();
    if lower.contains("mpegurl") || lower.contains("m3u") {
        return Some("hls");
    }
    if lower.contains("mp2t") {
        return Some("mpegts");
    }
    None
}

fn infer_playback_kind_from_url(url: &str) -> &'static str {
    let lower = url.to_ascii_lowercase();
    if lower.contains(".m3u8")
        || lower.contains("format=m3u8")
        || lower.contains("playlist.m3u")
        || lower.contains("type=hls")
        || lower.contains("output=m3u8")
        || lower.contains("extension=m3u8")
    {
        return "hls";
    }
    if lower.ends_with(".ts") || lower.contains("container=ts") || lower.contains("type=mpegts") {
        return "mpegts";
    }
    "native"
}

fn looks_like_hls_playlist(bytes: &[u8]) -> bool {
    let prefix = String::from_utf8_lossy(&bytes[..bytes.len().min(1024)]);
    prefix.trim_start().starts_with("#EXTM3U")
}

fn looks_like_mpegts(bytes: &[u8]) -> bool {
    if bytes.len() < 188 {
        return false;
    }
    matches!(bytes.first(), Some(0x47))
        || (bytes.len() > 376 && bytes[188] == 0x47)
        || (bytes.len() > 564 && bytes[376] == 0x47)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn infers_hls_from_extended_url_patterns() {
        assert_eq!(
            infer_playback_kind_from_url("https://a.test/live?id=1&type=hls"),
            "hls"
        );
        assert_eq!(
            infer_playback_kind_from_url("https://a.test/play?output=m3u8"),
            "hls"
        );
    }

    #[test]
    fn detects_hls_from_playlist_body() {
        assert!(looks_like_hls_playlist(
            b"#EXTM3U\n#EXT-X-VERSION:3\nsegment.ts"
        ));
    }

    // ── P0f-core tests (TDD red): PlaybackSourceDto 扩展（UA/referer/proxy/kind/
    //    priority/catchup 透出）─────────────────────────────────────────────────
    //
    // ⚠️ These tests are COMPILE-red on purpose: they read PlaybackSourceDto fields
    // that do not exist yet (`user_agent`, `referer`, `proxy_recommended`, `kind`,
    // `priority`, `catchup_type`, `catchup_hours`). Until those fields are added to
    // dto.rs, the whole opentivi-core test crate FAILS TO COMPILE — this is the
    // unavoidable structural red for this batch.
    //
    // What they pin (the contract resolve_playback / list_playback_candidates must
    // satisfy once the DTO + service are wired up):
    //   • UA present  → DTO.user_agent == Some(..) && DTO.proxy_recommended == true
    //   • no UA/referer → DTO.proxy_recommended == false
    //   • catchup on the channel is THREADED THROUGH to the DTO (catches the
    //     hardcoded-None bug in channel_repo get_enabled_by_id / list_playback_candidates)
    //   • DTO.kind = infer_playback_kind_from_url(stream_url) ("hls"/"mpegts"/...)
    //   • list_playback_candidates → DTO.priority is the 0-based candidate position

    use crate::context::CoreContext;
    use crate::core::models::channel::ParsedChannel;
    use crate::core::models::source::SourceKind;
    use crate::platform::db::executor::DbExecutor;
    use crate::platform::db::migrations::run_migrations;
    use crate::platform::db::repositories::{channel_repo, source_repo};
    use rusqlite::Connection;

    /// Build a unique temp-file SQLite path (DbExecutor opens by path each call, so
    /// an in-memory DB would not survive across `.run` invocations). No extra deps:
    /// uses std::env::temp_dir + a process/nanos-unique filename.
    fn temp_db_path() -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "opentivi_p0f_{}_{}_{}.sqlite",
            std::process::id(),
            nanos,
            n
        ))
    }

    fn parsed(channel_key: &str, name: &str, stream_url: &str) -> ParsedChannel {
        ParsedChannel {
            channel_key: channel_key.to_string(),
            external_id: None,
            name: name.to_string(),
            channel_number: None,
            group_name: None,
            tvg_id: Some(channel_key.to_string()),
            tvg_name: None,
            logo_url: None,
            stream_url: stream_url.to_string(),
            container_extension: None,
            is_live: true,
            catchup_type: None,
            catchup_source: None,
            catchup_days: None,
            catchup_hours: None,
            user_agent: None,
            referer: None,
        }
    }

    /// Seed a fresh temp DB synchronously (migrations + source + channels) via a
    /// one-shot rusqlite connection, then return a CoreContext bound to the same
    /// path. `setup` runs extra raw SQL (e.g. set user_agent / referer) and returns
    /// the channel id under test.
    fn seed_ctx(
        channels: &[ParsedChannel],
        setup: impl FnOnce(&Connection, i64),
    ) -> (CoreContext, i64) {
        let path = temp_db_path();
        let conn = Connection::open(&path).expect("temp db should open");
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
        channel_repo::upsert_channels(&conn, source_id, channels).expect("upsert should succeed");

        // id of the first seeded channel (the one under test).
        let channel_id: i64 = conn
            .query_row(
                "SELECT id FROM channels WHERE source_id = ?1 AND channel_key = ?2",
                rusqlite::params![source_id, channels[0].channel_key],
                |row| row.get(0),
            )
            .expect("seeded channel must exist");

        setup(&conn, channel_id);
        drop(conn);

        let ctx = CoreContext::new(DbExecutor::new(path));
        (ctx, channel_id)
    }

    /// P0f S1: a channel carrying UA → resolve_playback DTO exposes it and flags
    /// proxy_recommended = true.
    ///
    /// COMPILE-red on `.user_agent` / `.proxy_recommended`. After impl, catches a
    /// DTO that drops UA or fails to set proxy_recommended when UA is present.
    #[tokio::test]
    async fn p0f_resolve_exposes_user_agent_and_flags_proxy() {
        let (ctx, channel_id) = seed_ctx(
            &[parsed("ua1", "UA Ch", "http://example.com/ua.ts")],
            |conn, id| {
                conn.execute(
                    "UPDATE channels SET user_agent = 'MyAgent/1.0' WHERE id = ?1",
                    rusqlite::params![id],
                )
                .expect("set user_agent");
            },
        );

        let dto = resolve_playback(&ctx, channel_id)
            .await
            .expect("resolve_playback should succeed");
        assert_eq!(
            dto.user_agent.as_deref(),
            Some("MyAgent/1.0"),
            "DTO must surface the channel's user_agent"
        );
        assert!(
            dto.proxy_recommended,
            "proxy_recommended must be true when user_agent is present"
        );
    }

    /// P0f S2: a channel with neither UA nor referer → proxy_recommended = false
    /// and both fields are None.
    ///
    /// COMPILE-red. After impl, catches always-true proxy_recommended.
    #[tokio::test]
    async fn p0f_resolve_no_ua_referer_means_no_proxy() {
        let (ctx, channel_id) =
            seed_ctx(&[parsed("plain1", "Plain Ch", "http://example.com/p.ts")], |_, _| {});

        let dto = resolve_playback(&ctx, channel_id)
            .await
            .expect("resolve_playback should succeed");
        assert_eq!(dto.user_agent, None, "no UA → DTO.user_agent None");
        assert_eq!(dto.referer, None, "no referer → DTO.referer None");
        assert!(
            !dto.proxy_recommended,
            "proxy_recommended must be false with no UA/referer"
        );
    }

    /// P0f S3: catchup on the channel is threaded through to the DTO.
    ///
    /// This pins the bug: channel_repo::get_enabled_by_id / list_playback_candidates
    /// currently hardcode catchup_* = None AND their SELECTs don't read the catchup
    /// columns, so resolve_playback can never surface catchup. COMPILE-red on
    /// `.catchup_type` / `.catchup_hours`.
    #[tokio::test]
    async fn p0f_resolve_threads_catchup_through() {
        let mut ch = parsed("cu1", "Catchup Ch", "http://example.com/cu.ts");
        ch.catchup_type = Some("append".to_string());
        ch.catchup_source = Some("http://x?utc={utc}".to_string());
        ch.catchup_days = Some("7".to_string());
        ch.catchup_hours = Some(168);

        let (ctx, channel_id) = seed_ctx(&[ch], |_, _| {});

        let dto = resolve_playback(&ctx, channel_id)
            .await
            .expect("resolve_playback should succeed");
        assert_eq!(
            dto.catchup_type.as_deref(),
            Some("append"),
            "DTO.catchup_type must reflect the channel's catchup (no hardcoded None)"
        );
        assert_eq!(
            dto.catchup_hours,
            Some(168),
            "DTO.catchup_hours must reflect the channel's catchup_hours"
        );
    }

    /// P0f S4: DTO.kind = infer_playback_kind_from_url(stream_url). A .ts URL → mpegts;
    /// a .m3u8 URL → hls.
    ///
    /// COMPILE-red on `.kind`. After impl, catches a missing/incorrect kind inference.
    #[tokio::test]
    async fn p0f_resolve_sets_kind_from_url() {
        let (ctx_ts, id_ts) =
            seed_ctx(&[parsed("ts1", "TS Ch", "http://example.com/live.ts")], |_, _| {});
        let dto_ts = resolve_playback(&ctx_ts, id_ts)
            .await
            .expect("resolve mpegts should succeed");
        assert_eq!(dto_ts.kind.as_deref(), Some("mpegts"), ".ts URL → kind mpegts");

        let (ctx_hls, id_hls) = seed_ctx(
            &[parsed("hls1", "HLS Ch", "http://example.com/live.m3u8")],
            |_, _| {},
        );
        let dto_hls = resolve_playback(&ctx_hls, id_hls)
            .await
            .expect("resolve hls should succeed");
        assert_eq!(dto_hls.kind.as_deref(), Some("hls"), ".m3u8 URL → kind hls");
    }

    /// P0f S5: list_playback_candidates assigns 0-based `priority` by candidate
    /// position. Three channels sharing a normalized name → priorities {0,1,2}.
    ///
    /// COMPILE-red on `.priority`. After impl, catches a flat/constant priority that
    /// does not reflect candidate ordering.
    #[tokio::test]
    async fn p0f_list_candidates_priority_is_positional() {
        // Same display name → same normalized_name → all three are candidates.
        let (ctx, channel_id) = seed_ctx(
            &[
                parsed("p0", "Multi Ch", "http://a.example.com/s.ts"),
                parsed("p1", "Multi Ch", "http://b.example.com/s.ts"),
                parsed("p2", "Multi Ch", "http://c.example.com/s.ts"),
            ],
            |_, _| {},
        );

        let dtos = list_playback_candidates(&ctx, channel_id)
            .await
            .expect("list_playback_candidates should succeed");
        assert_eq!(dtos.len(), 3, "all three same-name channels are candidates");

        let priorities: Vec<i32> = dtos.iter().map(|d| d.priority).collect();
        assert_eq!(
            priorities,
            vec![0, 1, 2],
            "priority must be the 0-based candidate position"
        );
    }
}
