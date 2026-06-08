use rusqlite::Connection;

/// Each migration entry: (version, name, sql).
/// `version` is a monotonically increasing integer used to track schema state.
const MIGRATIONS: &[(u32, &str, &str)] = &[
    (
        1,
        "0001_init",
        include_str!("../../../migrations/0001_init.sql"),
    ),
    (
        2,
        "0002_indexes",
        include_str!("../../../migrations/0002_indexes.sql"),
    ),
    (
        3,
        "0003_sources_auto_refresh",
        include_str!("../../../migrations/0003_sources_auto_refresh.sql"),
    ),
    (
        4,
        "0004_epg_channel_aliases",
        include_str!("../../../migrations/0004_epg_channel_aliases.sql"),
    ),
    (
        5,
        "0005_normalized_name",
        include_str!("../../../migrations/0005_normalized_name.sql"),
    ),
    (
        6,
        "0006_channel_health",
        include_str!("../../../migrations/0006_channel_health.sql"),
    ),
    (
        7,
        "0007_channels_per_source_key",
        include_str!("../../../migrations/0007_channels_per_source_key.sql"),
    ),
    (
        8,
        "0008_source_refresh_health",
        include_str!("../../../migrations/0008_source_refresh_health.sql"),
    ),
    (
        9,
        "0009_repair_channel_foreign_keys",
        include_str!("../../../migrations/0009_repair_channel_foreign_keys.sql"),
    ),
    (
        10,
        "0010_epg_epoch",
        include_str!("../../../migrations/0010_epg_epoch.sql"),
    ),
    (
        11,
        "0011_channels_soft_delete",
        include_str!("../../../migrations/0011_channels_soft_delete.sql"),
    ),
    (
        12,
        "0012_channel_groups",
        include_str!("../../../migrations/0012_channel_groups.sql"),
    ),
    (
        13,
        "0013_catchup",
        include_str!("../../../migrations/0013_catchup.sql"),
    ),
    (
        14,
        "0014_fts5_search",
        include_str!("../../../migrations/0014_fts5_search.sql"),
    ),
];

pub fn run_migrations(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    // Upgrade legacy _migrations table (name-only) → versioned schema.
    let has_version_col: bool = conn
        .prepare("SELECT version FROM _migrations LIMIT 0")
        .is_ok();

    if !has_version_col {
        // Table may not exist yet (fresh install) or may use the old name-only schema.
        let table_exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='_migrations'",
            [],
            |row| row.get(0),
        )?;

        if table_exists {
            // Old schema: convert existing rows, assigning versions by matching names.
            conn.execute_batch("ALTER TABLE _migrations RENAME TO _migrations_old;")?;
        }

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS _migrations (
                version  INTEGER PRIMARY KEY,
                name     TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );",
        )?;

        if table_exists {
            for &(version, name, _) in MIGRATIONS {
                conn.execute(
                    "INSERT OR IGNORE INTO _migrations (version, name, applied_at)
                     SELECT ?1, name, applied_at FROM _migrations_old WHERE name = ?2",
                    rusqlite::params![version, name],
                )?;
            }
            conn.execute_batch("DROP TABLE _migrations_old;")?;
        }
    }

    let current_version: u32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM _migrations",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    for &(version, name, sql) in MIGRATIONS {
        if version <= current_version {
            continue;
        }

        conn.execute_batch("BEGIN;")?;
        match conn.execute_batch(sql) {
            Ok(()) => {
                conn.execute(
                    "INSERT INTO _migrations (version, name, applied_at) VALUES (?1, ?2, datetime('now'))",
                    rusqlite::params![version, name],
                )?;
                conn.execute_batch("COMMIT;")?;
            }
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK;");
                return Err(format!("migration {name} (v{version}) failed: {e}").into());
            }
        }
    }

    backfill_epg_epoch(conn)?;

    Ok(())
}

/// Idempotent backfill of `start_epoch` / `end_epoch` for legacy EPG rows that
/// were inserted with TEXT-only timestamps. Only rows whose `start_epoch` is
/// still NULL are touched, so re-running this is a no-op (and never clobbers an
/// already-filled value). Unparseable timestamps stay NULL.
fn backfill_epg_epoch(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    use crate::core::services::epg_service::parse_program_time;

    let rows: Vec<(i64, String, String)> = {
        let mut stmt = conn.prepare(
            "SELECT id, start_at, end_at FROM epg_programs WHERE start_epoch IS NULL",
        )?;
        let mapped = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        mapped.collect::<Result<Vec<_>, _>>()?
    };

    if rows.is_empty() {
        return Ok(());
    }

    conn.execute_batch("BEGIN;")?;
    let result = (|| -> rusqlite::Result<()> {
        for (id, start_at, end_at) in &rows {
            let start_epoch = parse_program_time(start_at).map(|dt| dt.timestamp());
            let end_epoch = parse_program_time(end_at).map(|dt| dt.timestamp());
            conn.execute(
                "UPDATE epg_programs SET start_epoch = ?1, end_epoch = ?2 WHERE id = ?3 AND start_epoch IS NULL",
                rusqlite::params![start_epoch, end_epoch, id],
            )?;
        }
        Ok(())
    })();

    match result {
        Ok(()) => conn.execute_batch("COMMIT;")?,
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK;");
            return Err(format!("epg epoch backfill failed: {e}").into());
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_run_migrations_twice() {
        let conn = Connection::open_in_memory().unwrap();

        run_migrations(&conn).expect("first migration run should succeed");
        run_migrations(&conn).expect("second migration run should be idempotent");

        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(tables.contains(&"_migrations".to_string()));
        assert!(tables.contains(&"sources".to_string()));
        assert!(tables.contains(&"channels".to_string()));
        assert!(tables.contains(&"epg_programs".to_string()));
        assert!(tables.contains(&"favorites".to_string()));
        assert!(tables.contains(&"recents".to_string()));
        assert!(tables.contains(&"settings".to_string()));

        for table in ["favorites", "recents", "channel_health"] {
            let foreign_tables: Vec<String> = conn
                .prepare(&format!("PRAGMA foreign_key_list({table})"))
                .unwrap()
                .query_map([], |row| row.get(2))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();

            assert!(foreign_tables.iter().any(|name| name == "channels"));
            assert!(!foreign_tables.iter().any(|name| name == "channels_old"));
        }

        // Verify versioned _migrations table
        let max_version: u32 = conn
            .query_row("SELECT MAX(version) FROM _migrations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(max_version, MIGRATIONS.last().unwrap().0);
    }

    // ── P0a tests (TDD red): EPG 时间 TEXT→epoch ──────────────────────────
    //
    // These tests are expected to FAIL until P0a is implemented. They assert the
    // externally observable contract only (no assumption about the internal
    // migration file name or a named backfill function).

    /// Helper: column names of a table via PRAGMA table_info.
    fn table_columns(conn: &Connection, table: &str) -> Vec<String> {
        conn.prepare(&format!("PRAGMA table_info({table})"))
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    }

    /// P0a #1: migration adds nullable start_epoch / end_epoch INTEGER columns,
    /// bumps MAX(version) to 10, and remains idempotent on a second run.
    ///
    /// Catches: forgetting to add the columns at all, or not registering the
    /// migration (version stays 9), or a non-idempotent backfill/ALTER that
    /// blows up on the second run_migrations.
    #[test]
    fn p0a_migration_adds_epoch_columns_and_bumps_version_to_10() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("first migration run should succeed");

        let cols = table_columns(&conn, "epg_programs");
        assert!(
            cols.iter().any(|c| c == "start_epoch"),
            "epg_programs must have start_epoch column, got: {cols:?}"
        );
        assert!(
            cols.iter().any(|c| c == "end_epoch"),
            "epg_programs must have end_epoch column, got: {cols:?}"
        );

        // Columns must be nullable (no NOT NULL constraint) so existing rows survive.
        let not_null: Vec<(String, i64)> = conn
            .prepare("PRAGMA table_info(epg_programs)")
            .unwrap()
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, i64>(3)?))
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        for (name, notnull) in &not_null {
            if name == "start_epoch" || name == "end_epoch" {
                assert_eq!(
                    *notnull, 0,
                    "{name} must be nullable (notnull flag must be 0)"
                );
            }
        }

        // The P0a migration (0010) must be registered + applied. Assert robustly
        // against the highest registered migration so adding later migrations
        // (0011/0012/…) does not regress this test, while still requiring that the
        // 0010 epoch migration ran.
        let max_version: u32 = conn
            .query_row("SELECT MAX(version) FROM _migrations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(max_version, MIGRATIONS.last().unwrap().0);
        let p0a_applied: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM _migrations WHERE version = 10",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(p0a_applied, 1, "migration 10 (epoch columns) must be applied");

        // Second run must be idempotent (backfill / ALTER must not fail).
        run_migrations(&conn).expect("second migration run should be idempotent");
    }

    /// P0a #5: backfill of pre-existing TEXT-only rows is re-entrant.
    ///
    /// A row that exists with epoch = NULL at migration time gets its epoch
    /// filled; a row that already has a (possibly stale/manual) epoch value is
    /// NOT overwritten by a re-trigger of the migration flow.
    ///
    /// Driven purely through run_migrations (no assumption about a named backfill
    /// fn). We insert a NULL-epoch legacy row, re-run migrations, and assert it is
    /// backfilled. Then we plant a sentinel epoch value on another row and re-run
    /// migrations again to assert the sentinel is preserved (not clobbered).
    ///
    /// Catches: backfill that never runs, backfill that overwrites already-filled
    /// rows (non-re-entrant), or backfill that drops/loses rows.
    #[test]
    fn p0a_backfill_is_reentrant_via_run_migrations() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("migrations should run");

        // Seed a source to satisfy the schema (FK not enforced on bare in-mem conn,
        // but keep it realistic).
        conn.execute_batch(
            "INSERT INTO sources (kind, name, location, enabled, created_at, updated_at)
             VALUES ('m3u', 'S', 'http://example.com/x.m3u', 1, datetime('now'), datetime('now'));",
        )
        .ok();
        let source_id: i64 = conn
            .query_row("SELECT id FROM sources LIMIT 1", [], |r| r.get(0))
            .unwrap_or(1);

        // Legacy-style row: TEXT timestamps present, epoch columns NULL.
        // 20240101060000 +0000 → 1704088800 (UTC).
        conn.execute(
            "INSERT INTO epg_programs
                (source_id, channel_tvg_id, start_at, end_at, title, start_epoch, end_epoch, created_at)
             VALUES (?1, 'ch.legacy', '20240101060000 +0000', '20240101070000 +0000', 'Legacy', NULL, NULL, datetime('now'))",
            rusqlite::params![source_id],
        )
        .expect("legacy row insert should succeed");

        // Re-trigger the migration flow; backfill must fill the NULL epochs.
        run_migrations(&conn).expect("re-run migrations (backfill) should succeed");

        let (start_epoch, end_epoch): (Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT start_epoch, end_epoch FROM epg_programs WHERE channel_tvg_id = 'ch.legacy'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .expect("legacy row must still exist");
        assert_eq!(
            start_epoch,
            Some(1704088800),
            "backfill must fill start_epoch for legacy TEXT-only row"
        );
        assert_eq!(
            end_epoch,
            Some(1704092400),
            "backfill must fill end_epoch for legacy TEXT-only row"
        );

        // Re-entrancy: plant a sentinel epoch that does NOT match the TEXT, then
        // re-run. A re-entrant backfill only touches NULLs, so the sentinel must
        // survive (proving it does not re-derive/overwrite already-filled rows).
        conn.execute(
            "UPDATE epg_programs SET start_epoch = 999, end_epoch = 1000 WHERE channel_tvg_id = 'ch.legacy'",
            [],
        )
        .unwrap();
        run_migrations(&conn).expect("another re-run should succeed");

        let (start_epoch2, end_epoch2): (Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT start_epoch, end_epoch FROM epg_programs WHERE channel_tvg_id = 'ch.legacy'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            start_epoch2,
            Some(999),
            "re-entrant backfill must NOT overwrite an already-filled start_epoch"
        );
        assert_eq!(
            end_epoch2,
            Some(1000),
            "re-entrant backfill must NOT overwrite an already-filled end_epoch"
        );
    }

    // ── P0b tests (TDD red): 软删除 + 稳定频道身份 ───────────────────────────
    //
    // Expected to FAIL until P0b (migration 0011) is implemented. Asserts only the
    // externally observable schema contract (no assumption about the migration file
    // name).

    /// P0b #1: migration 0011 adds a nullable `deleted_time` TEXT column on
    /// `channels`, bumps MAX(version) to 11, and stays idempotent on a re-run.
    ///
    /// Catches: forgetting to add the column (read path can't tombstone-filter),
    /// adding it NOT NULL (existing rows would fail/blow up), or not registering
    /// the migration so MAX(version) stays 10, or a non-idempotent ALTER that
    /// fails on the second run_migrations.
    #[test]
    fn p0b_migration_adds_deleted_time_column_and_bumps_version_to_11() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("first migration run should succeed");

        let cols = table_columns(&conn, "channels");
        assert!(
            cols.iter().any(|c| c == "deleted_time"),
            "channels must have deleted_time column, got: {cols:?}"
        );

        // Column must be nullable (NULL = alive / timestamp = tombstone).
        let not_null: Vec<(String, i64)> = conn
            .prepare("PRAGMA table_info(channels)")
            .unwrap()
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, i64>(3)?))
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        for (name, notnull) in &not_null {
            if name == "deleted_time" {
                assert_eq!(
                    *notnull, 0,
                    "deleted_time must be nullable (notnull flag must be 0)"
                );
            }
        }

        // The P0b migration (0011) must be registered + applied. Assert robustly
        // against the highest registered migration so adding later migrations
        // (0012/…) does not regress this test, while still requiring that the 0011
        // deleted_time migration ran.
        let max_version: u32 = conn
            .query_row("SELECT MAX(version) FROM _migrations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(max_version, MIGRATIONS.last().unwrap().0);
        let p0b_applied: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM _migrations WHERE version = 11",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            p0b_applied, 1,
            "migration 11 (deleted_time column) must be applied"
        );

        // Second run must be idempotent (ALTER must not blow up).
        run_migrations(&conn).expect("second migration run should be idempotent");
    }

    // ── P0c tests (TDD red): 频道 ↔ 分组 多对多 ───────────────────────────────
    //
    // Expected to FAIL until P0c (migration 0012) is implemented. Asserts only the
    // externally observable schema contract through PRAGMA / sqlite_master + a
    // round-trip insert, never a not-yet-existing Rust symbol, so the test crate
    // keeps COMPILING; the missing tables surface as RUNTIME errors (red).

    /// Helper: does a table exist?
    fn table_exists(conn: &Connection, table: &str) -> bool {
        conn.query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name = ?1",
            [table],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false)
    }

    /// P0c #1: migration 0012 creates the many-to-many group tables
    /// (`channel_groups`, `channel_group_links`) with the documented columns,
    /// registers migration version 12, and stays idempotent on a re-run.
    ///
    /// Catches: forgetting to create either table, missing columns, not
    /// registering the migration (version 12 absent), or a non-idempotent
    /// CREATE that blows up on the second run_migrations.
    #[test]
    fn p0c_migration_creates_group_tables_and_bumps_version_to_12() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("first migration run should succeed");

        assert!(
            table_exists(&conn, "channel_groups"),
            "migration 0012 must create channel_groups table"
        );
        assert!(
            table_exists(&conn, "channel_group_links"),
            "migration 0012 must create channel_group_links table"
        );

        let group_cols = table_columns(&conn, "channel_groups");
        for col in ["id", "source_id", "name", "created_at", "updated_at"] {
            assert!(
                group_cols.iter().any(|c| c == col),
                "channel_groups must have column `{col}`, got: {group_cols:?}"
            );
        }

        let link_cols = table_columns(&conn, "channel_group_links");
        for col in ["channel_id", "group_id", "created_at"] {
            assert!(
                link_cols.iter().any(|c| c == col),
                "channel_group_links must have column `{col}`, got: {link_cols:?}"
            );
        }

        let p0c_applied: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM _migrations WHERE version = 12",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            p0c_applied, 1,
            "migration 12 (group tables) must be registered"
        );

        // Second run must be idempotent (CREATE must not blow up).
        run_migrations(&conn).expect("second migration run should be idempotent");
    }

    /// P0c #1b: `channel_groups` enforces UNIQUE(source_id, name) and
    /// `channel_group_links` keys on (channel_id, group_id), so the same group
    /// name is one row per source and a channel↔group link cannot duplicate.
    ///
    /// Catches: missing UNIQUE(source_id,name) (would let the same group split
    /// into duplicate rows / break per-source isolation), or a missing
    /// (channel_id,group_id) PRIMARY KEY (would let a re-import pile up duplicate
    /// link rows).
    #[test]
    fn p0c_group_tables_enforce_uniqueness() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("migrations should run");

        // Seed FK parents. The bundled SQLite enforces FK by default
        // (build.rs: -DSQLITE_DEFAULT_FOREIGN_KEYS=1), so channel_groups.source_id
        // and channel_group_links.channel_id must reference real rows; otherwise the
        // UNIQUE/PK assertions below would be masked by a FOREIGN KEY failure.
        // We pin id=1 (sources) and id=1/id=2's source / channel id=1 used below.
        conn.execute_batch(
            "INSERT INTO sources (id, kind, name, location, enabled, created_at, updated_at) \
                 VALUES (1, 'm3u', 'S1', 'http://example.com/1.m3u', 1, datetime('now'), datetime('now')); \
             INSERT INTO sources (id, kind, name, location, enabled, created_at, updated_at) \
                 VALUES (2, 'm3u', 'S2', 'http://example.com/2.m3u', 1, datetime('now'), datetime('now')); \
             INSERT INTO channels (id, channel_key, source_id, name, stream_url, created_at, updated_at) \
                 VALUES (1, 'ck1', 1, 'Chan1', 'http://example.com/s1.ts', datetime('now'), datetime('now'));",
        )
        .expect("seeding FK parent rows (sources, channels) must succeed");

        // First insert of (source 1, "News") must succeed.
        conn.execute(
            "INSERT INTO channel_groups (source_id, name, created_at, updated_at) \
             VALUES (1, 'News', datetime('now'), datetime('now'))",
            [],
        )
        .expect("first channel_groups insert must succeed");

        // Duplicate (source 1, "News") must be rejected by UNIQUE(source_id,name).
        let dup = conn.execute(
            "INSERT INTO channel_groups (source_id, name, created_at, updated_at) \
             VALUES (1, 'News', datetime('now'), datetime('now'))",
            [],
        );
        assert!(
            dup.is_err(),
            "UNIQUE(source_id,name) must reject a duplicate group for the same source"
        );

        // Same name, different source must be allowed (isolation).
        conn.execute(
            "INSERT INTO channel_groups (source_id, name, created_at, updated_at) \
             VALUES (2, 'News', datetime('now'), datetime('now'))",
            [],
        )
        .expect("same group name on a different source must be allowed");

        let group_id: i64 = conn
            .query_row(
                "SELECT id FROM channel_groups WHERE source_id = 1 AND name = 'News'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        // First link insert succeeds.
        conn.execute(
            "INSERT INTO channel_group_links (channel_id, group_id, created_at) \
             VALUES (1, ?1, datetime('now'))",
            [group_id],
        )
        .expect("first link insert must succeed");

        // Duplicate (channel_id, group_id) must be rejected by the PRIMARY KEY.
        let dup_link = conn.execute(
            "INSERT INTO channel_group_links (channel_id, group_id, created_at) \
             VALUES (1, ?1, datetime('now'))",
            [group_id],
        );
        assert!(
            dup_link.is_err(),
            "PRIMARY KEY(channel_id,group_id) must reject a duplicate link"
        );
    }

    #[test]
    fn test_upgrade_from_legacy_migrations_table() {
        let conn = Connection::open_in_memory().unwrap();

        // Simulate legacy name-only _migrations table with some applied migrations
        conn.execute_batch(
            "CREATE TABLE _migrations (
                name TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL
            );
            INSERT INTO _migrations (name, applied_at) VALUES ('0001_init', '2025-01-01');
            INSERT INTO _migrations (name, applied_at) VALUES ('0002_indexes', '2025-01-01');",
        )
        .unwrap();

        // Also create the tables that migration 0001 and 0002 would have created,
        // so the runner does not try to re-create them.
        conn.execute_batch(include_str!("../../../migrations/0001_init.sql"))
            .unwrap();
        conn.execute_batch(include_str!("../../../migrations/0002_indexes.sql"))
            .unwrap();

        run_migrations(&conn).expect("should upgrade legacy table and run remaining migrations");

        // Legacy table should be gone; versioned table should exist
        let max_version: u32 = conn
            .query_row("SELECT MAX(version) FROM _migrations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(max_version, MIGRATIONS.last().unwrap().0);
    }

    // ── P0d tests (TDD red): catchup 回看字段（迁移 0013） ────────────────────
    //
    // Expected to FAIL until P0d (migration 0013) is implemented. They assert only
    // the externally observable schema contract: `channels` AND `sources` each gain
    // four nullable catchup columns, and migration version 13 is registered. We
    // deliberately assert `version = 13` is registered (NOT a global MAX(version)
    // == 13) so adding later migrations does not regress this test.

    const CATCHUP_COLUMNS: [&str; 4] = [
        "catchup_type",
        "catchup_source",
        "catchup_days",
        "catchup_hours",
    ];

    /// P0d A1: migration 0013 adds the four catchup columns to BOTH `channels` and
    /// `sources`.
    ///
    /// Catches: forgetting to add the columns at all, only adding them to one of the
    /// two tables, or misnaming a column.
    #[test]
    fn p0d_migration_adds_catchup_columns_to_channels_and_sources() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("migrations should run");

        let channel_cols = table_columns(&conn, "channels");
        for col in CATCHUP_COLUMNS {
            assert!(
                channel_cols.iter().any(|c| c == col),
                "channels must have catchup column `{col}`, got: {channel_cols:?}"
            );
        }

        let source_cols = table_columns(&conn, "sources");
        for col in CATCHUP_COLUMNS {
            assert!(
                source_cols.iter().any(|c| c == col),
                "sources must have catchup column `{col}`, got: {source_cols:?}"
            );
        }
    }

    /// P0d A2: all eight catchup columns must be nullable (notnull flag == 0) so
    /// existing rows survive the ALTER and channels/sources without catchup info are
    /// representable.
    ///
    /// Catches: declaring a catchup column NOT NULL, which would break the ALTER on
    /// existing tables or force a non-null default.
    #[test]
    fn p0d_catchup_columns_are_nullable() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("migrations should run");

        for table in ["channels", "sources"] {
            let not_null: Vec<(String, i64)> = conn
                .prepare(&format!("PRAGMA table_info({table})"))
                .unwrap()
                .query_map([], |row| Ok((row.get::<_, String>(1)?, row.get::<_, i64>(3)?)))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();

            for col in CATCHUP_COLUMNS {
                let found = not_null
                    .iter()
                    .find(|(name, _)| name == col)
                    .unwrap_or_else(|| panic!("{table}.{col} column must exist"));
                assert_eq!(
                    found.1, 0,
                    "{table}.{col} must be nullable (notnull flag must be 0)"
                );
            }
        }
    }

    /// P0d A3: migration version 13 (catchup) is registered + applied.
    ///
    /// Catches: forgetting to register the 0013 migration in MIGRATIONS (so the
    /// columns are never created on a real upgrade).
    #[test]
    fn p0d_migration_13_is_registered() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("migrations should run");

        let applied: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM _migrations WHERE version = 13",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(applied, 1, "migration 13 (catchup columns) must be applied");
    }

    /// P0d A4: re-running migrations is idempotent (the catchup ALTER must not fail
    /// on a second run).
    ///
    /// Catches: a non-idempotent ALTER (e.g. unconditional ADD COLUMN) that blows up
    /// the second time run_migrations is invoked.
    #[test]
    fn p0d_catchup_migration_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("first migration run should succeed");
        run_migrations(&conn).expect("second migration run should be idempotent");
    }

    // ── P0e tests (TDD red): FTS5 搜索（trigram）迁移 0014 ────────────────────
    //
    // Expected to FAIL until P0e (migration 0014) is implemented. They assert only
    // the externally observable schema contract through sqlite_master / a raw FTS
    // MATCH query, never a not-yet-existing Rust symbol, so the test crate keeps
    // COMPILING; the missing FTS tables / un-backfilled content surface at RUNTIME
    // (red).
    //
    // Decisions pinned here: tokenizer = trigram (arbitrary CJK/ASCII substrings),
    // channels_fts indexes channel `name`, epg_programs_fts indexes title + AND
    // description, and migration 0014 must rebuild-backfill any pre-existing
    // content rows.

    /// E1: migration 0014 (FTS5 search) is registered + applied.
    ///
    /// Per the P0e contract we assert ONLY that version 14 is registered (NOT a
    /// global MAX), so adding later migrations does not regress this test.
    ///
    /// Catches: forgetting to register the 0014 migration in MIGRATIONS, so the FTS
    /// tables / triggers are never created on a real upgrade.
    #[test]
    fn p0e_migration_14_is_registered() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("migrations should run");

        let applied: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM _migrations WHERE version = 14",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(applied, 1, "migration 14 (FTS5 search) must be applied");
    }

    /// E2: migration 0014 creates the two FTS5 virtual tables `channels_fts`
    /// (indexing channel name) and `epg_programs_fts` (indexing title +
    /// description).
    ///
    /// Catches: forgetting to create either FTS table, or naming them differently
    /// than the read path expects.
    #[test]
    fn p0e_migration_creates_fts_tables() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("migrations should run");

        assert!(
            table_exists(&conn, "channels_fts"),
            "migration 0014 must create the channels_fts virtual table"
        );
        assert!(
            table_exists(&conn, "epg_programs_fts"),
            "migration 0014 must create the epg_programs_fts virtual table"
        );
    }

    /// E3: re-running migrations is idempotent. Because CREATE VIRTUAL TABLE has no
    /// `IF NOT EXISTS` form in older SQLite usage, the migration must be guarded by
    /// the version check (run-once), so a second run_migrations must NOT blow up
    /// trying to re-create the FTS tables / triggers.
    ///
    /// Catches: a non-idempotent 0014 that errors ("table already exists") on the
    /// second run_migrations invocation.
    #[test]
    fn p0e_fts_migration_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("first migration run should succeed");
        run_migrations(&conn).expect("second migration run should be idempotent");
    }

    /// E4: migration 0014 must REBUILD-backfill pre-existing content rows, so
    /// channels / epg_programs that already existed before the FTS tables were
    /// created are searchable afterwards.
    ///
    /// We reproduce a "historical DB at schema version 13" by applying migrations
    /// 0001..0013 by hand (their SQL + a versioned _migrations table), inserting
    /// content rows directly, and ONLY THEN letting run_migrations apply 0014. A
    /// migration that creates empty FTS tables without `INSERT INTO ..._fts
    /// VALUES('rebuild')` would leave these historical rows invisible to search.
    ///
    /// Catches: forgetting the rebuild backfill (existing users' channels/EPG would
    /// silently never appear in search until re-imported).
    #[test]
    fn p0e_migration_rebuilds_existing_content_into_fts() {
        let conn = Connection::open_in_memory().unwrap();

        // Build a "version 13" database WITHOUT running 0014: create the versioned
        // _migrations table, execute migrations 0001..0013 SQL, and record them as
        // applied so run_migrations() will only apply 0014.
        conn.execute_batch(
            "CREATE TABLE _migrations (
                version  INTEGER PRIMARY KEY,
                name     TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );",
        )
        .unwrap();
        for &(version, name, sql) in MIGRATIONS {
            if version >= 14 {
                continue;
            }
            conn.execute_batch(sql)
                .unwrap_or_else(|e| panic!("seeding migration {name} (v{version}) failed: {e}"));
            conn.execute(
                "INSERT INTO _migrations (version, name, applied_at) VALUES (?1, ?2, datetime('now'))",
                rusqlite::params![version, name],
            )
            .unwrap();
        }

        // Historical content present BEFORE 0014 runs.
        conn.execute_batch(
            "INSERT INTO sources (id, kind, name, location, enabled, created_at, updated_at) \
                 VALUES (1, 'm3u', 'S', 'http://example.com/x.m3u', 1, datetime('now'), datetime('now')); \
             INSERT INTO channels (id, channel_key, source_id, name, tvg_id, stream_url, created_at, updated_at) \
                 VALUES (1, 'ck.legacy', 1, 'Legacy History Channel', 'ck.legacy', 'http://a/s.ts', datetime('now'), datetime('now')); \
             INSERT INTO epg_programs (id, source_id, channel_tvg_id, start_at, end_at, title, description, created_at) \
                 VALUES (1, 1, 'ck.legacy', '20240101060000 +0000', '20240101070000 +0000', 'Historic Movie', 'an old documentary', datetime('now'));",
        )
        .expect("seeding historical content rows must succeed");

        // Now apply 0014 (the only un-applied migration). Its rebuild backfill must
        // pull the pre-existing rows into the FTS indexes.
        run_migrations(&conn).expect("applying migration 0014 should succeed");

        // The historical channel must be findable via the FTS index.
        let ch_hits: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM channels_fts WHERE channels_fts MATCH 'History'",
                [],
                |row| row.get(0),
            )
            .expect("channels_fts MATCH should be queryable after 0014");
        assert!(
            ch_hits >= 1,
            "migration 0014 must rebuild-backfill pre-existing channels into channels_fts"
        );

        // The historical program must be findable via the EPG FTS index (title or
        // description); search the description term to also pin description coverage.
        let ep_hits: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM epg_programs_fts WHERE epg_programs_fts MATCH 'documentary'",
                [],
                |row| row.get(0),
            )
            .expect("epg_programs_fts MATCH should be queryable after 0014");
        assert!(
            ep_hits >= 1,
            "migration 0014 must rebuild-backfill pre-existing epg_programs into epg_programs_fts"
        );
    }
}
