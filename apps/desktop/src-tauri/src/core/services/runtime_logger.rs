use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use chrono::Utc;
use serde_json::{json, Value};

const LOG_DIR: &str = "/opt/cursor/logs";
const LOG_FILE: &str = "standby_runtime.log";
const LOG_ROTATED_FILE: &str = "standby_runtime.prev.log";
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
const DEFAULT_READ_LIMIT: usize = 400;

static LOG_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn log_path() -> PathBuf {
    Path::new(LOG_DIR).join(LOG_FILE)
}

fn rotated_log_path() -> PathBuf {
    Path::new(LOG_DIR).join(LOG_ROTATED_FILE)
}

fn with_lock<T>(f: impl FnOnce() -> T) -> T {
    let lock = LOG_LOCK.get_or_init(|| Mutex::new(()));
    let _guard = lock.lock().expect("runtime logger mutex poisoned");
    f()
}

fn rotate_if_needed(path: &Path) {
    let metadata = match fs::metadata(path) {
        Ok(value) => value,
        Err(_) => return,
    };
    if metadata.len() < MAX_LOG_BYTES {
        return;
    }
    let rotated = rotated_log_path();
    let _ = fs::remove_file(&rotated);
    let _ = fs::rename(path, rotated);
}

pub fn append_runtime_log(component: &str, event: &str, data: Value) {
    let payload = json!({
        "ts": Utc::now().to_rfc3339(),
        "component": component,
        "event": event,
        "data": data,
    });
    with_lock(|| {
        if fs::create_dir_all(LOG_DIR).is_err() {
            return;
        }
        let path = log_path();
        rotate_if_needed(&path);
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{}", payload);
        }
    });
}

pub fn read_runtime_logs(limit: Option<usize>) -> std::io::Result<Vec<String>> {
    with_lock(|| {
        let path = log_path();
        let file = match File::open(path) {
            Ok(value) => value,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(err) => return Err(err),
        };
        let requested_limit = limit.unwrap_or(DEFAULT_READ_LIMIT).max(1);
        let mut lines = Vec::new();
        for line in BufReader::new(file).lines() {
            lines.push(line?);
        }
        if lines.len() <= requested_limit {
            return Ok(lines);
        }
        Ok(lines.split_off(lines.len() - requested_limit))
    })
}

pub fn clear_runtime_logs() -> std::io::Result<()> {
    with_lock(|| {
        fs::create_dir_all(LOG_DIR)?;
        File::create(log_path())?;
        Ok(())
    })
}
