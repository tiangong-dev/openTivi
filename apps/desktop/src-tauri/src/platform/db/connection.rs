use rusqlite::Connection;

pub fn open_connection() -> Result<Connection, Box<dyn std::error::Error>> {
    let db_path = crate::platform::fs::paths::db_path()?;

    // Ensure parent directory exists
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let conn = Connection::open(&db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")?;
    Ok(conn)
}
