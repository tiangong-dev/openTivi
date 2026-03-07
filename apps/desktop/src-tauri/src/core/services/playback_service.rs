use rusqlite::Connection;

use crate::commands::dto::PlaybackSourceDto;
use crate::error::{AppError, AppResult};

pub fn resolve_playback(conn: &Connection, channel_id: i64) -> AppResult<PlaybackSourceDto> {
    let channel =
        crate::platform::db::repositories::channel_repo::get_by_id(conn, channel_id)?
            .ok_or_else(|| AppError::NotFound(format!("Channel {} not found", channel_id)))?;

    // Mark as recently watched
    let _ = crate::platform::db::repositories::recents_repo::mark_watched(conn, channel_id);

    Ok(PlaybackSourceDto {
        channel_id: channel.id,
        channel_name: channel.name,
        stream_url: channel.stream_url,
        logo_url: channel.logo_url,
    })
}
