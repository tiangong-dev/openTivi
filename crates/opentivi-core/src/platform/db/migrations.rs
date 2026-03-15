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
