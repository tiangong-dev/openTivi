use rusqlite::Connection;

use crate::dto::ChannelListItemDto;
use crate::error::AppResult;

pub fn list_favorites(conn: &Connection) -> AppResult<Vec<ChannelListItemDto>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.source_id, c.name, c.channel_number, c.group_name, c.tvg_id, c.logo_url, c.stream_url
         FROM channels c
         INNER JOIN favorites f ON c.id = f.channel_id
         INNER JOIN sources s ON s.id = c.source_id
         WHERE s.enabled = 1
         ORDER BY c.name",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(ChannelListItemDto {
            id: row.get("id")?,
            source_id: row.get("source_id")?,
            name: row.get("name")?,
            channel_number: row.get("channel_number")?,
            group_name: row.get("group_name")?,
            tvg_id: row.get("tvg_id")?,
            logo_url: row.get("logo_url")?,
            stream_url: row.get("stream_url")?,
            is_favorite: true,
        })
    })?;

    crate::platform::db::collect_rows(rows)
}

pub fn add_favorite(conn: &Connection, channel_id: i64) -> AppResult<()> {
    conn.execute(
        "INSERT OR IGNORE INTO favorites (channel_id, created_at) VALUES (?1, datetime('now'))",
        [channel_id],
    )?;
    Ok(())
}

pub fn remove_favorite(conn: &Connection, channel_id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM favorites WHERE channel_id = ?1", [channel_id])?;
    Ok(())
}
