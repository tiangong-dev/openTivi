use rusqlite::Connection;

use crate::commands::dto::{ChannelListItemDto, ImportSummaryDto};
use crate::core::models::channel::{Channel, ParsedChannel};
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
        let existing: Option<i64> = tx
            .query_row(
                "SELECT id FROM channels WHERE channel_key = ?1",
                [&ch.channel_key],
                |row| row.get(0),
            )
            .ok();

        if let Some(_id) = existing {
            tx.execute(
                "UPDATE channels SET name = ?1, channel_number = ?2, group_name = ?3, tvg_id = ?4, tvg_name = ?5, logo_url = ?6, stream_url = ?7, container_extension = ?8, is_live = ?9, updated_at = datetime('now') WHERE channel_key = ?10",
                rusqlite::params![
                    ch.name,
                    ch.channel_number,
                    ch.group_name,
                    ch.tvg_id,
                    ch.tvg_name,
                    ch.logo_url,
                    ch.stream_url,
                    ch.container_extension,
                    ch.is_live as i64,
                    ch.channel_key,
                ],
            )?;
            updated += 1;
        } else {
            tx.execute(
                "INSERT INTO channels (channel_key, source_id, external_id, name, channel_number, group_name, tvg_id, tvg_name, logo_url, stream_url, container_extension, is_live, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'), datetime('now'))",
                rusqlite::params![
                    ch.channel_key,
                    source_id,
                    ch.external_id,
                    ch.name,
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
        let params_ref: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
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
        "SELECT c.id, c.source_id, c.name, c.channel_number, c.group_name, c.tvg_id, c.logo_url, c.stream_url, (f.channel_id IS NOT NULL) as is_fav FROM channels c LEFT JOIN favorites f ON c.id = f.channel_id WHERE 1=1",
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

    sql.push_str(&format!(" ORDER BY c.name LIMIT ?{} OFFSET ?{}", idx, idx + 1));
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
    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(sid) = source_id {
        (
            "SELECT DISTINCT group_name FROM channels WHERE group_name IS NOT NULL AND source_id = ?1 ORDER BY group_name".to_string(),
            vec![Box::new(sid)],
        )
    } else {
        (
            "SELECT DISTINCT group_name FROM channels WHERE group_name IS NOT NULL ORDER BY group_name".to_string(),
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
        "SELECT id, channel_key, source_id, external_id, name, channel_number, group_name, tvg_id, tvg_name, logo_url, stream_url, container_extension, is_live FROM channels WHERE id = ?1",
    )?;

    let result = stmt.query_row([id], |row| {
        Ok(Channel {
            id: row.get(0)?,
            channel_key: row.get(1)?,
            source_id: row.get(2)?,
            external_id: row.get(3)?,
            name: row.get(4)?,
            channel_number: row.get(5)?,
            group_name: row.get(6)?,
            tvg_id: row.get(7)?,
            tvg_name: row.get(8)?,
            logo_url: row.get(9)?,
            stream_url: row.get(10)?,
            container_extension: row.get(11)?,
            is_live: row.get::<_, i64>(12)? != 0,
        })
    });

    match result {
        Ok(ch) => Ok(Some(ch)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}
