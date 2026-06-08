//! Backup export/import (备份与恢复).
//!
//! A backup package is a zip containing `manifest.json` + `opentivi.db`. The db
//! is a consistent snapshot produced via `VACUUM INTO`, so un-checkpointed WAL
//! writes are captured. Import validates the manifest (format/schema version)
//! and every file's sha256 *before* touching the target db; on success the live
//! db is renamed aside as `opentivi.db.bak-<rfc3339>` and the snapshot landed
//! atomically.

use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

use crate::context::CoreContext;
use crate::error::{AppError, AppResult};
use crate::platform::db::migrations::current_schema_version;

/// Name of the db entry inside a backup package.
const DB_ENTRY: &str = "opentivi.db";
/// Name of the manifest entry inside a backup package.
const MANIFEST_ENTRY: &str = "manifest.json";
/// The only backup container format this build understands.
const FORMAT_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub format_version: u32,
    pub schema_version: u32,
    pub app_version: Option<String>,
    pub created_at: String,
    pub files: Vec<BackupFileEntry>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupFileEntry {
    pub name: String,
    pub size: u64,
    pub sha256: String,
}

/// Lowercase-hex sha256 of `bytes`.
fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// A unique sibling path of `near` that does not currently exist, used for
/// `VACUUM INTO` (which requires the target not to exist) and atomic landing.
fn unique_tmp_path(near: &Path, tag: &str) -> std::path::PathBuf {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let dir = near.parent().unwrap_or_else(|| Path::new("."));
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    loop {
        let candidate = dir.join(format!(
            "opentivi.{tag}.{}.{nanos}.{n}.tmp",
            std::process::id()
        ));
        if !candidate.exists() {
            return candidate;
        }
    }
}

/// Export a consistent backup of the context's db to `out_path`. Returns the
/// manifest that was written into the package.
pub async fn export_backup(ctx: &CoreContext, out_path: &Path) -> AppResult<BackupManifest> {
    // Snapshot the db (VACUUM INTO) and read its schema_version inside one
    // db task so both come from the same opened connection.
    let db_path = ctx.db.db_path().to_path_buf();
    let snap_path = unique_tmp_path(&db_path, "snapshot");
    let snap_for_task = snap_path.clone();

    let schema_version: u32 = ctx
        .db
        .run(move |conn| {
            let snap_str = snap_for_task.to_string_lossy().to_string();
            conn.execute("VACUUM INTO ?1", rusqlite::params![snap_str])
                .map_err(|e| AppError::Database(e.to_string()))?;
            let version: u32 = conn
                .query_row(
                    "SELECT COALESCE(MAX(version), 0) FROM _migrations",
                    [],
                    |row| row.get(0),
                )
                .map_err(|e| AppError::Database(e.to_string()))?;
            Ok(version)
        })
        .await?;

    // Read the snapshot bytes, hash them, then clean the snapshot up.
    let db_bytes = match std::fs::read(&snap_path) {
        Ok(b) => b,
        Err(e) => {
            let _ = std::fs::remove_file(&snap_path);
            return Err(AppError::from(e));
        }
    };
    let _ = std::fs::remove_file(&snap_path);

    let entry = BackupFileEntry {
        name: DB_ENTRY.to_string(),
        size: db_bytes.len() as u64,
        sha256: sha256_hex(&db_bytes),
    };

    let manifest = BackupManifest {
        format_version: FORMAT_VERSION,
        schema_version,
        app_version: Some(env!("CARGO_PKG_VERSION").to_string()),
        created_at: chrono::Utc::now().to_rfc3339(),
        files: vec![entry],
    };

    // Write the zip: manifest.json + opentivi.db.
    let manifest_bytes = serde_json::to_vec(&manifest)?;
    let file = std::fs::File::create(out_path)?;
    let mut zw = zip::ZipWriter::new(file);
    let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    zw.start_file(MANIFEST_ENTRY, opts)
        .map_err(|e| AppError::Internal(format!("zip write manifest: {e}")))?;
    zw.write_all(&manifest_bytes)?;
    zw.start_file(DB_ENTRY, opts)
        .map_err(|e| AppError::Internal(format!("zip write db: {e}")))?;
    zw.write_all(&db_bytes)?;
    zw.finish()
        .map_err(|e| AppError::Internal(format!("zip finish: {e}")))?;

    Ok(manifest)
}

/// Restore a backup package from `in_path` into the context's db. All
/// validation (format/schema version + per-file sha256) happens before the
/// target db is touched; on success the old db is preserved as
/// `opentivi.db.bak-<rfc3339>`.
pub async fn import_backup(ctx: &CoreContext, in_path: &Path) -> AppResult<BackupManifest> {
    let file = std::fs::File::open(in_path)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Validation(format!("not a valid backup zip: {e}")))?;

    // 1. Read + parse the manifest. A missing manifest is a bad package.
    let manifest_bytes = read_zip_entry(&mut archive, MANIFEST_ENTRY).map_err(|_| {
        AppError::Validation(format!("backup is missing `{MANIFEST_ENTRY}`"))
    })?;
    let manifest: BackupManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|e| AppError::Validation(format!("invalid backup manifest: {e}")))?;

    // 2. Format version gate.
    if manifest.format_version != FORMAT_VERSION {
        return Err(AppError::Validation(format!(
            "unsupported backup format_version {} (expected {FORMAT_VERSION})",
            manifest.format_version
        )));
    }

    // 3. Schema compatibility: refuse a backup newer than what we can migrate.
    let current = current_schema_version();
    if manifest.schema_version > current {
        return Err(AppError::Validation(format!(
            "backup schema_version {} is newer than supported schema_version {current}",
            manifest.schema_version
        )));
    }

    // 4. Extract + verify every file's sha256/size before mutating anything.
    let mut db_bytes: Option<Vec<u8>> = None;
    for entry in &manifest.files {
        let bytes = read_zip_entry(&mut archive, &entry.name).map_err(|_| {
            AppError::Validation(format!("backup is missing file `{}`", entry.name))
        })?;
        if bytes.len() as u64 != entry.size {
            return Err(AppError::Validation(format!(
                "backup file `{}` size mismatch (manifest {}, actual {})",
                entry.name,
                entry.size,
                bytes.len()
            )));
        }
        if sha256_hex(&bytes) != entry.sha256 {
            return Err(AppError::Validation(format!(
                "backup file `{}` sha256 mismatch (corrupted or tampered)",
                entry.name
            )));
        }
        if entry.name == DB_ENTRY {
            db_bytes = Some(bytes);
        }
    }
    let db_bytes = db_bytes.ok_or_else(|| {
        AppError::Validation(format!("backup manifest has no `{DB_ENTRY}` entry"))
    })?;

    // ── All validation passed; only now do we touch the target db. ──────────
    let db_path = ctx.db.db_path().to_path_buf();

    // Stage the new db next to the target, then swap atomically by rename.
    let staged = unique_tmp_path(&db_path, "incoming");
    std::fs::write(&staged, &db_bytes)?;

    // Preserve the existing db (if any) as opentivi.db.bak-<ts> and drop its
    // sidecar WAL/SHM so we never restore a half-new/half-old database.
    if db_path.exists() {
        let stamp = chrono::Utc::now().to_rfc3339();
        let bak = sidecar(&db_path, &format!("bak-{stamp}"));
        if let Err(e) = std::fs::rename(&db_path, &bak) {
            let _ = std::fs::remove_file(&staged);
            return Err(AppError::from(e));
        }
        let _ = std::fs::remove_file(sidecar(&db_path, "wal").as_path());
        let _ = std::fs::remove_file(sidecar(&db_path, "shm").as_path());
    }

    if let Err(e) = std::fs::rename(&staged, &db_path) {
        let _ = std::fs::remove_file(&staged);
        return Err(AppError::from(e));
    }

    Ok(manifest)
}

/// Build a sidecar path for `db_path` of the form `opentivi.db.<suffix>`
/// (e.g. `opentivi.db.wal`, `opentivi.db.bak-<ts>`).
fn sidecar(db_path: &Path, suffix: &str) -> std::path::PathBuf {
    let name = db_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("opentivi.db");
    db_path.with_file_name(format!("{name}.{suffix}"))
}

/// Read a named entry out of a zip archive into a byte vec.
fn read_zip_entry<R: Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
    name: &str,
) -> AppResult<Vec<u8>> {
    let mut entry = archive
        .by_name(name)
        .map_err(|e| AppError::Validation(format!("zip entry `{name}`: {e}")))?;
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf)?;
    Ok(buf)
}
