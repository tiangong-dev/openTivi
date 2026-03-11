use rusqlite::Connection;

use crate::commands::dto::{ChannelListItemDto, ImportSummaryDto};
use crate::core::models::channel::{Channel, ParsedChannel};
use crate::core::services::channel_identity::normalize_channel_name;
use crate::error::AppResult;

pub fn upsert_channels(
    conn: &Connection,
    source_id: i64,
    channels: &[ParsedChannel],
) -> AppResult<ImportSummaryDto> {
    let mut imported = 0u32;
    let mut updated = 0u32;

    let tx = conn.unchecked_transaction()?;

    for ch in channels {
        let norm = normalize_channel_name(&ch.name);
        let existing: Option<i64> = tx
            .query_row(
                "SELECT id FROM channels WHERE source_id = ?1 AND channel_key = ?2",
                rusqlite::params![source_id, &ch.channel_key],
                |row| row.get(0),
            )
            .ok();

        if let Some(_id) = existing {
            tx.execute(
                "UPDATE channels SET name = ?1, normalized_name = ?2, channel_number = ?3, group_name = ?4, tvg_id = ?5, tvg_name = ?6, logo_url = ?7, stream_url = ?8, container_extension = ?9, is_live = ?10, updated_at = datetime('now') WHERE source_id = ?11 AND channel_key = ?12",
                rusqlite::params![
                    ch.name,
                    norm,
                    ch.channel_number,
                    ch.group_name,
                    ch.tvg_id,
                    ch.tvg_name,
                    ch.logo_url,
                    ch.stream_url,
                    ch.container_extension,
                    ch.is_live as i64,
                    source_id,
                    ch.channel_key,
                ],
            )?;
            updated += 1;
        } else {
            tx.execute(
                "INSERT INTO channels (channel_key, source_id, external_id, name, normalized_name, channel_number, group_name, tvg_id, tvg_name, logo_url, stream_url, container_extension, is_live, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, datetime('now'), datetime('now'))",
                rusqlite::params![
                    ch.channel_key,
                    source_id,
                    ch.external_id,
                    ch.name,
                    norm,
                    ch.channel_number,
                    ch.group_name,
                    ch.tvg_id,
                    ch.tvg_name,
                    ch.logo_url,
                    ch.stream_url,
                    ch.container_extension,
                    ch.is_live as i64,
                ],
            )?;
            imported += 1;
        }
    }

    // Remove stale channels for this source
    let keys: Vec<String> = channels.iter().map(|c| c.channel_key.clone()).collect();
    let removed = if keys.is_empty() {
        let count = tx.execute("DELETE FROM channels WHERE source_id = ?1", [source_id])?;
        count as u32
    } else {
        let placeholders: Vec<String> = (0..keys.len()).map(|i| format!("?{}", i + 2)).collect();
        let sql = format!(
            "DELETE FROM channels WHERE source_id = ?1 AND channel_key NOT IN ({})",
            placeholders.join(",")
        );
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(source_id)];
        for key in &keys {
            params.push(Box::new(key.clone()));
        }
        let params_ref: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();
        let count = tx.execute(&sql, params_ref.as_slice())?;
        count as u32
    };

    tx.commit()?;

    Ok(ImportSummaryDto {
        source_id,
        channels_imported: imported,
        channels_updated: updated,
        channels_removed: removed,
    })
}

pub fn list_channels(
    conn: &Connection,
    source_id: Option<i64>,
    group_name: Option<&str>,
    search: Option<&str>,
    favorites_only: bool,
    limit: u32,
    offset: u32,
) -> AppResult<Vec<ChannelListItemDto>> {
    let mut sql = String::from(
        "SELECT c.id, c.source_id, c.name, c.channel_number, c.group_name, c.tvg_id, c.logo_url, c.stream_url, (f.channel_id IS NOT NULL) as is_fav FROM channels c INNER JOIN sources s ON s.id = c.source_id LEFT JOIN favorites f ON c.id = f.channel_id WHERE s.enabled = 1",
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    if let Some(sid) = source_id {
        sql.push_str(&format!(" AND c.source_id = ?{}", idx));
        params.push(Box::new(sid));
        idx += 1;
    }

    if let Some(g) = group_name {
        sql.push_str(&format!(" AND c.group_name = ?{}", idx));
        params.push(Box::new(g.to_string()));
        idx += 1;
    }

    if let Some(s) = search {
        sql.push_str(&format!(" AND c.name LIKE ?{}", idx));
        params.push(Box::new(format!("%{}%", s)));
        idx += 1;
    }

    if favorites_only {
        sql.push_str(" AND f.channel_id IS NOT NULL");
    }

    sql.push_str(&format!(
        " ORDER BY c.name LIMIT ?{} OFFSET ?{}",
        idx,
        idx + 1
    ));
    params.push(Box::new(limit));
    params.push(Box::new(offset));

    let params_ref: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(ChannelListItemDto {
            id: row.get(0)?,
            source_id: row.get(1)?,
            name: row.get(2)?,
            channel_number: row.get(3)?,
            group_name: row.get(4)?,
            tvg_id: row.get(5)?,
            logo_url: row.get(6)?,
            stream_url: row.get(7)?,
            is_favorite: row.get::<_, i64>(8)? != 0,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub fn list_groups(conn: &Connection, source_id: Option<i64>) -> AppResult<Vec<String>> {
    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(sid) = source_id
    {
        (
            "SELECT DISTINCT c.group_name FROM channels c INNER JOIN sources s ON s.id = c.source_id WHERE c.group_name IS NOT NULL AND s.enabled = 1 AND c.source_id = ?1 ORDER BY c.group_name".to_string(),
            vec![Box::new(sid)],
        )
    } else {
        (
            "SELECT DISTINCT c.group_name FROM channels c INNER JOIN sources s ON s.id = c.source_id WHERE c.group_name IS NOT NULL AND s.enabled = 1 ORDER BY c.group_name".to_string(),
            vec![],
        )
    };

    let params_ref: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_ref.as_slice(), |row| row.get::<_, String>(0))?;

    let mut groups = Vec::new();
    for row in rows {
        groups.push(row?);
    }
    Ok(groups)
}

pub fn get_by_id(conn: &Connection, id: i64) -> AppResult<Option<Channel>> {
    let mut stmt = conn.prepare(
        "SELECT id, channel_key, source_id, external_id, name, normalized_name, channel_number, group_name, tvg_id, tvg_name, logo_url, stream_url, container_extension, is_live FROM channels WHERE id = ?1",
    )?;

    let result = stmt.query_row([id], |row| {
        Ok(Channel {
            id: row.get(0)?,
            channel_key: row.get(1)?,
            source_id: row.get(2)?,
            external_id: row.get(3)?,
            name: row.get(4)?,
            normalized_name: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
            channel_number: row.get(6)?,
            group_name: row.get(7)?,
            tvg_id: row.get(8)?,
            tvg_name: row.get(9)?,
            logo_url: row.get(10)?,
            stream_url: row.get(11)?,
            container_extension: row.get(12)?,
            is_live: row.get::<_, i64>(13)? != 0,
        })
    });

    match result {
        Ok(ch) => Ok(Some(ch)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn get_enabled_by_id(conn: &Connection, id: i64) -> AppResult<Option<Channel>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.channel_key, c.source_id, c.external_id, c.name, c.normalized_name, c.channel_number, c.group_name, c.tvg_id, c.tvg_name, c.logo_url, c.stream_url, c.container_extension, c.is_live
         FROM channels c
         INNER JOIN sources s ON s.id = c.source_id
         WHERE c.id = ?1 AND s.enabled = 1",
    )?;

    let result = stmt.query_row([id], |row| {
        Ok(Channel {
            id: row.get(0)?,
            channel_key: row.get(1)?,
            source_id: row.get(2)?,
            external_id: row.get(3)?,
            name: row.get(4)?,
            normalized_name: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
            channel_number: row.get(6)?,
            group_name: row.get(7)?,
            tvg_id: row.get(8)?,
            tvg_name: row.get(9)?,
            logo_url: row.get(10)?,
            stream_url: row.get(11)?,
            container_extension: row.get(12)?,
            is_live: row.get::<_, i64>(13)? != 0,
        })
    });

    match result {
        Ok(ch) => Ok(Some(ch)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Find all channels with the same normalized_name as the given channel.
/// Returns the selected channel first, then others ordered by source_id.
pub fn list_playback_candidates(conn: &Connection, channel_id: i64) -> AppResult<Vec<Channel>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.channel_key, c.source_id, c.external_id, c.name, c.normalized_name,
                c.channel_number, c.group_name, c.tvg_id, c.tvg_name, c.logo_url,
                c.stream_url, c.container_extension, c.is_live
         FROM channels c
         JOIN sources s ON c.source_id = s.id AND s.enabled = 1
         WHERE c.normalized_name = (SELECT normalized_name FROM channels WHERE id = ?1)
           AND c.normalized_name IS NOT NULL AND c.normalized_name <> ''
         ORDER BY CASE WHEN c.id = ?1 THEN 0 ELSE 1 END, c.source_id ASC",
    )?;

    let rows = stmt.query_map([channel_id], |row| {
        Ok(Channel {
            id: row.get(0)?,
            channel_key: row.get(1)?,
            source_id: row.get(2)?,
            external_id: row.get(3)?,
            name: row.get(4)?,
            normalized_name: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
            channel_number: row.get(6)?,
            group_name: row.get(7)?,
            tvg_id: row.get(8)?,
            tvg_name: row.get(9)?,
            logo_url: row.get(10)?,
            stream_url: row.get(11)?,
            container_extension: row.get(12)?,
            is_live: row.get::<_, i64>(13)? != 0,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

/// Backfill normalized_name for channels that don't have one yet.
pub fn backfill_normalized_names(conn: &Connection) -> AppResult<u32> {
    let mut stmt = conn.prepare(
        "SELECT id, name FROM channels WHERE normalized_name IS NULL OR normalized_name = ''",
    )?;
    let rows: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();

    let count = rows.len() as u32;
    for (id, name) in &rows {
        let norm = normalize_channel_name(name);
        conn.execute(
            "UPDATE channels SET normalized_name = ?1 WHERE id = ?2",
            rusqlite::params![norm, id],
        )?;
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::models::source::SourceKind;
    use crate::platform::db::repositories::source_repo;
    use crate::platform::db::migrations;

    fn seed_source(conn: &Connection, name: &str, location: &str) -> i64 {
        source_repo::upsert_source(conn, SourceKind::M3u, name, location, None, None, None)
            .expect("source should be created")
    }

    fn sample_channel(channel_key: &str, name: &str, stream_url: &str) -> ParsedChannel {
        ParsedChannel {
            channel_key: channel_key.to_string(),
            external_id: None,
            name: name.to_string(),
            channel_number: None,
            group_name: None,
            tvg_id: Some(channel_key.to_string()),
            tvg_name: None,
            logo_url: None,
            stream_url: stream_url.to_string(),
            container_extension: None,
            is_live: true,
        }
    }

    #[test]
    fn upsert_channels_keeps_same_channel_key_isolated_per_source() {
        let conn = Connection::open_in_memory().expect("db should open");
        migrations::run_migrations(&conn).expect("migrations should run");

        let source_a = seed_source(&conn, "A", "http://example.com/a.m3u");
        let source_b = seed_source(&conn, "B", "http://example.com/b.m3u");

        let channel_a = sample_channel("shared-key", "Channel A", "http://a/stream");
        let channel_b = sample_channel("shared-key", "Channel B", "http://b/stream");

        upsert_channels(&conn, source_a, &[channel_a]).expect("first upsert should succeed");
        upsert_channels(&conn, source_b, &[channel_b]).expect("second upsert should succeed");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM channels WHERE channel_key = 'shared-key'",
                [],
                |row| row.get(0),
            )
            .expect("count should query");

        assert_eq!(count, 2);
    }
}
