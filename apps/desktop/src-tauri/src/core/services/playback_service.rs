use rusqlite::Connection;

use crate::commands::dto::PlaybackSourceDto;
use crate::error::{AppError, AppResult};

const HEALTH_FRESH_MINUTES: i64 = 10;

pub fn resolve_playback(conn: &Connection, channel_id: i64) -> AppResult<PlaybackSourceDto> {
    let candidates = list_playback_candidates(conn, channel_id)?;
    Ok(candidates
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound(format!("Channel {} not found", channel_id)))?)
}

pub fn list_playback_candidates(
    conn: &Connection,
    channel_id: i64,
) -> AppResult<Vec<PlaybackSourceDto>> {
    let channel = crate::platform::db::repositories::channel_repo::get_enabled_by_id(
        conn, channel_id,
    )?
        .ok_or_else(|| AppError::NotFound(format!("Channel {} not found", channel_id)))?;

    // Mark as recently watched (using the logical channel the user clicked)
    let _ = crate::platform::db::repositories::recents_repo::mark_watched(conn, channel_id);

    // Try to find playback candidates (same normalized_name across sources)
    let candidates =
        crate::platform::db::repositories::channel_repo::list_playback_candidates(conn, channel_id)
            .unwrap_or_default();

    if candidates.is_empty() {
        // No candidates (e.g. normalized_name is empty), fall back to the original channel
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
            logo_url: candidate.logo_url.clone().or_else(|| channel.logo_url.clone()),
        })
        .collect();

    Ok(prioritized)
}
