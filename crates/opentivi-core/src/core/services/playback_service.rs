use std::time::Duration;

use crate::context::CoreContext;
use crate::dto::PlaybackSourceDto;
use crate::error::{AppError, AppResult};

const HEALTH_FRESH_MINUTES: i64 = 10;
const PLAYBACK_PROBE_TIMEOUT: Duration = Duration::from_millis(1200);

pub async fn resolve_playback(
    ctx: &CoreContext,
    channel_id: i64,
) -> AppResult<PlaybackSourceDto> {
    let candidates = list_playback_candidates(ctx, channel_id).await?;
    Ok(candidates
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound(format!("Channel {} not found", channel_id)))?)
}

pub async fn list_playback_candidates(
    ctx: &CoreContext,
    channel_id: i64,
) -> AppResult<Vec<PlaybackSourceDto>> {
    ctx.db
        .run(move |conn| {
            let channel =
                crate::platform::db::repositories::channel_repo::get_enabled_by_id(
                    conn, channel_id,
                )?
                .ok_or_else(|| {
                    AppError::NotFound(format!("Channel {} not found", channel_id))
                })?;

            let _ =
                crate::platform::db::repositories::recents_repo::mark_watched(conn, channel_id);

            let candidates =
                crate::platform::db::repositories::channel_repo::list_playback_candidates(
                    conn, channel_id,
                )
                .unwrap_or_default();

            if candidates.is_empty() {
                return Ok(vec![PlaybackSourceDto {
                    channel_id: channel.id,
                    resolved_channel_id: channel.id,
                    source_id: channel.source_id,
                    channel_name: channel.name,
                    stream_url: channel.stream_url,
                    logo_url: channel.logo_url,
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
                .map(|candidate| PlaybackSourceDto {
                    channel_id: channel.id,
                    resolved_channel_id: candidate.id,
                    source_id: candidate.source_id,
                    channel_name: channel.name.clone(),
                    stream_url: candidate.stream_url.clone(),
                    logo_url: candidate
                        .logo_url
                        .clone()
                        .or_else(|| channel.logo_url.clone()),
                })
                .collect();

            Ok(prioritized)
        })
        .await
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
        assert_eq!(infer_playback_kind_from_url("https://a.test/live?id=1&type=hls"), "hls");
        assert_eq!(infer_playback_kind_from_url("https://a.test/play?output=m3u8"), "hls");
    }

    #[test]
    fn detects_hls_from_playlist_body() {
        assert!(looks_like_hls_playlist(b"#EXTM3U\n#EXT-X-VERSION:3\nsegment.ts"));
    }
}
