use rusqlite::Connection;

use crate::commands::dto::SourceDto;
use crate::core::models::source::{Source, SourceKind};
use crate::error::AppResult;

pub fn list_all(conn: &Connection) -> AppResult<Vec<SourceDto>> {
    let mut stmt = conn.prepare(
        "SELECT
            s.id,
            s.kind,
            s.name,
            s.location,
            s.username,
            s.enabled,
            s.auto_refresh_minutes,
            (
                SELECT COUNT(*)
                FROM channels c
                WHERE c.source_id = s.id
            ) AS channel_count,
            (
                SELECT COUNT(DISTINCT c.group_name)
                FROM channels c
                WHERE c.source_id = s.id
                  AND c.group_name IS NOT NULL
                  AND TRIM(c.group_name) <> ''
            ) AS group_count,
            (
                SELECT COUNT(*)
                FROM channels c
                WHERE c.source_id = s.id
                  AND c.tvg_id IS NOT NULL
                  AND TRIM(c.tvg_id) <> ''
            ) AS channels_with_tvg_id,
            (
                SELECT COUNT(DISTINCT c.id)
                FROM channels c
                WHERE c.source_id = s.id
                  AND c.tvg_id IS NOT NULL
                  AND TRIM(c.tvg_id) <> ''
                  AND EXISTS (
                      SELECT 1
                      FROM epg_programs e
                      WHERE LOWER(TRIM(e.channel_tvg_id)) = LOWER(TRIM(c.tvg_id))
                         OR LOWER(REPLACE(TRIM(e.channel_tvg_id), ' ', '')) = LOWER(REPLACE(TRIM(c.tvg_id), ' ', ''))
                  )
            ) AS matched_epg_channels,
            (
                SELECT COUNT(*)
                FROM epg_programs e
                WHERE e.source_id = s.id
            ) AS epg_program_count,
            s.last_imported_at,
            s.created_at,
            s.updated_at
        FROM sources s
        ORDER BY s.name",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(SourceDto {
            id: row.get(0)?,
            kind: row.get(1)?,
            name: row.get(2)?,
            location: row.get(3)?,
            username: row.get(4)?,
            enabled: row.get::<_, i64>(5)? != 0,
            auto_refresh_minutes: row.get(6)?,
            channel_count: row.get(7)?,
            group_count: row.get(8)?,
            channels_with_tvg_id: row.get(9)?,
            matched_epg_channels: row.get(10)?,
            epg_program_count: row.get(11)?,
            last_imported_at: row.get(12)?,
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
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
        "SELECT id, kind, name, location, username, password, enabled, auto_refresh_minutes, last_imported_at, created_at, updated_at FROM sources WHERE id = ?1",
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
            auto_refresh_minutes: row.get(7)?,
            last_imported_at: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
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
    auto_refresh_minutes: Option<u32>,
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
            "UPDATE sources SET name = ?1, username = ?2, password = ?3, auto_refresh_minutes = ?4, last_imported_at = datetime('now'), updated_at = datetime('now') WHERE id = ?5",
            rusqlite::params![name, username, password, auto_refresh_minutes, id],
        )?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO sources (kind, name, location, username, password, auto_refresh_minutes, created_at, updated_at, last_imported_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now'), datetime('now'))",
            rusqlite::params![kind.as_str(), name, location, username, password, auto_refresh_minutes],
        )?;
        Ok(conn.last_insert_rowid())
    }
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM sources WHERE id = ?1", [id])?;
    Ok(())
}
