use rusqlite::Connection;

use crate::dto::SourceDto;
use crate::core::models::source::{Source, SourceDisabledReason, SourceKind};
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
            s.disabled_reason,
            s.auto_refresh_minutes,
            COALESCE(cs.channel_count, 0) AS channel_count,
            COALESCE(cs.group_count, 0) AS group_count,
            COALESCE(cs.channels_with_tvg_id, 0) AS channels_with_tvg_id,
            COALESCE(es.epg_program_count, 0) AS epg_program_count,
            s.last_imported_at,
            s.last_refresh_error,
            s.last_refresh_attempt_at,
            s.consecutive_refresh_failures,
            s.next_retry_at,
            s.created_at,
            s.updated_at
        FROM sources s
        LEFT JOIN channel_stats cs ON cs.source_id = s.id
        LEFT JOIN epg_stats es ON es.source_id = s.id
        ORDER BY s.name",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(SourceDto {
            id: row.get("id")?,
            kind: row.get("kind")?,
            name: row.get("name")?,
            location: row.get("location")?,
            username: row.get("username")?,
            password: row.get("password")?,
            enabled: row.get::<_, i64>("enabled")? != 0,
            disabled_reason: row.get("disabled_reason")?,
            auto_refresh_minutes: row.get("auto_refresh_minutes")?,
            channel_count: row.get("channel_count")?,
            group_count: row.get("group_count")?,
            channels_with_tvg_id: row.get("channels_with_tvg_id")?,
            epg_program_count: row.get("epg_program_count")?,
            last_imported_at: row.get("last_imported_at")?,
            last_refresh_error: row.get("last_refresh_error")?,
            last_refresh_attempt_at: row.get("last_refresh_attempt_at")?,
            consecutive_refresh_failures: row.get("consecutive_refresh_failures")?,
            next_retry_at: row.get("next_retry_at")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    })?;

    crate::platform::db::collect_rows(rows)
}

pub fn get_by_id(conn: &Connection, id: i64) -> AppResult<Option<Source>> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, name, location, username, password, enabled, disabled_reason, auto_refresh_minutes, last_imported_at, last_refresh_error, last_refresh_attempt_at, consecutive_refresh_failures, next_retry_at, created_at, updated_at FROM sources WHERE id = ?1",
    )?;

    crate::platform::db::optional_row(stmt.query_row([id], |row| {
        let kind_str: String = row.get("kind")?;
        Ok(Source {
            id: row.get("id")?,
            kind: SourceKind::from_str(&kind_str).unwrap_or(SourceKind::M3u),
            name: row.get("name")?,
            location: row.get("location")?,
            username: row.get("username")?,
            password: row.get("password")?,
            enabled: row.get::<_, i64>("enabled")? != 0,
            disabled_reason: row.get("disabled_reason")?,
            auto_refresh_minutes: row.get("auto_refresh_minutes")?,
            last_imported_at: row.get("last_imported_at")?,
            last_refresh_error: row.get("last_refresh_error")?,
            last_refresh_attempt_at: row.get("last_refresh_attempt_at")?,
            consecutive_refresh_failures: row.get("consecutive_refresh_failures")?,
            next_retry_at: row.get("next_retry_at")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }))
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
            "UPDATE sources SET name = ?1, username = ?2, password = ?3, auto_refresh_minutes = ?4, last_imported_at = datetime('now'), last_refresh_error = NULL, last_refresh_attempt_at = datetime('now'), consecutive_refresh_failures = 0, next_retry_at = NULL, updated_at = datetime('now') WHERE id = ?5",
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
    let disabled_reason = if enabled {
        None
    } else {
        Some(SourceDisabledReason::UserDisabled.as_str())
    };
    conn.execute(
        "UPDATE sources
         SET name = ?1,
             location = ?2,
             username = ?3,
             password = ?4,
             auto_refresh_minutes = ?5,
             enabled = ?6,
             disabled_reason = ?7,
             updated_at = datetime('now')
         WHERE id = ?8",
        rusqlite::params![
            name,
            location,
            username,
            password,
            auto_refresh_minutes,
            enabled as i64,
            disabled_reason,
            source_id
        ],
    )?;
    Ok(())
}

pub fn clear_refresh_failure_state(conn: &Connection, source_id: i64) -> AppResult<()> {
    conn.execute(
        "UPDATE sources
         SET last_imported_at = datetime('now'),
             last_refresh_attempt_at = datetime('now'),
             last_refresh_error = NULL,
             consecutive_refresh_failures = 0,
             next_retry_at = NULL,
             updated_at = datetime('now')
         WHERE id = ?1",
        [source_id],
    )?;
    Ok(())
}

pub fn record_refresh_failure(conn: &Connection, source_id: i64, error: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE sources
         SET last_refresh_attempt_at = datetime('now'),
             last_refresh_error = ?2,
             consecutive_refresh_failures = consecutive_refresh_failures + 1,
             next_retry_at = datetime('now', '+' || MIN(60, CASE
                 WHEN consecutive_refresh_failures <= 0 THEN 1
                 WHEN consecutive_refresh_failures = 1 THEN 5
                 WHEN consecutive_refresh_failures = 2 THEN 15
                 ELSE 60
             END) || ' minutes'),
             updated_at = datetime('now')
         WHERE id = ?1",
        rusqlite::params![source_id, error],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::models::source::SourceKind;
    use crate::platform::db::migrations;

    #[test]
    fn refresh_failure_state_tracks_backoff_and_success_clears_it() {
        let conn = Connection::open_in_memory().expect("db should open");
        migrations::run_migrations(&conn).expect("migrations should run");

        let source_id = upsert_source(
            &conn,
            SourceKind::M3u,
            "Test",
            "http://example.com/list.m3u",
            None,
            None,
            Some(30),
        )
        .expect("source should be created");

        record_refresh_failure(&conn, source_id, "network timeout").expect("failure should persist");
        let source = get_by_id(&conn, source_id)
            .expect("query should succeed")
            .expect("source should exist");
        assert_eq!(source.consecutive_refresh_failures, 1);
        assert_eq!(source.last_refresh_error.as_deref(), Some("network timeout"));
        assert!(source.next_retry_at.is_some());

        clear_refresh_failure_state(&conn, source_id).expect("success should clear failure state");
        let source = get_by_id(&conn, source_id)
            .expect("query should succeed")
            .expect("source should exist");
        assert_eq!(source.consecutive_refresh_failures, 0);
        assert!(source.last_refresh_error.is_none());
        assert!(source.next_retry_at.is_none());
        assert!(source.last_imported_at.is_some());
    }
}
