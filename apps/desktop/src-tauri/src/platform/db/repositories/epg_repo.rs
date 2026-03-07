use rusqlite::Connection;

use crate::commands::dto::EpgProgramDto;
use crate::core::models::epg::ParsedProgram;
use crate::error::AppResult;

pub fn replace_programs(
    conn: &Connection,
    source_id: i64,
    programs: &[ParsedProgram],
) -> AppResult<u32> {
    let tx = conn.unchecked_transaction()?;

    // Delete existing programs for this source
    tx.execute("DELETE FROM epg_programs WHERE source_id = ?1", [source_id])?;

    let mut count = 0u32;
    for p in programs {
        tx.execute(
            "INSERT OR IGNORE INTO epg_programs (source_id, channel_tvg_id, start_at, end_at, title, description, category, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
            rusqlite::params![source_id, p.channel_tvg_id, p.start_at, p.end_at, p.title, p.description, p.category],
        )?;
        count += 1;
    }

    tx.commit()?;
    Ok(count)
}

pub fn get_channel_epg(
    conn: &Connection,
    channel_id: i64,
    from: Option<&str>,
    to: Option<&str>,
) -> AppResult<Vec<EpgProgramDto>> {
    // First get the tvg_id for this channel
    let tvg_id: Option<String> = conn
        .query_row(
            "SELECT tvg_id FROM channels WHERE id = ?1",
            [channel_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    let tvg_id = match tvg_id {
        Some(id) if !id.is_empty() => id,
        _ => return Ok(vec![]),
    };

    let mut sql = String::from(
        "SELECT id, channel_tvg_id, start_at, end_at, title, description, category FROM epg_programs WHERE channel_tvg_id = ?1",
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(tvg_id)];
    let mut idx = 2;

    if let Some(f) = from {
        sql.push_str(&format!(" AND end_at >= ?{}", idx));
        params.push(Box::new(f.to_string()));
        idx += 1;
    }

    if let Some(t) = to {
        sql.push_str(&format!(" AND start_at <= ?{}", idx));
        params.push(Box::new(t.to_string()));
    }

    sql.push_str(" ORDER BY start_at");

    let params_ref: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(EpgProgramDto {
            id: row.get(0)?,
            channel_tvg_id: row.get(1)?,
            start_at: row.get(2)?,
            end_at: row.get(3)?,
            title: row.get(4)?,
            description: row.get(5)?,
            category: row.get(6)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}
