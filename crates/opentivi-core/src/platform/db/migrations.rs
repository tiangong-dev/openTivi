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

        let max_version: u32 = conn
            .query_row("SELECT MAX(version) FROM _migrations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(max_version, 10, "highest migration version must be 10");

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
}
