use rusqlite::Connection;

use crate::commands::dto::EpgProgramDto;
use crate::error::AppResult;

pub fn get_channel_epg(
    conn: &Connection,
    channel_id: i64,
    from: Option<&str>,
    to: Option<&str>,
) -> AppResult<Vec<EpgProgramDto>> {
    crate::platform::db::repositories::epg_repo::get_channel_epg(conn, channel_id, from, to)
}
