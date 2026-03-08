use rusqlite::Connection;

use crate::commands::dto::SourceDto;
use crate::core::models::source::{Source, SourceKind};
use crate::error::AppResult;

pub fn list_all(conn: &Connection) -> AppResult<Vec<SourceDto>> {
    let mut stmt = conn.prepare(
        "WITH channel_stats AS (
            SELECT
                source_id,
                COUNT(*) AS channel_count,
                COUNT(DISTINCT CASE WHEN group_name IS NOT NULL AND TRIM(group_name) <> '' THEN group_name END) AS group_count,
                SUM(CASE WHEN tvg_id IS NOT NULL AND TRIM(tvg_id) <> '' THEN 1 ELSE 0 END) AS channels_with_tvg_id
            FROM channels
            GROUP BY source_id
        ),
        epg_stats AS (
            SELECT source_id, COUNT(*) AS epg_program_count
            FROM epg_programs
            GROUP BY source_id
        )
        SELECT
            s.id,
            s.kind,
            s.name,
            s.location,
            s.username,
            s.password,
            s.enabled,
            s.auto_refresh_minutes,
            COALESCE(cs.channel_count, 0) AS channel_count,
            COALESCE(cs.group_count, 0) AS group_count,
            COALESCE(cs.channels_with_tvg_id, 0) AS channels_with_tvg_id,
            COALESCE(es.epg_program_count, 0) AS epg_program_count,
            s.last_imported_at,
            s.created_at,
            s.updated_at
        FROM sources s
        LEFT JOIN channel_stats cs ON cs.source_id = s.id
        LEFT JOIN epg_stats es ON es.source_id = s.id
        ORDER BY s.name",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(SourceDto {
            id: row.get(0)?,
            kind: row.get(1)?,
            name: row.get(2)?,
            location: row.get(3)?,
            username: row.get(4)?,
            password: row.get(5)?,
            enabled: row.get::<_, i64>(6)? != 0,
            auto_refresh_minutes: row.get(7)?,
            channel_count: row.get(8)?,
            group_count: row.get(9)?,
            channels_with_tvg_id: row.get(10)?,
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
    conn.execute(
        "UPDATE sources
         SET name = ?1,
             location = ?2,
             username = ?3,
             password = ?4,
             auto_refresh_minutes = ?5,
             enabled = ?6,
             updated_at = datetime('now')
         WHERE id = ?7",
        rusqlite::params![
            name,
            location,
            username,
            password,
            auto_refresh_minutes,
            enabled as i64,
            source_id
        ],
    )?;
    Ok(())
}
