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

        if let Some(_id) = existing {
            // Revive: clear deleted_time back to NULL (id unchanged).
            tx.execute(
                "UPDATE channels SET name = ?1, normalized_name = ?2, channel_number = ?3, group_name = ?4, tvg_id = ?5, tvg_name = ?6, logo_url = ?7, stream_url = ?8, container_extension = ?9, is_live = ?10, deleted_time = NULL, updated_at = datetime('now') WHERE source_id = ?11 AND channel_key = ?12",
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
        sql.push_str(&format!(" AND c.group_name = ?{}", idx));
        params.push(g.to_string().into());
        idx += 1;
    }

    if let Some(s) = search {
        sql.push_str(&format!(" AND c.name LIKE ?{}", idx));
        params.push(format!("%{}%", s).into());
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
            "SELECT DISTINCT c.group_name FROM channels c INNER JOIN sources s ON s.id = c.source_id WHERE c.group_name IS NOT NULL AND s.enabled = 1 AND c.deleted_time IS NULL AND c.source_id = ?1 ORDER BY c.group_name".to_string(),
            vec![sid.into()],
        )
    } else {
        (
            "SELECT DISTINCT c.group_name FROM channels c INNER JOIN sources s ON s.id = c.source_id WHERE c.group_name IS NOT NULL AND s.enabled = 1 AND c.deleted_time IS NULL ORDER BY c.group_name".to_string(),
            vec![],
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
        "SELECT c.id, c.channel_key, c.source_id, c.external_id, c.name, c.normalized_name, c.channel_number, c.group_name, c.tvg_id, c.tvg_name, c.logo_url, c.stream_url, c.container_extension, c.is_live
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
                c.stream_url, c.container_extension, c.is_live
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
}
