use rusqlite::Connection;

use crate::core::models::epg::ParsedProgram;
use crate::core::services::epg_matching::{
    build_channel_candidates, merge_mapped_ids, normalize_epg_key,
};
use crate::core::services::epg_service::parse_program_time;
use crate::dto::{EpgProgramDto, EpgProgramSearchResultDto};
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
        let start_epoch = parse_program_time(&p.start_at).map(|dt| dt.timestamp());
        let end_epoch = parse_program_time(&p.end_at).map(|dt| dt.timestamp());
        tx.execute(
            "INSERT OR IGNORE INTO epg_programs (source_id, channel_tvg_id, start_at, end_at, title, description, category, start_epoch, end_epoch, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))",
            rusqlite::params![source_id, p.channel_tvg_id, p.start_at, p.end_at, p.title, p.description, p.category, start_epoch, end_epoch],
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
    let mut params: Vec<rusqlite::types::Value> = Vec::new();
    for (idx, candidate) in normalized.iter().enumerate() {
        if idx > 0 {
            sql.push(',');
        }
        sql.push_str(&format!("?{}", idx + 1));
        params.push(candidate.clone().into());
    }
    sql.push(')');

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(&params), |row| {
        row.get::<_, String>("channel_tvg_id")
    })?;

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
    let mut params: Vec<rusqlite::types::Value> = Vec::new();
    let mut idx = 1;

    for candidate in candidates {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }
        lower_placeholders.push(format!("?{}", idx));
        params.push(trimmed.to_string().into());
        idx += 1;
    }
    for candidate in candidates {
        let compact = candidate.replace(' ', "");
        if compact.is_empty() {
            continue;
        }
        compact_placeholders.push(format!("?{}", idx));
        params.push(compact.into());
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
        params.push(f.to_string().into());
        idx += 1;
    }
    if let Some(t) = to {
        sql.push_str(&format!(" AND start_at <= ?{}", idx));
        params.push(t.to_string().into());
    }
    sql.push_str(" ORDER BY start_at");

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(&params), |row| {
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

#[cfg(test)]
mod p0a_tests {
    use super::*;
    use crate::core::models::epg::ParsedProgram;
    use crate::platform::db::migrations;
    use chrono::{Datelike, Local, LocalResult, NaiveDate, TimeZone, Timelike};
    use rusqlite::Connection;

    // ── P0a tests (TDD red): replace_programs must double-write epoch ────────
    //
    // Expected to FAIL until P0a is implemented:
    //   - assertions that read start_epoch/end_epoch will be RUNTIME failures
    //     (the columns don't exist yet → the SELECT errors → .expect panics),
    //     not compile failures, because the columns are referenced only via SQL
    //     string literals.

    fn fresh_db() -> Connection {
        let conn = Connection::open_in_memory().expect("db should open");
        migrations::run_migrations(&conn).expect("migrations should run");
        conn
    }

    fn seed_source(conn: &Connection) -> i64 {
        conn.execute_batch(
            "INSERT INTO sources (kind, name, location, enabled, created_at, updated_at)
             VALUES ('m3u', 'S', 'http://example.com/x.m3u', 1, datetime('now'), datetime('now'));",
        )
        .ok();
        conn.query_row("SELECT id FROM sources LIMIT 1", [], |r| r.get(0))
            .unwrap_or(1)
    }

    fn program(channel: &str, start_at: &str, end_at: &str) -> ParsedProgram {
        ParsedProgram {
            channel_tvg_id: channel.to_string(),
            start_at: start_at.to_string(),
            end_at: end_at.to_string(),
            title: "T".to_string(),
            description: None,
            category: None,
        }
    }

    /// Read (start_at TEXT, start_epoch, end_epoch) for a channel.
    fn read_row(conn: &Connection, channel: &str) -> (String, Option<i64>, Option<i64>) {
        conn.query_row(
            "SELECT start_at, start_epoch, end_epoch FROM epg_programs WHERE channel_tvg_id = ?1",
            [channel],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .expect("row should exist and epoch columns should be selectable")
    }

    /// P0a #2: double-write with explicit timezone.
    /// "20240101060000 +0000" → start_epoch == 1704088800; start_at TEXT preserved verbatim.
    ///
    /// Catches: not writing epoch at all, wrong epoch (TZ ignored / off-by-offset),
    /// or mangling the original TEXT.
    #[test]
    fn p0a_double_writes_epoch_with_timezone() {
        let conn = fresh_db();
        let source_id = seed_source(&conn);

        let progs = vec![program(
            "ch.tz",
            "20240101060000 +0000",
            "20240101070000 +0000",
        )];
        replace_programs(&conn, source_id, &progs).expect("replace_programs should succeed");

        let (start_at_text, start_epoch, end_epoch) = read_row(&conn, "ch.tz");
        assert_eq!(
            start_at_text, "20240101060000 +0000",
            "original start_at TEXT must be preserved verbatim"
        );
        assert_eq!(
            start_epoch,
            Some(1704088800),
            "start_epoch must equal 2024-01-01 06:00:00 UTC = 1704088800"
        );
        assert_eq!(
            end_epoch,
            Some(1704092400),
            "end_epoch must equal 2024-01-01 07:00:00 UTC = 1704092400"
        );
    }

    /// P0a #3: an unparseable time string → epoch NULL, but the row is NOT lost
    /// (TEXT is still stored).
    ///
    /// Catches: dropping rows whose time can't be parsed, or writing a bogus
    /// epoch instead of NULL.
    #[test]
    fn p0a_unparseable_time_yields_null_epoch_but_keeps_row() {
        let conn = fresh_db();
        let source_id = seed_source(&conn);

        let progs = vec![program("ch.bad", "not-a-timestamp", "also-garbage")];
        replace_programs(&conn, source_id, &progs).expect("replace_programs should succeed");

        let (start_at_text, start_epoch, end_epoch) = read_row(&conn, "ch.bad");
        assert_eq!(start_at_text, "not-a-timestamp", "row TEXT must be retained");
        assert_eq!(
            start_epoch, None,
            "unparseable start_at must yield NULL start_epoch"
        );
        assert_eq!(
            end_epoch, None,
            "unparseable end_at must yield NULL end_epoch"
        );
    }

    /// P0a #4: a naked (no-timezone) timestamp is interpreted in the DEVICE LOCAL
    /// timezone, and the double-written epoch matches what chrono produces for the
    /// same naive datetime in Local. This pins the import-time parser to the same
    /// semantics as the runtime parser (epg_service::parse_program_time), so the
    /// two paths can't silently diverge.
    ///
    /// NOTE: parse_program_time is private to epg_service, so we recompute the
    /// expected value here with chrono::Local directly (same rule the runtime
    /// uses). We pick a date far from any DST boundary to keep the value
    /// unambiguous; if Local happens to be ambiguous/none for this instant we
    /// skip (extremely unlikely for a mid-day mid-month value).
    #[test]
    fn p0a_naked_timestamp_uses_local_timezone_matching_runtime() {
        let conn = fresh_db();
        let source_id = seed_source(&conn);

        // 2024-06-15 12:00:00 local, naked XMLTV compact form.
        let naked = "20240615120000";
        let expected = match Local.with_ymd_and_hms(2024, 6, 15, 12, 0, 0) {
            LocalResult::Single(dt) => dt.timestamp(),
            LocalResult::Ambiguous(dt, _) => dt.timestamp(),
            LocalResult::None => {
                eprintln!("skipping: chosen instant is a DST gap in this zone");
                return;
            }
        };

        let progs = vec![program("ch.local", naked, naked)];
        replace_programs(&conn, source_id, &progs).expect("replace_programs should succeed");

        let (_text, start_epoch, _end) = read_row(&conn, "ch.local");
        assert_eq!(
            start_epoch,
            Some(expected),
            "naked timestamp must be parsed in Local tz, matching chrono::Local recompute (= runtime parser semantics)"
        );
    }

    /// P0a #6: a naked timestamp that lands in the LOCAL DST spring-forward gap
    /// must yield NULL epoch (mirrors local_naive_to_utc's LocalResult::None).
    ///
    /// We scan for an instant that Local reports as LocalResult::None (a real DST
    /// gap in the device's zone). If the device zone has no DST gap (e.g. UTC,
    /// Asia/Shanghai), there is nothing to assert and we skip — the test cannot
    /// manufacture a gap that doesn't exist in the runtime's zone.
    ///
    /// Catches: a parser that fabricates an epoch for a non-existent local time
    /// instead of returning NULL.
    #[test]
    fn p0a_dst_gap_naked_timestamp_yields_null_epoch() {
        let conn = fresh_db();
        let source_id = seed_source(&conn);

        let Some(gap) = find_local_dst_gap() else {
            eprintln!("skipping: device local timezone has no DST gap");
            return;
        };
        let naked = format!(
            "{:04}{:02}{:02}{:02}{:02}{:02}",
            gap.year(),
            gap.month(),
            gap.day(),
            gap.hour(),
            gap.minute(),
            gap.second()
        );

        let progs = vec![program("ch.dst", &naked, &naked)];
        replace_programs(&conn, source_id, &progs).expect("replace_programs should succeed");

        let (text, start_epoch, end_epoch) = read_row(&conn, "ch.dst");
        assert_eq!(text, naked, "row TEXT must be retained even for DST-gap time");
        assert_eq!(
            start_epoch, None,
            "a naked timestamp in the local DST gap must yield NULL start_epoch"
        );
        assert_eq!(
            end_epoch, None,
            "a naked timestamp in the local DST gap must yield NULL end_epoch"
        );
    }

    /// Find a NaiveDateTime that Local maps to LocalResult::None (a DST gap), by
    /// scanning across plausible spring-forward windows.
    fn find_local_dst_gap() -> Option<chrono::NaiveDateTime> {
        for year in 2010..2030 {
            for month in [3u32, 4, 9, 10, 11] {
                for day in 1..=31u32 {
                    let Some(date) = NaiveDate::from_ymd_opt(year, month, day) else {
                        continue;
                    };
                    // DST transitions typically happen in the 0..5 local hour range.
                    for hour in 0..5u32 {
                        for minute in [0u32, 30] {
                            let Some(ndt) = date.and_hms_opt(hour, minute, 0) else {
                                continue;
                            };
                            if matches!(Local.from_local_datetime(&ndt), LocalResult::None) {
                                return Some(ndt);
                            }
                        }
                    }
                }
            }
        }
        None
    }
}

#[cfg(test)]
mod p0e_tests {
    use super::*;
    use crate::core::models::channel::ParsedChannel;
    use crate::core::models::source::SourceKind;
    use crate::platform::db::migrations;
    use crate::platform::db::repositories::{channel_repo, source_repo};
    use rusqlite::Connection;

    // ── P0e tests (TDD red): FTS5 EPG 搜索（trigram，title + description） ──────
    //
    // Expected to FAIL until P0e (migration 0014 FTS tables/triggers on
    // epg_programs + search_programs routing through trigram FTS + ADDING the
    // missing `c.deleted_time IS NULL` filter to the channels JOIN) is implemented.
    //
    // All driven through the EXISTING public API (replace_programs / search_programs
    // / upsert_channels / source_repo::delete) — no not-yet-existing Rust symbol —
    // so the test crate keeps COMPILING; the missing FTS / filter surfaces at
    // RUNTIME (red).

    fn fresh_db() -> Connection {
        let conn = Connection::open_in_memory().expect("db should open");
        migrations::run_migrations(&conn).expect("migrations should run");
        conn
    }

    fn seed_source(conn: &Connection) -> i64 {
        source_repo::upsert_source(conn, SourceKind::M3u, "S", "http://example.com/x.m3u", None, None, None)
            .expect("source should be created")
    }

    /// A channel whose tvg_id == channel_key == `tvg`, so search_programs' JOIN
    /// (ep.channel_tvg_id == c.tvg_id) connects programs to this channel.
    fn channel_with_tvg(tvg: &str, name: &str) -> ParsedChannel {
        ParsedChannel {
            channel_key: tvg.to_string(),
            external_id: None,
            name: name.to_string(),
            channel_number: None,
            group_name: None,
            tvg_id: Some(tvg.to_string()),
            tvg_name: None,
            logo_url: None,
            stream_url: "http://a/stream".to_string(),
            container_extension: None,
            is_live: true,
            catchup_type: None,
            catchup_source: None,
            catchup_days: None,
            catchup_hours: None,
        }
    }

    fn program_full(channel: &str, title: &str, description: Option<&str>) -> ParsedProgram {
        ParsedProgram {
            channel_tvg_id: channel.to_string(),
            start_at: "20240101060000 +0000".to_string(),
            end_at: "20240101070000 +0000".to_string(),
            title: title.to_string(),
            description: description.map(|d| d.to_string()),
            category: None,
        }
    }

    fn search_titles(conn: &Connection, query: &str) -> Vec<String> {
        search_programs(conn, Some(query), 100)
            .expect("search_programs should succeed")
            .into_iter()
            .map(|p| p.title)
            .collect()
    }

    /// E7 (EPG half): replace_programs is a DELETE-then-INSERT; the FTS triggers on
    /// epg_programs must keep the index in sync. After a re-import that replaces the
    /// old program with a new title, the OLD title must no longer hit and the NEW
    /// title must hit.
    ///
    /// Catches: missing AFTER DELETE/INSERT triggers on epg_programs (stale FTS:
    /// old title still searchable and/or new title never indexed).
    #[test]
    fn p0e_replace_programs_syncs_epg_fts() {
        let conn = fresh_db();
        let src = seed_source(&conn);
        channel_repo::upsert_channels(&conn, src, &[channel_with_tvg("ch.epg", "Chan")])
            .expect("seed channel");

        replace_programs(&conn, src, &[program_full("ch.epg", "Oldtitle", None)])
            .expect("first import");
        assert!(
            search_titles(&conn, "Oldtitle")
                .iter()
                .any(|t| t == "Oldtitle"),
            "precondition: old title searchable before re-import"
        );

        // Re-import (DELETE old + INSERT new).
        replace_programs(&conn, src, &[program_full("ch.epg", "Newtitle", None)])
            .expect("re-import");

        let old_hits = search_titles(&conn, "Oldtitle");
        assert!(
            !old_hits.iter().any(|t| t == "Oldtitle"),
            "old title must NOT hit after replace_programs DELETE+INSERT (stale FTS), got: {old_hits:?}"
        );
        let new_hits = search_titles(&conn, "Newtitle");
        assert!(
            new_hits.iter().any(|t| t == "Newtitle"),
            "new title must hit after re-import, got: {new_hits:?}"
        );
    }

    /// E11: EPG FTS must index DESCRIPTION, not just title. A program titled `Movie`
    /// with description containing `documentary` must be found by searching
    /// `documentary` — description search must not degrade.
    ///
    /// Catches: an FTS table that indexes only title (description search lost).
    #[test]
    fn p0e_epg_description_is_searchable() {
        let conn = fresh_db();
        let src = seed_source(&conn);
        channel_repo::upsert_channels(&conn, src, &[channel_with_tvg("ch.epg", "Chan")])
            .expect("seed channel");

        replace_programs(
            &conn,
            src,
            &[program_full("ch.epg", "Movie", Some("a fine documentary feature"))],
        )
        .expect("import");

        let hits = search_titles(&conn, "documentary");
        assert!(
            hits.iter().any(|t| t == "Movie"),
            "description term must hit (EPG FTS indexes title + description), got: {hits:?}"
        );
    }

    /// E12 (EPG half) — THE key regression: a program whose channel has been
    /// tombstoned must NOT appear in search_programs. P0e must ADD the missing
    /// `c.deleted_time IS NULL` filter to the channels JOIN in search_programs; the
    /// current code lacks it, so a tombstoned channel's programs leak into search.
    ///
    /// Catches: forgetting the tombstone filter on the search_programs channel JOIN
    /// (ghost-channel EPG entries surfacing in search results).
    #[test]
    fn p0e_search_programs_excludes_tombstoned_channel() {
        let conn = fresh_db();
        let src = seed_source(&conn);

        // Two channels so the re-import below tombstones only `ghost`.
        channel_repo::upsert_channels(
            &conn,
            src,
            &[
                channel_with_tvg("ghost", "Ghost Channel"),
                channel_with_tvg("keep", "Keep Channel"),
            ],
        )
        .expect("seed channels");

        // Programs for both channels.
        replace_programs(
            &conn,
            src,
            &[
                program_full("ghost", "Ghosttitle", None),
                program_full("keep", "Keeptitle", None),
            ],
        )
        .expect("import programs");

        assert!(
            search_titles(&conn, "Ghosttitle")
                .iter()
                .any(|t| t == "Ghosttitle"),
            "precondition: ghost program searchable before tombstone"
        );

        // Re-import channels WITHOUT `ghost` → it is tombstoned (deleted_time set).
        // Its program rows still exist (replace_programs untouched), so only the
        // search_programs `deleted_time IS NULL` filter can hide them.
        channel_repo::upsert_channels(&conn, src, &[channel_with_tvg("keep", "Keep Channel")])
            .expect("re-import tombstones ghost");

        let hits = search_titles(&conn, "Ghosttitle");
        assert!(
            !hits.iter().any(|t| t == "Ghosttitle"),
            "search_programs must exclude programs of tombstoned channels (c.deleted_time IS NULL), got: {hits:?}"
        );
    }
}

pub fn search_programs(
    conn: &Connection,
    search: Option<&str>,
    limit: u32,
) -> AppResult<Vec<EpgProgramSearchResultDto>> {
    // The channels JOIN must filter tombstoned channels (c.deleted_time IS NULL),
    // independent of FTS — otherwise a tombstoned channel's programs leak into
    // search results.
    let base = "WITH alias_map AS (
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
          AND c.deleted_time IS NULL";

    let trimmed = search.map(|v| v.trim()).filter(|v| !v.is_empty());

    let (sql, params): (String, Vec<rusqlite::types::Value>) = match trimmed {
        None => (
            format!("{base} ORDER BY ep.start_at LIMIT ?1"),
            vec![(limit as i64).into()],
        ),
        Some(term) if term.chars().count() >= 3 => {
            // ≥3 chars → trigram FTS (substring match). Wrap as an FTS string
            // literal (double-quote + escape inner quotes) to block FTS syntax.
            let literal = format!("\"{}\"", term.replace('"', "\"\""));
            (
                format!(
                    "{base} AND ep.id IN (SELECT rowid FROM epg_programs_fts WHERE epg_programs_fts MATCH ?1) ORDER BY ep.start_at LIMIT ?2"
                ),
                vec![literal.into(), (limit as i64).into()],
            )
        }
        Some(term) => {
            // <3 chars → LIKE fallback over title + description.
            let pattern = format!("%{}%", term);
            (
                format!(
                    "{base} AND (ep.title LIKE ?1 OR COALESCE(ep.description, '') LIKE ?1) ORDER BY ep.start_at LIMIT ?2"
                ),
                vec![pattern.into(), (limit as i64).into()],
            )
        }
    };

    let mut stmt = conn.prepare(&sql)?;

    let rows = stmt.query_map(rusqlite::params_from_iter(&params), |row| {
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
