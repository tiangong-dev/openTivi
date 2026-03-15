use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::mpsc::{self, SyncSender};
use std::sync::{Mutex, OnceLock};

use chrono::Utc;
use serde_json::{json, Value};

use crate::platform::fs::paths::app_data_dir;

const LOG_FILE: &str = "standby_runtime.log";
const LOG_ROTATED_FILE: &str = "standby_runtime.prev.log";
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
const DEFAULT_READ_LIMIT: usize = 400;
const CHANNEL_CAPACITY: usize = 512;

static LOG_SENDER: OnceLock<SyncSender<String>> = OnceLock::new();
static FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn log_dir() -> Option<PathBuf> {
    app_data_dir().ok().map(|d| d.join("logs"))
}

fn log_path() -> Option<PathBuf> {
    log_dir().map(|d| d.join(LOG_FILE))
}

fn rotated_log_path() -> Option<PathBuf> {
    log_dir().map(|d| d.join(LOG_ROTATED_FILE))
}

fn with_file_lock<T>(f: impl FnOnce() -> T) -> T {
    let lock = FILE_LOCK.get_or_init(|| Mutex::new(()));
    let _guard = lock.lock().expect("runtime logger mutex poisoned");
    f()
}

fn rotate_if_needed(path: &PathBuf) {
    let metadata = match fs::metadata(path) {
        Ok(value) => value,
        Err(_) => return,
    };
    if metadata.len() < MAX_LOG_BYTES {
        return;
    }
    if let Some(rotated) = rotated_log_path() {
        let _ = fs::remove_file(&rotated);
        let _ = fs::rename(path, rotated);
    }
}

fn ensure_writer_thread() -> &'static SyncSender<String> {
    LOG_SENDER.get_or_init(|| {
        let (tx, rx) = mpsc::sync_channel::<String>(CHANNEL_CAPACITY);
        std::thread::Builder::new()
            .name("runtime-log-writer".into())
            .spawn(move || {
                for line in rx {
                    let (Some(dir), Some(path)) = (log_dir(), log_path()) else {
                        continue;
                    };
                    with_file_lock(|| {
                        if fs::create_dir_all(&dir).is_err() {
                            return;
                        }
                        rotate_if_needed(&path);
                        if let Ok(mut file) =
                            OpenOptions::new().create(true).append(true).open(&path)
                        {
                            let _ = writeln!(file, "{}", line);
                        }
                    });
                }
            })
            .expect("failed to spawn runtime log writer thread");
        tx
    })
}

pub fn append_runtime_log(component: &str, event: &str, data: Value) {
    let payload = json!({
        "ts": Utc::now().to_rfc3339(),
        "component": component,
        "event": event,
        "data": data,
    });
    let _ = ensure_writer_thread().try_send(payload.to_string());
}

pub fn read_runtime_logs(limit: Option<usize>) -> std::io::Result<Vec<String>> {
    let path = match log_path() {
        Some(p) => p,
        None => return Ok(Vec::new()),
    };
    with_file_lock(|| {
        let file = match File::open(&path) {
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
    let (Some(dir), Some(path)) = (log_dir(), log_path()) else {
        return Ok(());
    };
    with_file_lock(|| {
        fs::create_dir_all(&dir)?;
        File::create(&path)?;
        Ok(())
    })
}
