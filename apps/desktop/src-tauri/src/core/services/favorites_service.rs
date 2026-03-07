use rusqlite::Connection;

use crate::commands::dto::ChannelListItemDto;
use crate::error::AppResult;

pub fn list_favorites(conn: &Connection) -> AppResult<Vec<ChannelListItemDto>> {
    crate::platform::db::repositories::favorites_repo::list_favorites(conn)
}

pub fn set_favorite(conn: &Connection, channel_id: i64, favorite: bool) -> AppResult<()> {
    if favorite {
        crate::platform::db::repositories::favorites_repo::add_favorite(conn, channel_id)
    } else {
        crate::platform::db::repositories::favorites_repo::remove_favorite(conn, channel_id)
    }
}
