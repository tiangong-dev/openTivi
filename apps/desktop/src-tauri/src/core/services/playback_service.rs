use rusqlite::Connection;

use crate::commands::dto::PlaybackSourceDto;
use crate::error::{AppError, AppResult};

const HEALTH_FRESH_MINUTES: i64 = 10;

pub fn resolve_playback(conn: &Connection, channel_id: i64) -> AppResult<PlaybackSourceDto> {
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
        return Ok(PlaybackSourceDto {
            channel_id: channel.id,
            channel_name: channel.name,
            stream_url: channel.stream_url,
            logo_url: channel.logo_url,
        });
    }

    // Pick first candidate that is not freshly dead
    let resolved = candidates
        .iter()
        .find(|c| {
            !crate::platform::db::repositories::channel_health_repo::is_fresh_dead(
                conn,
                c.id,
                HEALTH_FRESH_MINUTES,
            )
            .unwrap_or(false)
        })
        .unwrap_or(&candidates[0]);

    Ok(PlaybackSourceDto {
        channel_id: channel.id,
        channel_name: channel.name.clone(),
        stream_url: resolved.stream_url.clone(),
        logo_url: resolved.logo_url.clone().or(channel.logo_url),
    })
}
