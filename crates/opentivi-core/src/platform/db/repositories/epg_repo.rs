use rusqlite::Connection;

use crate::dto::{EpgProgramDto, EpgProgramSearchResultDto};
use crate::core::models::epg::ParsedProgram;
use crate::core::services::epg_matching::{
    build_channel_candidates, merge_mapped_ids, normalize_epg_key,
};
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
            |row| Ok((row.get("tvg_id")?, row.get("tvg_name")?, row.get("name")?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                crate::error::AppError::NotFound(format!("Channel {} not found", channel_id))
            }
            other => other.into(),
        })?;

    let mut candidates = build_channel_candidates(
        tvg_id.as_deref(),
        tvg_name.as_deref(),
        channel_name.as_str(),
    );
    if candidates.is_empty() {
        return Ok(vec![]);
    }

    let mapped_ids = lookup_channel_ids_by_aliases(conn, &candidates)?;
    merge_mapped_ids(&mut candidates, mapped_ids);

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
    let rows = stmt.query_map(params_ref.as_slice(), |row| row.get::<_, String>("channel_tvg_id"))?;

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
            id: row.get("id")?,
            channel_tvg_id: row.get("channel_tvg_id")?,
            start_at: row.get("start_at")?,
            end_at: row.get("end_at")?,
            title: row.get("title")?,
            description: row.get("description")?,
            category: row.get("category")?,
        })
    })?;

    crate::platform::db::collect_rows(rows)
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !value.is_empty() && !values.iter().any(|v| v == &value) {
        values.push(value);
    }
}

pub fn search_programs(
    conn: &Connection,
    search: Option<&str>,
    limit: u32,
) -> AppResult<Vec<EpgProgramSearchResultDto>> {
    let pattern = search
        .map(|value| format!("%{}%", value.trim()))
        .filter(|value| value != "%%");

    let mut stmt = conn.prepare(
        "WITH alias_map AS (
            SELECT source_id, channel_tvg_id, alias_normalized
            FROM epg_channel_aliases
        )
        SELECT DISTINCT
            ep.id AS ep_id,
            c.id AS channel_id,
            c.source_id,
            c.name,
            c.channel_number,
            ep.channel_tvg_id,
            ep.start_at,
            ep.end_at,
            ep.title,
            ep.description,
            ep.category
        FROM epg_programs ep
        INNER JOIN channels c ON (
            LOWER(TRIM(ep.channel_tvg_id)) = LOWER(TRIM(COALESCE(c.tvg_id, '')))
            OR LOWER(REPLACE(TRIM(ep.channel_tvg_id), ' ', '')) = LOWER(REPLACE(TRIM(COALESCE(c.tvg_id, '')), ' ', ''))
            OR EXISTS (
                SELECT 1 FROM alias_map am
                WHERE am.source_id = ep.source_id
                  AND am.channel_tvg_id = ep.channel_tvg_id
                  AND am.alias_normalized = LOWER(REPLACE(TRIM(c.name), ' ', ''))
            )
        )
        INNER JOIN sources s ON s.id = c.source_id
        WHERE s.enabled = 1
          AND (?1 IS NULL OR ep.title LIKE ?1 OR COALESCE(ep.description, '') LIKE ?1)
        ORDER BY ep.start_at
        LIMIT ?2",
    )?;

    let rows = stmt.query_map(rusqlite::params![pattern, limit], |row| {
        Ok(EpgProgramSearchResultDto {
            id: row.get("ep_id")?,
            channel_id: row.get("channel_id")?,
            source_id: row.get("source_id")?,
            channel_name: row.get("name")?,
            channel_number: row.get("channel_number")?,
            channel_tvg_id: row.get("channel_tvg_id")?,
            start_at: row.get("start_at")?,
            end_at: row.get("end_at")?,
            title: row.get("title")?,
            description: row.get("description")?,
            category: row.get("category")?,
        })
    })?;

    crate::platform::db::collect_rows(rows)
}
