use rusqlite::Connection;

use crate::commands::dto::SourceDto;
use crate::core::models::source::{Source, SourceKind};
use crate::error::AppResult;

pub fn list_all(conn: &Connection) -> AppResult<Vec<SourceDto>> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, name, location, username, enabled, last_imported_at, created_at, updated_at FROM sources ORDER BY name",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(SourceDto {
            id: row.get(0)?,
            kind: row.get(1)?,
            name: row.get(2)?,
            location: row.get(3)?,
            username: row.get(4)?,
            enabled: row.get::<_, i64>(5)? != 0,
            last_imported_at: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;

    let mut sources = Vec::new();
    for row in rows {
        sources.push(row?);
    }
    Ok(sources)
}

pub fn get_by_id(conn: &Connection, id: i64) -> AppResult<Option<Source>> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, name, location, username, password, enabled, last_imported_at, created_at, updated_at FROM sources WHERE id = ?1",
    )?;

    let result = stmt.query_row([id], |row| {
        let kind_str: String = row.get(1)?;
        Ok(Source {
            id: row.get(0)?,
            kind: SourceKind::from_str(&kind_str).unwrap_or(SourceKind::M3u),
            name: row.get(2)?,
            location: row.get(3)?,
            username: row.get(4)?,
            password: row.get(5)?,
            enabled: row.get::<_, i64>(6)? != 0,
            last_imported_at: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    });

    match result {
        Ok(source) => Ok(Some(source)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn upsert_source(
    conn: &Connection,
    kind: SourceKind,
    name: &str,
    location: &str,
    username: Option<&str>,
    password: Option<&str>,
) -> AppResult<i64> {
    // Check if source with same kind+location exists
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM sources WHERE kind = ?1 AND location = ?2",
            rusqlite::params![kind.as_str(), location],
            |row| row.get(0),
        )
        .ok();

    if let Some(id) = existing {
        conn.execute(
            "UPDATE sources SET name = ?1, username = ?2, password = ?3, last_imported_at = datetime('now'), updated_at = datetime('now') WHERE id = ?4",
            rusqlite::params![name, username, password, id],
        )?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO sources (kind, name, location, username, password, created_at, updated_at, last_imported_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'), datetime('now'))",
            rusqlite::params![kind.as_str(), name, location, username, password],
        )?;
        Ok(conn.last_insert_rowid())
    }
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM sources WHERE id = ?1", [id])?;
    Ok(())
}
