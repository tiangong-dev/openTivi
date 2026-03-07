use rusqlite::Connection;

use crate::commands::dto::SourceDto;
use crate::error::AppResult;

pub fn list_sources(conn: &Connection) -> AppResult<Vec<SourceDto>> {
    crate::platform::db::repositories::source_repo::list_all(conn)
}

pub fn delete_source(conn: &Connection, source_id: i64) -> AppResult<()> {
    crate::platform::db::repositories::source_repo::delete(conn, source_id)
}
