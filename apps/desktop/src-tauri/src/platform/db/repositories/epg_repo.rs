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

pub fn replace_channel_aliases(
    conn: &Connection,
    source_id: i64,
    aliases: &[(String, String)],
) -> AppResult<u32> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM epg_channel_aliases WHERE source_id = ?1",
        [source_id],
    )?;

    let mut count = 0u32;
    for (channel_tvg_id, alias) in aliases {
        let normalized = normalize_epg_key(alias);
        if normalized.is_empty() {
            continue;
        }
        tx.execute(
            "INSERT OR IGNORE INTO epg_channel_aliases (source_id, channel_tvg_id, alias, alias_normalized, created_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))",
            rusqlite::params![source_id, channel_tvg_id, alias, normalized],
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

    let mapped_ids = lookup_channel_ids_by_aliases(conn, &candidates)?;
    for id in mapped_ids {
        push_unique(&mut candidates, id.to_ascii_lowercase());
        push_unique(&mut candidates, normalize_epg_key(&id));
    }

    query_programs_by_candidates(conn, &candidates, from, to)
}

fn lookup_channel_ids_by_aliases(
    conn: &Connection,
    candidates: &[String],
) -> AppResult<Vec<String>> {
    let mut normalized = Vec::new();
    for c in candidates {
        let n = normalize_epg_key(c);
        if !n.is_empty() {
            push_unique(&mut normalized, n);
        }
    }
    if normalized.is_empty() {
        return Ok(vec![]);
    }

    let mut sql = String::from(
        "SELECT DISTINCT channel_tvg_id FROM epg_channel_aliases WHERE alias_normalized IN (",
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    for (idx, candidate) in normalized.iter().enumerate() {
        if idx > 0 {
            sql.push(',');
        }
        sql.push_str(&format!("?{}", idx + 1));
        params.push(Box::new(candidate.clone()));
    }
    sql.push(')');

    let params_ref: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_ref.as_slice(), |row| row.get::<_, String>(0))?;

    let mut ids = Vec::new();
    for row in rows {
        let value = row?;
        push_unique(&mut ids, value);
    }
    Ok(ids)
}

fn query_programs_by_candidates(
    conn: &Connection,
    candidates: &[String],
    from: Option<&str>,
    to: Option<&str>,
) -> AppResult<Vec<EpgProgramDto>> {
    let mut lower_placeholders = Vec::new();
    let mut compact_placeholders = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    for candidate in candidates {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }
        lower_placeholders.push(format!("?{}", idx));
        params.push(Box::new(trimmed.to_string()));
        idx += 1;
    }
    for candidate in candidates {
        let compact = candidate.replace(' ', "");
        if compact.is_empty() {
            continue;
        }
        compact_placeholders.push(format!("?{}", idx));
        params.push(Box::new(compact));
        idx += 1;
    }

    if lower_placeholders.is_empty() || compact_placeholders.is_empty() {
        return Ok(vec![]);
    }

    let mut sql = String::from(
        "SELECT id, channel_tvg_id, start_at, end_at, title, description, category FROM epg_programs WHERE (LOWER(TRIM(channel_tvg_id)) IN (",
    );
    sql.push_str(&lower_placeholders.join(","));
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

    let lower = raw.trim().to_ascii_lowercase();
    if lower.is_empty() {
        return;
    }
    push_unique(candidates, lower.clone());
    push_unique(candidates, lower.replace(' ', ""));

    let normalized = normalize_epg_key(raw);
    push_unique(candidates, normalized.clone());

    if let Some((head, _)) = lower.split_once('.') {
        push_unique(candidates, head.trim().to_string());
    }
    if let Some(cctv_key) = extract_cctv_key(&normalized) {
        push_unique(candidates, cctv_key);
    }
}

fn normalize_epg_key(value: &str) -> String {
    let mut lowered = value.trim().to_lowercase();
    for token in ["高清", "超清", "标清", "频道", "hd", "uhd", "4k"] {
        lowered = lowered.replace(token, "");
    }

    let mut out = String::new();
    for ch in lowered.chars() {
        let is_hanzi = ('\u{4e00}'..='\u{9fff}').contains(&ch);
        if ch.is_ascii_alphanumeric() || is_hanzi {
            out.push(ch);
        }
    }
    out
}

fn extract_cctv_key(value: &str) -> Option<String> {
    let pos = value.find("cctv")?;
    let tail = &value[pos + 4..];
    let mut key = String::from("cctv");
    for ch in tail.chars() {
        if ch.is_ascii_digit() {
            key.push(ch);
            continue;
        }
        if ch == 'k' && key.len() > 4 {
            key.push('k');
        }
        break;
    }
    if key.len() > 4 {
        Some(key)
    } else {
        None
    }
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !value.is_empty() && !values.iter().any(|v| v == &value) {
        values.push(value);
    }
}
