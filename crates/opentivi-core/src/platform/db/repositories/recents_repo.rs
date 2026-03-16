use rusqlite::Connection;

use crate::dto::RecentChannelDto;
use crate::error::AppResult;

pub fn list_recents(conn: &Connection, limit: u32) -> AppResult<Vec<RecentChannelDto>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.source_id, c.name, c.channel_number, c.group_name, c.tvg_id, c.logo_url, c.stream_url, (f.channel_id IS NOT NULL) as is_fav, r.last_watched_at, r.play_count
         FROM channels c
         INNER JOIN recents r ON c.id = r.channel_id
         INNER JOIN sources s ON s.id = c.source_id
         LEFT JOIN favorites f ON c.id = f.channel_id
         WHERE s.enabled = 1
         ORDER BY r.last_watched_at DESC
         LIMIT ?1",
    )?;

    let rows = stmt.query_map([limit], |row| {
        Ok(RecentChannelDto {
            id: row.get("id")?,
            source_id: row.get("source_id")?,
            name: row.get("name")?,
            channel_number: row.get("channel_number")?,
            group_name: row.get("group_name")?,
            tvg_id: row.get("tvg_id")?,
            logo_url: row.get("logo_url")?,
            stream_url: row.get("stream_url")?,
            is_favorite: row.get::<_, i64>("is_fav")? != 0,
            last_watched_at: row.get("last_watched_at")?,
            play_count: row.get("play_count")?,
        })
    })?;

    crate::platform::db::collect_rows(rows)
}

pub fn mark_watched(conn: &Connection, channel_id: i64) -> AppResult<()> {
    conn.execute(
        "INSERT INTO recents (channel_id, last_watched_at, play_count) VALUES (?1, datetime('now'), 1) ON CONFLICT(channel_id) DO UPDATE SET last_watched_at = datetime('now'), play_count = play_count + 1",
        [channel_id],
    )?;
    Ok(())
}
