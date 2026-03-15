use rusqlite::Connection;

use crate::dto::SourceDto;
use crate::core::models::source::SourceKind;
use crate::error::AppError;
use crate::error::AppResult;

pub fn list_sources(conn: &Connection) -> AppResult<Vec<SourceDto>> {
    crate::platform::db::repositories::source_repo::list_all(conn)
}

pub fn delete_source(conn: &Connection, source_id: i64) -> AppResult<()> {
    crate::platform::db::repositories::source_repo::delete(conn, source_id)
}

pub fn update_source(
    conn: &Connection,
    source_id: i64,
    name: &str,
    location: &str,
    username: Option<&str>,
    password: Option<&str>,
    auto_refresh_minutes: Option<u32>,
    enabled: bool,
) -> AppResult<()> {
    let source = crate::platform::db::repositories::source_repo::get_by_id(conn, source_id)?
        .ok_or_else(|| AppError::NotFound(format!("Source {} not found", source_id)))?;

    let normalized_refresh = match source.kind {
        SourceKind::M3u => auto_refresh_minutes,
        _ => None,
    };

    crate::platform::db::repositories::source_repo::update_source(
        conn,
        source_id,
        name,
        location,
        username,
        password,
        normalized_refresh,
        enabled,
    )
}
