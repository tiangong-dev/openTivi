use rusqlite::Connection;

use crate::dto::ChannelListItemDto;
use crate::error::AppResult;

pub fn list_channels(
    conn: &Connection,
    source_id: Option<i64>,
    group_name: Option<&str>,
    search: Option<&str>,
    favorites_only: bool,
    limit: u32,
    offset: u32,
) -> AppResult<Vec<ChannelListItemDto>> {
    crate::platform::db::repositories::channel_repo::list_channels(
        conn,
        source_id,
        group_name,
        search,
        favorites_only,
        limit,
        offset,
    )
}

pub fn list_groups(conn: &Connection, source_id: Option<i64>) -> AppResult<Vec<String>> {
    crate::platform::db::repositories::channel_repo::list_groups(conn, source_id)
}
