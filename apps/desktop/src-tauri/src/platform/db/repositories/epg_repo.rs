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
    // Build matching candidates from channel metadata.
    let (tvg_id, tvg_name, channel_name): (Option<String>, Option<String>, String) = conn
        .query_row(
            "SELECT tvg_id, tvg_name, name FROM channels WHERE id = ?1",
            [channel_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                crate::error::AppError::NotFound(format!("Channel {} not found", channel_id))
            }
            other => other.into(),
        })?;

    let mut candidates: Vec<String> = Vec::new();
    add_candidate(&mut candidates, tvg_id.as_deref());
    add_candidate(&mut candidates, tvg_name.as_deref());
    add_candidate(&mut candidates, Some(channel_name.as_str()));
    if candidates.is_empty() {
        return Ok(vec![]);
    }

    let mut normalized_placeholders = Vec::new();
    let mut compact_placeholders = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    for candidate in &candidates {
        normalized_placeholders.push(format!("?{}", idx));
        params.push(Box::new(candidate.clone()));
        idx += 1;
    }
    for candidate in &candidates {
        compact_placeholders.push(format!("?{}", idx));
        params.push(Box::new(candidate.replace(' ', "")));
        idx += 1;
    }

    let mut sql = String::from(
        "SELECT id, channel_tvg_id, start_at, end_at, title, description, category FROM epg_programs WHERE (LOWER(TRIM(channel_tvg_id)) IN (",
    );
    sql.push_str(&normalized_placeholders.join(","));
    sql.push_str(") OR LOWER(REPLACE(TRIM(channel_tvg_id), ' ', '')) IN (");
    sql.push_str(&compact_placeholders.join(","));
    sql.push_str("))");

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

fn add_candidate(candidates: &mut Vec<String>, value: Option<&str>) {
    let Some(raw) = value else {
        return;
    };
    let normalized = raw.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return;
    }
    push_unique(candidates, normalized.clone());
    push_unique(candidates, normalized.replace(' ', ""));
    if let Some((head, _)) = normalized.split_once('.') {
        let short = head.trim().to_string();
        if !short.is_empty() {
            push_unique(candidates, short);
        }
    }
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !value.is_empty() && !values.iter().any(|v| v == &value) {
        values.push(value);
    }
}
