use std::path::PathBuf;
use std::sync::Arc;

use crate::error::{AppError, AppResult};

#[derive(Clone)]
pub struct DbExecutor {
    db_path: Arc<PathBuf>,
}

impl DbExecutor {
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db_path: Arc::new(db_path),
        }
    }

    pub async fn run<T, F>(&self, f: F) -> AppResult<T>
    where
        T: Send + 'static,
        F: FnOnce(&rusqlite::Connection) -> AppResult<T> + Send + 'static,
    {
        let db_path = self.db_path.clone();
        tokio::task::spawn_blocking(move || {
            let conn = open_at(&db_path)?;
            f(&conn)
        })
        .await
        .map_err(|e| AppError::Internal(format!("DB task join error: {e}")))?
    }
}

fn open_at(db_path: &PathBuf) -> AppResult<rusqlite::Connection> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| AppError::Database(e.to_string()))?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    )
    .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(conn)
}
