use rusqlite::Connection;

use crate::core::models::channel::{Channel, ParsedChannel};
use crate::core::services::channel_identity::normalize_channel_name;
use crate::dto::{ChannelListItemDto, ImportSummaryDto};
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
        // Match including tombstones so a re-appearing channel revives in place
        // (same id) instead of inserting a duplicate row.
        let existing: Option<i64> = tx
            .query_row(
                "SELECT id FROM channels WHERE source_id = ?1 AND channel_key = ?2",
                rusqlite::params![source_id, &ch.channel_key],
                |row| row.get(0),
            )
            .ok();

        let channel_id = if let Some(id) = existing {
            // Revive: clear deleted_time back to NULL (id unchanged).
            tx.execute(
                "UPDATE channels SET name = ?1, normalized_name = ?2, channel_number = ?3, group_name = ?4, tvg_id = ?5, tvg_name = ?6, logo_url = ?7, stream_url = ?8, container_extension = ?9, is_live = ?10, catchup_type = ?11, catchup_source = ?12, catchup_days = ?13, catchup_hours = ?14, user_agent = ?15, referer = ?16, deleted_time = NULL, updated_at = datetime('now') WHERE source_id = ?17 AND channel_key = ?18",
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
                    ch.catchup_type,
                    ch.catchup_source,
                    ch.catchup_days,
                    ch.catchup_hours,
                    ch.user_agent,
                    ch.referer,
                    source_id,
                    ch.channel_key,
                ],
            )?;
            updated += 1;
            id
        } else {
            tx.execute(
                "INSERT INTO channels (channel_key, source_id, external_id, name, normalized_name, channel_number, group_name, tvg_id, tvg_name, logo_url, stream_url, container_extension, is_live, catchup_type, catchup_source, catchup_days, catchup_hours, user_agent, referer, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, datetime('now'), datetime('now'))",
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
                    ch.catchup_type,
                    ch.catchup_source,
                    ch.catchup_days,
                    ch.catchup_hours,
                    ch.user_agent,
                    ch.referer,
                ],
            )?;
            imported += 1;
            tx.last_insert_rowid()
        };

        // Rebuild this channel's group links (many-to-many). The raw
        // `group_name` column is preserved as-is above; here we derive the group
        // names by splitting it on `;` (trim + drop blank segments). Always
        // DELETE first so a changed group on re-import takes effect and a revived
        // channel rebuilds its links.
        tx.execute(
            "DELETE FROM channel_group_links WHERE channel_id = ?1",
            [channel_id],
        )?;
        if let Some(raw_group) = ch.group_name.as_deref() {
            for group_name in raw_group.split(';').map(str::trim).filter(|s| !s.is_empty()) {
                tx.execute(
                    "INSERT INTO channel_groups (source_id, name, created_at, updated_at) \
                     VALUES (?1, ?2, datetime('now'), datetime('now')) \
                     ON CONFLICT(source_id, name) DO UPDATE SET updated_at = datetime('now')",
                    rusqlite::params![source_id, group_name],
                )?;
                let group_id: i64 = tx.query_row(
                    "SELECT id FROM channel_groups WHERE source_id = ?1 AND name = ?2",
                    rusqlite::params![source_id, group_name],
                    |row| row.get(0),
                )?;
                tx.execute(
                    "INSERT OR IGNORE INTO channel_group_links (channel_id, group_id, created_at) \
                     VALUES (?1, ?2, datetime('now'))",
                    rusqlite::params![channel_id, group_id],
                )?;
            }
        }
    }

    // Tombstone (soft-delete) channels of this source that disappeared from the
    // import, instead of hard-deleting them — preserves favorites/recents and a
    // stable id for revival. `channels_removed` now counts newly tombstoned rows.
    let keys: Vec<String> = channels.iter().map(|c| c.channel_key.clone()).collect();
    let removed = if keys.is_empty() {
        let count = tx.execute(
            "UPDATE channels SET deleted_time = datetime('now') WHERE source_id = ?1 AND deleted_time IS NULL",
            [source_id],
        )?;
        count as u32
    } else {
        let placeholders: Vec<String> = (0..keys.len()).map(|i| format!("?{}", i + 2)).collect();
        let sql = format!(
            "UPDATE channels SET deleted_time = datetime('now') WHERE source_id = ?1 AND deleted_time IS NULL AND channel_key NOT IN ({})",
            placeholders.join(",")
        );
        let mut params: Vec<rusqlite::types::Value> = vec![source_id.into()];
        for key in &keys {
            params.push(key.clone().into());
        }
        let count = tx.execute(&sql, rusqlite::params_from_iter(&params))?;
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
        "SELECT c.id, c.source_id, c.name, c.channel_number, c.group_name, c.tvg_id, c.logo_url, c.stream_url, (f.channel_id IS NOT NULL) as is_fav FROM channels c INNER JOIN sources s ON s.id = c.source_id LEFT JOIN favorites f ON c.id = f.channel_id WHERE s.enabled = 1 AND c.deleted_time IS NULL",
    );
    let mut params: Vec<rusqlite::types::Value> = Vec::new();
    let mut idx = 1;

    if let Some(sid) = source_id {
        sql.push_str(&format!(" AND c.source_id = ?{}", idx));
        params.push(sid.into());
        idx += 1;
    } else {
        // Deduplicate across sources by normalized_name: keep the best candidate per name.
        // Channels without a normalized_name are always shown individually.
        sql.push_str(
            " AND (c.normalized_name IS NULL OR c.normalized_name = '' OR c.id = (\
                SELECT c2.id FROM channels c2 \
                JOIN sources s2 ON s2.id = c2.source_id AND s2.enabled = 1 \
                LEFT JOIN channel_health h2 ON c2.id = h2.channel_id \
                LEFT JOIN favorites f2 ON c2.id = f2.channel_id \
                WHERE c2.normalized_name = c.normalized_name AND c2.deleted_time IS NULL \
                ORDER BY \
                  (f2.channel_id IS NOT NULL) DESC, \
                  CASE WHEN h2.health_status = 'alive' THEN 0 WHEN h2.health_status IS NULL THEN 1 ELSE 2 END, \
                  COALESCE(h2.response_time_ms, 9999), \
                  c2.id \
                LIMIT 1))",
        );
    }

    if let Some(g) = group_name {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM channel_group_links l \
              JOIN channel_groups g ON g.id = l.group_id \
              WHERE l.channel_id = c.id AND g.source_id = c.source_id AND g.name = ?{})",
            idx
        ));
        params.push(g.to_string().into());
        idx += 1;
    }

    if let Some(s) = search {
        let trimmed = s.trim();
        if trimmed.chars().count() >= 3 {
            // ≥3 chars → trigram FTS (substring match). Wrap the user term as an
            // FTS string literal (double-quote it, escape inner quotes) so FTS5
            // query syntax can't be injected; the tombstone filter on `c` still
            // applies because we filter back through `c.id`.
            sql.push_str(&format!(
                " AND c.id IN (SELECT rowid FROM channels_fts WHERE channels_fts MATCH ?{})",
                idx
            ));
            params.push(format!("\"{}\"", trimmed.replace('"', "\"\"")).into());
        } else {
            // <3 chars → LIKE fallback (covers 2-char CJN queries trigram can't serve).
            sql.push_str(&format!(" AND c.name LIKE ?{}", idx));
            params.push(format!("%{}%", trimmed).into());
        }
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
    params.push((limit as i64).into());
    params.push((offset as i64).into());

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(&params), |row| {
        Ok(ChannelListItemDto {
            id: row.get("id")?,
            source_id: row.get("source_id")?,
            name: row.get("name")?,
            channel_number: row.get("channel_number")?,
            group_name: row.get("group_name")?,
            tvg_id: row.get("tvg_id")?,
            logo_url: row.get("logo_url")?,
            stream_url: row.get("stream_url")?,
            is_favorite: row.get::<_, i64>("is_fav")? != 0,
        })
    })?;

    crate::platform::db::collect_rows(rows)
}

pub fn list_groups(conn: &Connection, source_id: Option<i64>) -> AppResult<Vec<String>> {
    let (sql, params): (String, Vec<rusqlite::types::Value>) = if let Some(sid) = source_id {
        (
            "SELECT DISTINCT g.name FROM channel_groups g \
             JOIN channel_group_links l ON l.group_id = g.id \
             JOIN channels c ON c.id = l.channel_id AND c.deleted_time IS NULL \
             JOIN sources s ON s.id = c.source_id AND s.enabled = 1 \
             WHERE (?1 IS NULL OR g.source_id = ?1) ORDER BY g.name".to_string(),
            vec![sid.into()],
        )
    } else {
        (
            "SELECT DISTINCT g.name FROM channel_groups g \
             JOIN channel_group_links l ON l.group_id = g.id \
             JOIN channels c ON c.id = l.channel_id AND c.deleted_time IS NULL \
             JOIN sources s ON s.id = c.source_id AND s.enabled = 1 \
             WHERE (?1 IS NULL OR g.source_id = ?1) ORDER BY g.name".to_string(),
            vec![rusqlite::types::Value::Null],
        )
    };

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(&params), |row| {
        row.get::<_, String>(0)
    })?;

    crate::platform::db::collect_rows(rows)
}

pub fn get_enabled_by_id(conn: &Connection, id: i64) -> AppResult<Option<Channel>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.channel_key, c.source_id, c.external_id, c.name, c.normalized_name, c.channel_number, c.group_name, c.tvg_id, c.tvg_name, c.logo_url, c.stream_url, c.container_extension, c.is_live, c.catchup_type, c.catchup_source, c.catchup_days, c.catchup_hours, c.user_agent, c.referer
         FROM channels c
         INNER JOIN sources s ON s.id = c.source_id
         WHERE c.id = ?1 AND s.enabled = 1 AND c.deleted_time IS NULL",
    )?;

    crate::platform::db::optional_row(stmt.query_row([id], |row| {
        Ok(Channel {
            id: row.get("id")?,
            channel_key: row.get("channel_key")?,
            source_id: row.get("source_id")?,
            external_id: row.get("external_id")?,
            name: row.get("name")?,
            normalized_name: row
                .get::<_, Option<String>>("normalized_name")?
                .unwrap_or_default(),
            channel_number: row.get("channel_number")?,
            group_name: row.get("group_name")?,
            tvg_id: row.get("tvg_id")?,
            tvg_name: row.get("tvg_name")?,
            logo_url: row.get("logo_url")?,
            stream_url: row.get("stream_url")?,
            container_extension: row.get("container_extension")?,
            is_live: row.get::<_, i64>("is_live")? != 0,
            catchup_type: row.get("catchup_type")?,
            catchup_source: row.get("catchup_source")?,
            catchup_days: row.get("catchup_days")?,
            catchup_hours: row.get("catchup_hours")?,
            user_agent: row.get("user_agent")?,
            referer: row.get("referer")?,
        })
    }))
}

pub fn get_enabled_channel_dto_by_id(
    conn: &Connection,
    id: i64,
) -> AppResult<Option<ChannelListItemDto>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.source_id, c.name, c.channel_number, c.group_name, c.tvg_id, c.logo_url, c.stream_url, (f.channel_id IS NOT NULL) as is_fav
         FROM channels c
         INNER JOIN sources s ON s.id = c.source_id
         LEFT JOIN favorites f ON c.id = f.channel_id
         WHERE c.id = ?1 AND s.enabled = 1 AND c.deleted_time IS NULL",
    )?;

    crate::platform::db::optional_row(stmt.query_row([id], |row| {
        Ok(ChannelListItemDto {
            id: row.get("id")?,
            source_id: row.get("source_id")?,
            name: row.get("name")?,
            channel_number: row.get("channel_number")?,
            group_name: row.get("group_name")?,
            tvg_id: row.get("tvg_id")?,
            logo_url: row.get("logo_url")?,
            stream_url: row.get("stream_url")?,
            is_favorite: row.get::<_, i64>("is_fav")? != 0,
        })
    }))
}

/// Find all channels with the same normalized_name as the given channel.
/// Returns the selected channel first, then others ordered by source_id.
pub fn list_playback_candidates(conn: &Connection, channel_id: i64) -> AppResult<Vec<Channel>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.channel_key, c.source_id, c.external_id, c.name, c.normalized_name,
                c.channel_number, c.group_name, c.tvg_id, c.tvg_name, c.logo_url,
                c.stream_url, c.container_extension, c.is_live,
                c.catchup_type, c.catchup_source, c.catchup_days, c.catchup_hours,
                c.user_agent, c.referer
         FROM channels c
         JOIN sources s ON c.source_id = s.id AND s.enabled = 1
         LEFT JOIN channel_health h ON c.id = h.channel_id
         WHERE c.normalized_name = (SELECT normalized_name FROM channels WHERE id = ?1)
           AND c.normalized_name IS NOT NULL AND c.normalized_name <> ''
           AND c.deleted_time IS NULL
         ORDER BY
           CASE WHEN h.health_status = 'alive' THEN 0
                WHEN h.health_status IS NULL THEN 1
                ELSE 2 END,
           COALESCE(h.response_time_ms, 9999) ASC,
           CASE WHEN c.id = ?1 THEN 0 ELSE 1 END",
    )?;

    let rows = stmt.query_map([channel_id], |row| {
        Ok(Channel {
            id: row.get("id")?,
            channel_key: row.get("channel_key")?,
            source_id: row.get("source_id")?,
            external_id: row.get("external_id")?,
            name: row.get("name")?,
            normalized_name: row
                .get::<_, Option<String>>("normalized_name")?
                .unwrap_or_default(),
            channel_number: row.get("channel_number")?,
            group_name: row.get("group_name")?,
            tvg_id: row.get("tvg_id")?,
            tvg_name: row.get("tvg_name")?,
            logo_url: row.get("logo_url")?,
            stream_url: row.get("stream_url")?,
            container_extension: row.get("container_extension")?,
            is_live: row.get::<_, i64>("is_live")? != 0,
            catchup_type: row.get("catchup_type")?,
            catchup_source: row.get("catchup_source")?,
            catchup_days: row.get("catchup_days")?,
            catchup_hours: row.get("catchup_hours")?,
            user_agent: row.get("user_agent")?,
            referer: row.get("referer")?,
        })
    })?;

    crate::platform::db::collect_rows(rows)
}

/// Backfill normalized_name for channels that don't have one yet.
pub fn backfill_normalized_names(conn: &Connection) -> AppResult<u32> {
    let mut stmt = conn.prepare(
        "SELECT id, name FROM channels WHERE normalized_name IS NULL OR normalized_name = ''",
    )?;
    let rows: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get("id")?, row.get("name")?)))?
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
    use crate::platform::db::migrations;
    use crate::platform::db::repositories::{
        channel_health_repo, favorites_repo, recents_repo, source_repo,
    };

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
            catchup_type: None,
            catchup_source: None,
            catchup_days: None,
            catchup_hours: None,
            user_agent: None,
            referer: None,
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

    // ── P0b tests (TDD red): 软删除 + 稳定频道身份 ───────────────────────────
    //
    // Expected to FAIL until P0b (soft-delete in upsert_channels + tombstone
    // filtering in read paths) is implemented. They reference `deleted_time` as a
    // SQL string literal so the test crate still COMPILES before the column exists;
    // the column-not-found error then surfaces at RUNTIME (red), not as a compile
    // error.

    /// Fetch (id, deleted_time) for a channel by source + channel_key.
    /// Uses a string-literal SQL column reference so it compiles before P0b lands.
    fn channel_row(
        conn: &Connection,
        source_id: i64,
        channel_key: &str,
    ) -> Option<(i64, Option<String>)> {
        conn.query_row(
            "SELECT id, deleted_time FROM channels WHERE source_id = ?1 AND channel_key = ?2",
            rusqlite::params![source_id, channel_key],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok()
    }

    /// P0b #2: identity stability — re-importing the same channel_key for the same
    /// source twice must keep the same `channels.id` (no churn that would orphan
    /// favorites/recents pointing at the old id).
    ///
    /// Catches: an upsert that deletes+reinserts (new id) instead of in-place
    /// update, breaking stable identity.
    #[test]
    fn p0b_identity_stable_across_consecutive_upserts() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let ch = sample_channel("ch1", "Channel 1", "http://a/1");
        upsert_channels(&conn, src, std::slice::from_ref(&ch)).expect("first upsert");
        let (id1, _) = channel_row(&conn, src, "ch1").expect("ch1 must exist after first import");

        let ch2 = sample_channel("ch1", "Channel 1 renamed", "http://a/1");
        upsert_channels(&conn, src, &[ch2]).expect("second upsert");
        let (id2, deleted) = channel_row(&conn, src, "ch1").expect("ch1 must still exist");

        assert_eq!(id1, id2, "channels.id must be stable across re-imports");
        assert!(deleted.is_none(), "still-present channel must not be tombstoned");
    }

    /// P0b #3: a channel that disappears from a refresh is tombstoned (NOT hard
    /// deleted); its row survives, deleted_time is set, the favorite row survives,
    /// and read paths (list_channels / list_favorites) no longer return it.
    ///
    /// Catches: the current DELETE-stale behavior (favorites lost via FK/orphan,
    /// row gone), or a tombstone that fails to hide the channel from read paths.
    #[test]
    fn p0b_disappear_tombstones_and_keeps_favorite() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let ch1 = sample_channel("ch1", "Channel 1", "http://a/1");
        let ch2 = sample_channel("ch2", "Channel 2", "http://a/2");
        upsert_channels(&conn, src, &[ch1, ch2.clone()]).expect("initial import");
        let (ch1_id, _) = channel_row(&conn, src, "ch1").expect("ch1 must exist");

        favorites_repo::add_favorite(&conn, ch1_id).expect("favorite ch1");

        // Re-import WITHOUT ch1.
        upsert_channels(&conn, src, &[ch2]).expect("second import drops ch1");

        // Row still present, but tombstoned.
        let (still_id, deleted) =
            channel_row(&conn, src, "ch1").expect("ch1 row must NOT be hard-deleted");
        assert_eq!(still_id, ch1_id, "tombstoned row keeps its id");
        assert!(
            deleted.is_some(),
            "disappeared channel must have deleted_time set (tombstone)"
        );

        // Favorite row still present in DB.
        let fav_rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM favorites WHERE channel_id = ?1",
                [ch1_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(fav_rows, 1, "favorite row must survive tombstoning");

        // Read paths must exclude the tombstone.
        let channels = list_channels(&conn, Some(src), None, None, false, 100, 0)
            .expect("list_channels");
        assert!(
            !channels.iter().any(|c| c.id == ch1_id),
            "list_channels must hide tombstoned channel"
        );
        let favs = favorites_repo::list_favorites(&conn).expect("list_favorites");
        assert!(
            !favs.iter().any(|c| c.id == ch1_id),
            "list_favorites must hide tombstoned channel"
        );
    }

    /// P0b #4: a channel that re-appears in a later import is revived in place —
    /// same id, deleted_time back to NULL — and its favorite resurfaces.
    ///
    /// Catches: revival as a NEW row (new id, orphaned favorite), or failing to
    /// clear deleted_time so the revived channel stays hidden.
    #[test]
    fn p0b_reappear_revives_same_id_and_restores_favorite() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let ch1 = sample_channel("ch1", "Channel 1", "http://a/1");
        upsert_channels(&conn, src, std::slice::from_ref(&ch1)).expect("initial import");
        let (orig_id, _) = channel_row(&conn, src, "ch1").expect("ch1 must exist");
        favorites_repo::add_favorite(&conn, orig_id).expect("favorite ch1");

        // Disappear → tombstone.
        upsert_channels(&conn, src, &[]).expect("empty import tombstones");

        // Re-appear → revive.
        upsert_channels(&conn, src, &[ch1]).expect("re-import revives ch1");

        let (revived_id, deleted) =
            channel_row(&conn, src, "ch1").expect("ch1 must exist after revive");
        assert_eq!(revived_id, orig_id, "revived channel must keep its original id");
        assert!(
            deleted.is_none(),
            "revived channel must have deleted_time cleared back to NULL"
        );

        let favs = favorites_repo::list_favorites(&conn).expect("list_favorites");
        assert!(
            favs.iter().any(|c| c.id == orig_id),
            "list_favorites must return the channel again after revival"
        );
    }

    /// P0b #5: recents survive the tombstone→revive round trip with play_count and
    /// last_watched_at intact, and resurface in list_recents after revival.
    ///
    /// Catches: hard-deleting the channel (recents orphaned/lost), or revival as a
    /// new id so the old recents row no longer joins.
    #[test]
    fn p0b_recents_survive_tombstone_and_revive() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let ch1 = sample_channel("ch1", "Channel 1", "http://a/1");
        upsert_channels(&conn, src, std::slice::from_ref(&ch1)).expect("initial import");
        let (id, _) = channel_row(&conn, src, "ch1").expect("ch1 must exist");

        recents_repo::mark_watched(&conn, id).expect("mark watched 1");
        recents_repo::mark_watched(&conn, id).expect("mark watched 2");

        let (count_before, last_before): (i64, String) = conn
            .query_row(
                "SELECT play_count, last_watched_at FROM recents WHERE channel_id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("recents row must exist");
        assert_eq!(count_before, 2, "play_count must be 2 after two watches");

        // Tombstone then revive.
        upsert_channels(&conn, src, &[]).expect("empty import tombstones");
        upsert_channels(&conn, src, &[ch1]).expect("re-import revives ch1");

        let (count_after, last_after): (i64, String) = conn
            .query_row(
                "SELECT play_count, last_watched_at FROM recents WHERE channel_id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("recents row must survive tombstone+revive");
        assert_eq!(count_after, count_before, "play_count must be preserved");
        assert_eq!(last_after, last_before, "last_watched_at must be preserved");

        let recents = recents_repo::list_recents(&conn, 50).expect("list_recents");
        assert!(
            recents.iter().any(|r| r.id == id),
            "list_recents must return the channel again after revival"
        );
    }

    /// P0b #6: per-source isolation — refreshing source A so its channel disappears
    /// must tombstone ONLY A's row; source B's row with the same channel_key stays
    /// alive (deleted_time NULL).
    ///
    /// Catches: a tombstone WHERE clause missing the source_id filter, which would
    /// wrongly tombstone every source sharing a channel_key.
    #[test]
    fn p0b_tombstone_is_isolated_per_source() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src_a = seed_source(&conn, "A", "http://example.com/a.m3u");
        let src_b = seed_source(&conn, "B", "http://example.com/b.m3u");

        let ch_a = sample_channel("shared", "A Channel", "http://a/s");
        let ch_b = sample_channel("shared", "B Channel", "http://b/s");
        upsert_channels(&conn, src_a, &[ch_a]).expect("import A");
        upsert_channels(&conn, src_b, &[ch_b]).expect("import B");

        // Refresh A with empty list → A disappears.
        upsert_channels(&conn, src_a, &[]).expect("empty refresh A");

        let (_, deleted_a) = channel_row(&conn, src_a, "shared").expect("A row must exist");
        let (_, deleted_b) = channel_row(&conn, src_b, "shared").expect("B row must exist");

        assert!(deleted_a.is_some(), "source A's channel must be tombstoned");
        assert!(
            deleted_b.is_none(),
            "source B's same-key channel must stay alive (deleted_time NULL)"
        );
    }

    /// P0b #7: an empty import list tombstones (NOT hard-deletes) all surviving
    /// channels of that source, and favorites are preserved.
    ///
    /// Catches: the current `DELETE FROM channels WHERE source_id = ?` empty-list
    /// branch (hard wipe + favorites lost) instead of mass-tombstoning.
    #[test]
    fn p0b_empty_import_tombstones_all_not_hard_delete() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let ch1 = sample_channel("ch1", "Channel 1", "http://a/1");
        let ch2 = sample_channel("ch2", "Channel 2", "http://a/2");
        upsert_channels(&conn, src, &[ch1, ch2]).expect("initial import");
        let (ch1_id, _) = channel_row(&conn, src, "ch1").expect("ch1 must exist");
        favorites_repo::add_favorite(&conn, ch1_id).expect("favorite ch1");

        upsert_channels(&conn, src, &[]).expect("empty import");

        // Rows must still be present (not hard-deleted) and all tombstoned.
        let total: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM channels WHERE source_id = ?1",
                [src],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(total, 2, "empty import must NOT hard-delete rows");

        let alive: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM channels WHERE source_id = ?1 AND deleted_time IS NULL",
                [src],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(alive, 0, "empty import must tombstone every surviving channel");

        let fav_rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM favorites WHERE channel_id = ?1",
                [ch1_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(fav_rows, 1, "favorites must survive an empty import");
    }

    /// P0b #8: read paths filter tombstones — a tombstoned channel must be absent
    /// from list_channels, list_groups, list_favorites, list_recents,
    /// list_playback_candidates and channel_health_repo::list_due_channels, and
    /// get_enabled_by_id must return None for it.
    ///
    /// Catches: any read path that forgot to add the `deleted_time IS NULL` filter,
    /// leaking ghost channels into the UI / playback / health-check rotation.
    #[test]
    fn p0b_read_paths_filter_tombstones() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        // ch_keep stays; ch_ghost will be tombstoned. Give ch_ghost a group so
        // list_groups has something to (wrongly) leak.
        let mut ch_ghost = sample_channel("ghost", "Ghost", "http://a/ghost");
        ch_ghost.group_name = Some("GhostGroup".to_string());
        let ch_keep = sample_channel("keep", "Keep", "http://a/keep");
        upsert_channels(&conn, src, &[ch_ghost, ch_keep]).expect("initial import");

        let (ghost_id, _) = channel_row(&conn, src, "ghost").expect("ghost must exist");

        // Reference the ghost from favorites + recents so its tombstone is the only
        // reason it should be filtered out of those lists.
        favorites_repo::add_favorite(&conn, ghost_id).expect("favorite ghost");
        recents_repo::mark_watched(&conn, ghost_id).expect("watch ghost");

        // Tombstone ghost by re-importing without it.
        let ch_keep2 = sample_channel("keep", "Keep", "http://a/keep");
        upsert_channels(&conn, src, &[ch_keep2]).expect("re-import drops ghost");

        // list_channels
        let channels =
            list_channels(&conn, Some(src), None, None, false, 100, 0).expect("list_channels");
        assert!(
            !channels.iter().any(|c| c.id == ghost_id),
            "list_channels must filter tombstones"
        );

        // list_groups must not leak the tombstoned channel's group.
        let groups = list_groups(&conn, Some(src)).expect("list_groups");
        assert!(
            !groups.iter().any(|g| g == "GhostGroup"),
            "list_groups must filter groups whose only channel is tombstoned"
        );

        // list_favorites
        let favs = favorites_repo::list_favorites(&conn).expect("list_favorites");
        assert!(
            !favs.iter().any(|c| c.id == ghost_id),
            "list_favorites must filter tombstones"
        );

        // list_recents
        let recents = recents_repo::list_recents(&conn, 50).expect("list_recents");
        assert!(
            !recents.iter().any(|r| r.id == ghost_id),
            "list_recents must filter tombstones"
        );

        // list_playback_candidates (query the surviving channel; ghost shares no
        // normalized_name here, but assert ghost never appears regardless).
        let candidates =
            list_playback_candidates(&conn, ghost_id).expect("list_playback_candidates");
        assert!(
            !candidates.iter().any(|c| c.id == ghost_id),
            "list_playback_candidates must filter tombstones"
        );

        // channel_health_repo::list_due_channels (ghost has no health row, so
        // without a tombstone filter it WOULD be returned as due).
        let due = channel_health_repo::list_due_channels(&conn, 0, 100)
            .expect("list_due_channels");
        assert!(
            !due.iter().any(|(id, _)| *id == ghost_id),
            "list_due_channels must filter tombstones"
        );

        // get_enabled_by_id
        let got = get_enabled_by_id(&conn, ghost_id).expect("get_enabled_by_id");
        assert!(got.is_none(), "get_enabled_by_id(tombstone) must return None");
    }

    // ── P0c tests (TDD red): 频道 ↔ 分组 多对多 ───────────────────────────────
    //
    // Expected to FAIL until P0c (migration 0012 + group splitting in
    // upsert_channels + rerouting list_groups/list_channels through the link
    // tables) is implemented.
    //
    // CRITICAL: every new behaviour is asserted through the EXISTING public API
    // (parse_m3u / upsert_channels / list_groups / list_channels) plus RAW SQL
    // STRING LITERALS against the new tables (`channel_groups`,
    // `channel_group_links`). No reference to a not-yet-existing Rust symbol
    // (e.g. `ParsedChannel.groups`, a new repo fn), so the test crate keeps
    // COMPILING — the missing tables / unsplit groups surface at RUNTIME (red).

    use crate::core::parsers::m3u::parse_m3u;

    /// Count link rows for a channel, joined to channel_groups, filtered to a
    /// given source. Pure SQL-literal so it compiles before the tables exist.
    fn link_group_names(conn: &Connection, channel_id: i64) -> Vec<String> {
        conn.prepare(
            "SELECT g.name FROM channel_group_links l \
             JOIN channel_groups g ON g.id = l.group_id \
             WHERE l.channel_id = ?1 ORDER BY g.name",
        )
        .unwrap()
        .query_map([channel_id], |row| row.get::<_, String>(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    }

    /// Number of link rows for a channel (regardless of group).
    fn link_count(conn: &Connection, channel_id: i64) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM channel_group_links WHERE channel_id = ?1",
            [channel_id],
            |r| r.get(0),
        )
        .unwrap()
    }

    /// Build a one-channel M3U with a given group-title literal.
    fn m3u_one(tvg_id: &str, name: &str, group_title: &str, url: &str) -> String {
        format!(
            "#EXTM3U\n#EXTINF:-1 tvg-id=\"{tvg_id}\" group-title=\"{group_title}\",{name}\n{url}\n"
        )
    }

    /// P0c #2: a `group-title="A;B;C"` is split on `;` into THREE group links
    /// (A, B, C) while the original `channels.group_name` column still holds the
    /// raw whole string `"A;B;C"`.
    ///
    /// Catches: not splitting at all (one link / link to the literal "A;B;C"),
    /// or destroying the original group_name column when splitting.
    #[test]
    fn p0c_multi_group_title_splits_into_three_links() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let parsed = parse_m3u(&m3u_one("ch1", "Channel 1", "A;B;C", "http://a/1"))
            .expect("parse m3u");
        upsert_channels(&conn, src, &parsed).expect("upsert");

        let (ch_id, _) = channel_row(&conn, src, "ch1").expect("ch1 must exist");

        // Three split links, exactly A/B/C.
        assert_eq!(
            link_group_names(&conn, ch_id),
            vec!["A".to_string(), "B".to_string(), "C".to_string()],
            "group-title \"A;B;C\" must split into 3 links A/B/C"
        );

        // Original group_name column keeps the raw whole string (existing field).
        let raw: Option<String> = conn
            .query_row(
                "SELECT group_name FROM channels WHERE id = ?1",
                [ch_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            raw.as_deref(),
            Some("A;B;C"),
            "channels.group_name must keep the original whole string"
        );
    }

    /// P0c #2b: blank segments in a `group-title="A;;B"` are filtered, yielding
    /// only A and B (not an empty-named group).
    ///
    /// Catches: a naive split that emits an empty-string group for the `;;`.
    #[test]
    fn p0c_blank_group_segments_are_filtered() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let parsed = parse_m3u(&m3u_one("ch1", "Channel 1", "A;;B", "http://a/1"))
            .expect("parse m3u");
        upsert_channels(&conn, src, &parsed).expect("upsert");
        let (ch_id, _) = channel_row(&conn, src, "ch1").expect("ch1 must exist");

        assert_eq!(
            link_group_names(&conn, ch_id),
            vec!["A".to_string(), "B".to_string()],
            "\"A;;B\" must yield only A and B (blank segment filtered)"
        );
        assert_eq!(link_count(&conn, ch_id), 2, "exactly 2 links, no empty group");
    }

    /// P0c #3: a channel belonging to two groups [A, B] resolves to both groups
    /// in list_groups and has exactly 2 link rows.
    ///
    /// Catches: list_groups still reading the raw group_name (would surface the
    /// literal "A;B"), or the writer recording fewer than 2 links.
    #[test]
    fn p0c_channel_in_two_groups_lists_both() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let parsed = parse_m3u(&m3u_one("ch1", "Channel 1", "A;B", "http://a/1"))
            .expect("parse m3u");
        upsert_channels(&conn, src, &parsed).expect("upsert");
        let (ch_id, _) = channel_row(&conn, src, "ch1").expect("ch1 must exist");

        assert_eq!(link_count(&conn, ch_id), 2, "channel must have 2 links");

        let groups = list_groups(&conn, Some(src)).expect("list_groups");
        assert!(groups.contains(&"A".to_string()), "list_groups must contain A, got {groups:?}");
        assert!(groups.contains(&"B".to_string()), "list_groups must contain B, got {groups:?}");
        assert!(
            !groups.contains(&"A;B".to_string()),
            "list_groups must NOT surface the raw \"A;B\" string"
        );
    }

    /// P0c #4: tombstoned channel's groups do not leak from list_groups (when
    /// it solely owns the group), but its link rows REMAIN in
    /// channel_group_links (tombstone keeps links for revival).
    ///
    /// Catches: list_groups leaking a group whose only channel is tombstoned
    /// (no join to alive channels), OR the writer hard-deleting link rows on
    /// tombstone (which would lose group membership across a refresh blip).
    #[test]
    fn p0c_tombstoned_channel_group_does_not_leak_but_links_remain() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        // ch1 solely owns group X.
        let parsed = parse_m3u(&m3u_one("ch1", "Channel 1", "X", "http://a/1"))
            .expect("parse m3u");
        upsert_channels(&conn, src, &parsed).expect("import ch1");
        let (ch1_id, _) = channel_row(&conn, src, "ch1").expect("ch1 must exist");
        favorites_repo::add_favorite(&conn, ch1_id).expect("favorite ch1");

        // Empty import → ch1 tombstoned.
        upsert_channels(&conn, src, &[]).expect("empty import tombstones ch1");

        // X must NOT leak (ch1 is the only owner and it is tombstoned).
        let groups = list_groups(&conn, Some(src)).expect("list_groups");
        assert!(
            !groups.contains(&"X".to_string()),
            "list_groups must not leak a group whose only channel is tombstoned, got {groups:?}"
        );

        // But the link row(s) must REMAIN (tombstone preserves links).
        assert_eq!(
            link_count(&conn, ch1_id),
            1,
            "tombstoned channel must keep its channel_group_links row"
        );
    }

    /// P0c #5: re-importing a tombstoned channel (same group X) revives it —
    /// list_groups contains X again and the channel id is unchanged.
    ///
    /// Catches: revival that fails to re-expose the group (e.g. links lost on
    /// tombstone and not rebuilt), or revival as a new channel id.
    #[test]
    fn p0c_revived_channel_restores_group() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let m3u = m3u_one("ch1", "Channel 1", "X", "http://a/1");
        let parsed = parse_m3u(&m3u).expect("parse m3u");
        upsert_channels(&conn, src, &parsed).expect("import ch1");
        let (orig_id, _) = channel_row(&conn, src, "ch1").expect("ch1 must exist");

        // Tombstone, then revive with the same group.
        upsert_channels(&conn, src, &[]).expect("empty import tombstones");
        let parsed2 = parse_m3u(&m3u).expect("parse m3u again");
        upsert_channels(&conn, src, &parsed2).expect("re-import revives ch1");

        let (revived_id, deleted) = channel_row(&conn, src, "ch1").expect("ch1 must exist");
        assert_eq!(revived_id, orig_id, "revived channel must keep its id");
        assert!(deleted.is_none(), "revived channel must not be tombstoned");

        // The link to X must be present after revival (asserted via the link table
        // so this is red until P0c lands, not a false green off the raw column).
        assert_eq!(
            link_group_names(&conn, revived_id),
            vec!["X".to_string()],
            "revived channel must link to group X again"
        );

        let groups = list_groups(&conn, Some(src)).expect("list_groups");
        assert!(
            groups.contains(&"X".to_string()),
            "list_groups must contain X again after revival, got {groups:?}"
        );
    }

    /// P0c #6: per-source isolation — source A and source B each have a group
    /// named "News" → channel_groups holds 2 distinct rows (UNIQUE(source_id,
    /// name)); deleting source A leaves source B's group and links intact.
    ///
    /// Catches: a global (non per-source) group table that would collapse the
    /// two "News" into one row, or a delete-source path that wipes the wrong
    /// source's group rows / link rows.
    #[test]
    fn p0c_groups_are_isolated_per_source() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src_a = seed_source(&conn, "A", "http://example.com/a.m3u");
        let src_b = seed_source(&conn, "B", "http://example.com/b.m3u");

        let pa = parse_m3u(&m3u_one("a1", "A1", "News", "http://a/1")).unwrap();
        let pb = parse_m3u(&m3u_one("b1", "B1", "News", "http://b/1")).unwrap();
        upsert_channels(&conn, src_a, &pa).expect("import A");
        upsert_channels(&conn, src_b, &pb).expect("import B");

        // Two distinct "News" group rows, one per source.
        let news_rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM channel_groups WHERE name = 'News'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            news_rows, 2,
            "each source must own its own \"News\" group row (UNIQUE(source_id,name))"
        );

        let (b1_id, _) = channel_row(&conn, src_b, "b1").expect("b1 must exist");

        // Delete source A entirely.
        source_repo::delete(&conn, src_a).expect("delete source A");

        // Source B's group still present...
        let b_news_rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM channel_groups WHERE source_id = ?1 AND name = 'News'",
                [src_b],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(b_news_rows, 1, "deleting source A must not remove source B's group");

        // ...and source B's link survives.
        assert_eq!(
            link_count(&conn, b1_id),
            1,
            "deleting source A must not remove source B's links"
        );

        let groups_b = list_groups(&conn, Some(src_b)).expect("list_groups B");
        assert!(
            groups_b.contains(&"News".to_string()),
            "source B must still list its News group after A is deleted, got {groups_b:?}"
        );
    }

    /// P0c #7: changing a channel's group on re-import takes effect — first
    /// import groups=[A], re-import groups=[B] → list_channels filtered by A no
    /// longer returns it, filtered by B does (requires rebuilding link rows).
    ///
    /// Catches: an append-only link writer that keeps the stale [A] link (so the
    /// channel would wrongly still show under A), or list_channels still
    /// filtering on the raw group_name column instead of the link tables.
    #[test]
    fn p0c_changing_group_on_reimport_takes_effect() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let p_a = parse_m3u(&m3u_one("ch1", "Channel 1", "A", "http://a/1")).unwrap();
        upsert_channels(&conn, src, &p_a).expect("import group A");

        // Re-import same channel_key with group B.
        let p_b = parse_m3u(&m3u_one("ch1", "Channel 1", "B", "http://a/1")).unwrap();
        upsert_channels(&conn, src, &p_b).expect("re-import group B");

        let (ch_id, _) = channel_row(&conn, src, "ch1").expect("ch1 must exist");

        // Links must be REBUILT to exactly [B] (no stale [A] link). Asserted via
        // the link table so this is red until P0c lands and pins the rebuild — a
        // raw-group_name-only check would falsely pass today.
        assert_eq!(
            link_group_names(&conn, ch_id),
            vec!["B".to_string()],
            "re-import must rebuild links to exactly [B], dropping the stale [A] link"
        );

        // Filtering by A must NOT return it anymore.
        let by_a = list_channels(&conn, Some(src), Some("A"), None, false, 100, 0)
            .expect("list_channels by A");
        assert!(
            !by_a.iter().any(|c| c.id == ch_id),
            "after switching to group B, filtering by A must not return the channel"
        );

        // Filtering by B must return it.
        let by_b = list_channels(&conn, Some(src), Some("B"), None, false, 100, 0)
            .expect("list_channels by B");
        assert!(
            by_b.iter().any(|c| c.id == ch_id),
            "after switching to group B, filtering by B must return the channel"
        );
    }

    /// P0c #8: list_groups de-duplicates — N channels in one source all sharing
    /// group "Sports" yield exactly ONE "Sports" entry.
    ///
    /// The group comes via the split path (group-title "Sports;Live") so the raw
    /// group_name column is "Sports;Live" — a list_groups that read the raw
    /// column would surface "Sports;Live" (and never a bare "Sports"), which the
    /// `count == 1 for Sports` assertion below would also fail. This pins
    /// list_groups to the link tables AND to de-duplication.
    ///
    /// Catches: list_groups returning duplicate "Sports" rows (missing DISTINCT
    /// across the join), or surfacing the raw multi-group string.
    #[test]
    fn p0c_list_groups_dedupes_shared_group() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let m3u = format!(
            "#EXTM3U\n\
#EXTINF:-1 tvg-id=\"c1\" group-title=\"Sports;Live\",C1\nhttp://a/1\n\
#EXTINF:-1 tvg-id=\"c2\" group-title=\"Sports;Live\",C2\nhttp://a/2\n\
#EXTINF:-1 tvg-id=\"c3\" group-title=\"Sports\",C3\nhttp://a/3\n"
        );
        let parsed = parse_m3u(&m3u).expect("parse m3u");
        upsert_channels(&conn, src, &parsed).expect("upsert");

        let groups = list_groups(&conn, Some(src)).expect("list_groups");
        let sports_count = groups.iter().filter(|g| *g == "Sports").count();
        assert_eq!(
            sports_count, 1,
            "list_groups must return \"Sports\" exactly once, got {groups:?}"
        );
        assert!(
            !groups.iter().any(|g| g == "Sports;Live"),
            "list_groups must not surface the raw \"Sports;Live\" string, got {groups:?}"
        );
    }

    // ── P0d tests (TDD red): catchup 写路径（upsert_channels 落库） ────────────
    //
    // Expected to FAIL until P0d (migration 0013 + parse_m3u extracts catchup +
    // upsert_channels persists catchup on BOTH the INSERT and the revive-UPDATE
    // branch) is implemented.
    //
    // These reference the four catchup columns as raw SQL string literals so the
    // test crate compiles before the columns / ParsedChannel fields exist; the
    // "no such column" error then surfaces at RUNTIME (red), not as a compile error.
    // We drive the catchup payload via parse_m3u so we never touch a not-yet-existing
    // ParsedChannel.catchup_* field directly. (parse_m3u is already imported by the
    // P0c group tests above in this module.)

    /// Fetch the four catchup columns for a channel by source + channel_key, via a
    /// raw string-literal SELECT (compiles before the columns exist).
    fn channel_catchup(
        conn: &Connection,
        source_id: i64,
        channel_key: &str,
    ) -> (
        Option<String>, // catchup_type
        Option<String>, // catchup_source
        Option<String>, // catchup_days
        Option<i64>,    // catchup_hours
    ) {
        conn.query_row(
            "SELECT catchup_type, catchup_source, catchup_days, catchup_hours \
             FROM channels WHERE source_id = ?1 AND channel_key = ?2",
            rusqlite::params![source_id, channel_key],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .expect("channel row must exist")
    }

    const CATCHUP_M3U: &str = "#EXTM3U\n\
#EXTINF:-1 tvg-id=\"ch1\" catchup=\"append\" catchup-source=\"http://x?utc={utc}\" catchup-days=\"7\",Catchup Ch\n\
http://a/1\n";

    /// P0d D1: catchup parsed from M3U is persisted on the INSERT branch of
    /// upsert_channels.
    ///
    /// Catches: an upsert that imports the channel but drops the catchup columns
    /// (NULL) on first insert.
    #[test]
    fn p0d_upsert_persists_catchup_on_insert() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let channels = parse_m3u(CATCHUP_M3U).expect("m3u should parse");
        upsert_channels(&conn, src, &channels).expect("upsert");

        let (ctype, csource, cdays, chours) = channel_catchup(&conn, src, "ch1");
        assert_eq!(ctype.as_deref(), Some("append"));
        assert_eq!(csource.as_deref(), Some("http://x?utc={utc}"));
        assert_eq!(cdays.as_deref(), Some("7"));
        assert_eq!(chours, Some(168), "catchup_hours must be 7 * 24");
    }

    /// P0d D2: revive must NOT lose catchup. A tombstoned channel re-imported under
    /// the same channel_key must have its catchup columns correctly populated by the
    /// revive-UPDATE branch (id stays stable).
    ///
    /// Catches: an UPDATE/revive branch that updates name/url but forgets to write
    /// the catchup columns, leaving them stale/NULL after a tombstone→reimport.
    #[test]
    fn p0d_revive_preserves_catchup() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        // Initial import of ch1 (with catchup) + a sibling ch2 so the next import
        // (dropping ch1) tombstones ch1 rather than emptying the source.
        let with_ch1 = parse_m3u(&format!(
            "{CATCHUP_M3U}#EXTINF:-1 tvg-id=\"ch2\",Other\nhttp://a/2\n"
        ))
        .expect("parse");
        upsert_channels(&conn, src, &with_ch1).expect("initial import");
        let (id1, _) = channel_row(&conn, src, "ch1").expect("ch1 must exist");

        // Re-import WITHOUT ch1 → ch1 tombstoned.
        let only_ch2 =
            parse_m3u("#EXTM3U\n#EXTINF:-1 tvg-id=\"ch2\",Other\nhttp://a/2\n").expect("parse");
        upsert_channels(&conn, src, &only_ch2).expect("second import tombstones ch1");
        let (_, deleted) = channel_row(&conn, src, "ch1").expect("ch1 row survives");
        assert!(deleted.is_some(), "ch1 must be tombstoned");

        // Re-import ch1 (revive via UPDATE branch).
        let revive = parse_m3u(CATCHUP_M3U).expect("parse");
        upsert_channels(&conn, src, &revive).expect("revive import");
        let (id2, deleted2) = channel_row(&conn, src, "ch1").expect("ch1 revived");
        assert_eq!(id1, id2, "revive must keep the same channels.id");
        assert!(deleted2.is_none(), "revived channel must not stay tombstoned");

        // Catchup must be correct after the revive-UPDATE branch.
        let (ctype, csource, cdays, chours) = channel_catchup(&conn, src, "ch1");
        assert_eq!(ctype.as_deref(), Some("append"), "revive must write catchup_type");
        assert_eq!(
            csource.as_deref(),
            Some("http://x?utc={utc}"),
            "revive must write catchup_source"
        );
        assert_eq!(cdays.as_deref(), Some("7"), "revive must write catchup_days");
        assert_eq!(chours, Some(168), "revive must write catchup_hours");
    }

    /// P0d D3: a channel without catchup attributes lands all four columns as NULL.
    ///
    /// Catches: writing non-NULL garbage for catchup-less channels on insert.
    #[test]
    fn p0d_upsert_no_catchup_is_null() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let channels =
            parse_m3u("#EXTM3U\n#EXTINF:-1 tvg-id=\"ch1\",Plain\nhttp://a/1\n").expect("parse");
        upsert_channels(&conn, src, &channels).expect("upsert");

        let (ctype, csource, cdays, chours) = channel_catchup(&conn, src, "ch1");
        assert_eq!(ctype, None);
        assert_eq!(csource, None);
        assert_eq!(cdays, None);
        assert_eq!(chours, None);
    }

    // ── P0e tests (TDD red): FTS5 频道搜索（trigram） ─────────────────────────
    //
    // Expected to FAIL until P0e (migration 0014 FTS tables/triggers +
    // list_channels routing 3+ char queries through trigram FTS) is implemented.
    //
    // Everything is driven through the EXISTING public API (upsert_channels,
    // source_repo::delete, list_channels) — no reference to a not-yet-existing Rust
    // symbol — so the test crate keeps COMPILING; the missing FTS / behaviour
    // surfaces at RUNTIME (red).
    //
    // Decisions pinned: trigger-kept FTS stays in sync on INSERT/UPDATE/DELETE;
    // queries of 3+ characters go through the trigram FTS (so arbitrary CJK/ASCII
    // substrings match), queries of <3 characters fall back to LIKE; tombstoned
    // channels (deleted_time IS NOT NULL) never appear in search results.

    /// Search helper over the public list_channels search entry point.
    fn search_channel_names(conn: &Connection, src: i64, query: &str) -> Vec<String> {
        list_channels(conn, Some(src), None, Some(query), false, 100, 0)
            .expect("list_channels(search) should succeed")
            .into_iter()
            .map(|c| c.name)
            .collect()
    }

    /// E5: INSERT sync — a freshly upserted channel is immediately findable via the
    /// search entry point (the INSERT trigger must have fed channels_fts).
    ///
    /// Catches: a missing AFTER INSERT trigger that leaves new channels unindexed.
    #[test]
    fn p0e_insert_syncs_fts_and_channel_is_searchable() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let ch = sample_channel("ch1", "Discovery Science", "http://a/1");
        upsert_channels(&conn, src, &[ch]).expect("upsert");

        // 3+ char substring → trigram FTS path.
        let hits = search_channel_names(&conn, src, "Science");
        assert!(
            hits.iter().any(|n| n == "Discovery Science"),
            "newly inserted channel must be searchable (INSERT trigger synced FTS), got: {hits:?}"
        );
    }

    /// E6: UPDATE/rename sync — renaming a channel A→B (via the revive/update path
    /// of upsert_channels) must update the FTS: searching the OLD name no longer
    /// hits, the NEW name does.
    ///
    /// Catches: an AFTER UPDATE trigger that fails to re-index the new name, leaving
    /// a stale FTS row (old name still searchable, new name not).
    #[test]
    fn p0e_update_rename_syncs_fts() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        // Same channel_key → in-place UPDATE, name changes.
        let before = sample_channel("ch1", "Alphaname", "http://a/1");
        upsert_channels(&conn, src, &[before]).expect("first upsert");
        let after = sample_channel("ch1", "Betaname", "http://a/1");
        upsert_channels(&conn, src, &[after]).expect("rename upsert");

        let old_hits = search_channel_names(&conn, src, "Alphaname");
        assert!(
            !old_hits.iter().any(|n| n == "Betaname"),
            "old name must NOT match after rename (FTS UPDATE trigger stale), got: {old_hits:?}"
        );
        let new_hits = search_channel_names(&conn, src, "Betaname");
        assert!(
            new_hits.iter().any(|n| n == "Betaname"),
            "new name must match after rename, got: {new_hits:?}"
        );
    }

    /// E7: DELETE cascade sync — deleting a source cascades (ON DELETE CASCADE) the
    /// hard-deletion of its channels, and the AFTER DELETE trigger must remove them
    /// from channels_fts, so the channel name is no longer searchable.
    ///
    /// (The bundled SQLite enforces FK by default — see libsqlite3-sys build.rs
    /// `-DSQLITE_DEFAULT_FOREIGN_KEYS=1` — so source deletion really cascades the
    /// channel rows in an in-memory connection too.)
    ///
    /// Catches: a missing AFTER DELETE trigger that leaks orphaned FTS rows for
    /// hard-deleted channels.
    #[test]
    fn p0e_delete_cascade_syncs_fts() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let ch = sample_channel("ch1", "Vanishing Network", "http://a/1");
        upsert_channels(&conn, src, &[ch]).expect("upsert");
        assert!(
            search_channel_names(&conn, src, "Vanishing")
                .iter()
                .any(|n| n == "Vanishing Network"),
            "precondition: channel searchable before source delete"
        );

        // Cascade-delete the source → channels hard-deleted → FTS DELETE trigger.
        source_repo::delete(&conn, src).expect("delete source");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM channels_fts WHERE channels_fts MATCH 'Vanishing'",
                [],
                |row| row.get(0),
            )
            .expect("channels_fts MATCH should be queryable");
        assert_eq!(
            count, 0,
            "DELETE trigger must purge cascade-deleted channels from channels_fts"
        );
    }

    /// E8: Chinese substring via trigram — a 3+ char interior substring of a CJK
    /// channel name must hit. This is the whole point of choosing the trigram
    /// tokenizer: a word-boundary tokenizer (unicode61) would NOT match an interior
    /// CJK substring and this test would fail.
    ///
    /// Catches: implementing FTS with unicode61 instead of trigram (interior CJK
    /// substring search silently broken).
    #[test]
    fn p0e_chinese_substring_via_trigram() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let ch = sample_channel("ch1", "央视综合频道", "http://a/1");
        upsert_channels(&conn, src, &[ch]).expect("upsert");

        // 3-char interior substring (skips the leading 央视). Trigram matches; a
        // unicode61 token index would not.
        let hits = search_channel_names(&conn, src, "综合频道");
        assert!(
            hits.iter().any(|n| n == "央视综合频道"),
            "3+ char CJK substring must match via trigram FTS, got: {hits:?}"
        );
    }

    /// E9: Chinese two-character query falls back to LIKE — a query shorter than 3
    /// characters cannot be served by trigram (trigram needs ≥3 chars), so the read
    /// path must fall back to a LIKE substring scan and still hit. This is the
    /// double-char (e.g. 综合) safety net.
    ///
    /// Catches: routing a <3 char query into trigram FTS (which returns nothing for
    /// a 2-char CJK term), losing all 2-character Chinese search.
    #[test]
    fn p0e_chinese_two_char_falls_back_to_like() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let ch = sample_channel("ch1", "央视综合频道", "http://a/1");
        upsert_channels(&conn, src, &[ch]).expect("upsert");

        // 2 characters → must use the LIKE fallback (NOT trigram), and still hit.
        let hits = search_channel_names(&conn, src, "综合");
        assert!(
            hits.iter().any(|n| n == "央视综合频道"),
            "<3 char CJK query must hit via LIKE fallback, got: {hits:?}"
        );
    }

    /// E10: English interior substring via trigram — `ctv` is an interior substring
    /// of `CCTV News` (and not a token under unicode61); trigram must match it.
    ///
    /// Catches: a token-based FTS that only matches whole words, breaking partial
    /// English search.
    #[test]
    fn p0e_english_substring_via_trigram() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let ch = sample_channel("ch1", "CCTV News", "http://a/1");
        upsert_channels(&conn, src, &[ch]).expect("upsert");

        let hits = search_channel_names(&conn, src, "ctv");
        assert!(
            hits.iter().any(|n| n == "CCTV News"),
            "3 char interior English substring must match via trigram, got: {hits:?}"
        );
    }

    /// E12 (channel half): tombstoned channels must NOT appear in search results.
    /// A channel that is tombstoned (deleted_time set, via re-import without it)
    /// must be excluded from list_channels(search), even though its name still
    /// matches — the search path must keep the `deleted_time IS NULL` filter.
    ///
    /// Catches: an FTS-routed search that joins channels_fts back to channels but
    /// forgets the tombstone filter, leaking ghost channels into search.
    #[test]
    fn p0e_search_excludes_tombstoned_channel() {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).expect("migrations should run");
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");

        let ghost = sample_channel("ghost", "Ghostly Sports", "http://a/ghost");
        let keep = sample_channel("keep", "Keeper", "http://a/keep");
        upsert_channels(&conn, src, &[ghost, keep.clone()]).expect("initial import");
        assert!(
            search_channel_names(&conn, src, "Ghostly")
                .iter()
                .any(|n| n == "Ghostly Sports"),
            "precondition: ghost searchable before tombstone"
        );

        // Re-import without `ghost` → it is tombstoned (deleted_time set), not
        // hard-deleted.
        upsert_channels(&conn, src, &[keep]).expect("re-import drops ghost");

        let hits = search_channel_names(&conn, src, "Ghostly");
        assert!(
            !hits.iter().any(|n| n == "Ghostly Sports"),
            "search must exclude tombstoned channels (deleted_time IS NULL filter), got: {hits:?}"
        );
    }
}
