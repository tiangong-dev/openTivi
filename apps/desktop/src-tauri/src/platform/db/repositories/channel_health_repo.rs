use rusqlite::Connection;

use crate::error::AppResult;

/// Upsert health check result for a channel.
pub fn upsert_health(
    conn: &Connection,
    channel_id: i64,
    health_status: &str,
    response_time_ms: Option<i64>,
    last_error: Option<&str>,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO channel_health (channel_id, last_checked_at, health_status, response_time_ms, last_error)
         VALUES (?1, datetime('now'), ?2, ?3, ?4)
         ON CONFLICT(channel_id) DO UPDATE SET
           last_checked_at = datetime('now'),
           health_status = excluded.health_status,
           response_time_ms = excluded.response_time_ms,
           last_error = excluded.last_error",
        rusqlite::params![channel_id, health_status, response_time_ms, last_error],
    )?;
    Ok(())
}

/// Fetch channel IDs that need health checks (oldest-checked first, unknown first).
pub fn list_due_channels(
    conn: &Connection,
    stale_minutes: i64,
    limit: u32,
) -> AppResult<Vec<(i64, String)>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.stream_url
         FROM channels c
         LEFT JOIN channel_health h ON c.id = h.channel_id
         WHERE h.channel_id IS NULL
            OR h.last_checked_at IS NULL
            OR h.last_checked_at < datetime('now', '-' || ?1 || ' minutes')
         ORDER BY
           CASE WHEN h.channel_id IS NULL THEN 0 ELSE 1 END,
           h.last_checked_at ASC NULLS FIRST
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(
        rusqlite::params![stale_minutes, limit],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
    )?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

/// Check if a channel's health is freshly dead (checked within `fresh_minutes` and status = 'dead').
pub fn is_fresh_dead(conn: &Connection, channel_id: i64, fresh_minutes: i64) -> AppResult<bool> {
    let result: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0
             FROM channel_health
             WHERE channel_id = ?1
               AND health_status = 'dead'
               AND last_checked_at >= datetime('now', '-' || ?2 || ' minutes')",
            rusqlite::params![channel_id, fresh_minutes],
            |row| row.get(0),
        )
        .unwrap_or(false);
    Ok(result)
}
