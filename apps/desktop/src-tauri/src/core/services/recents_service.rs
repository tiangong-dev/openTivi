use rusqlite::Connection;

use crate::commands::dto::RecentChannelDto;
use crate::error::AppResult;

pub fn list_recents(conn: &Connection, limit: u32) -> AppResult<Vec<RecentChannelDto>> {
    crate::platform::db::repositories::recents_repo::list_recents(conn, limit)
}

pub fn mark_recent_watched(conn: &Connection, channel_id: i64) -> AppResult<()> {
    crate::platform::db::repositories::recents_repo::mark_watched(conn, channel_id)
}
