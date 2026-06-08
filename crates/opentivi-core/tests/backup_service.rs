//! Integration tests (TDD red) for backup-core (export/import 备份与恢复).
//!
//! These tests are written BEFORE the implementation exists. They reference
//! `opentivi_core::core::services::backup_service::{export_backup, import_backup,
//! BackupManifest, BackupFileEntry}`, none of which exist yet, so the test crate
//! is **compile-red** (unresolved import) until the implementer adds the module.
//!
//! Contract pinned here (test = spec):
//!  - 备份包 = zip，含 `manifest.json` + `opentivi.db`（VACUUM INTO 一致快照）。
//!  - `BackupManifest { format_version, schema_version, app_version, created_at,
//!    files }` (serde camelCase), `BackupFileEntry { name, size, sha256 }`.
//!  - 恢复：校验 format_version==1、schema_version<=15、每文件 sha256 匹配；通过后
//!    把现有 opentivi.db 改名为 opentivi.db.bak-<时间> 保留，再落新库。
//!
//! We do NOT depend on the `DbExecutor::db_path()` getter the implementer will add;
//! each test holds its own temp db path and asserts directly against it.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use opentivi_core::context::CoreContext;
use opentivi_core::platform::db::executor::DbExecutor;
use opentivi_core::platform::db::migrations::run_migrations;
use opentivi_core::rusqlite::Connection;

use opentivi_core::core::services::backup_service::{
    export_backup, import_backup, BackupManifest,
};

/// Highest registered migration version (per migrations.rs MIGRATIONS table).
const CURRENT_SCHEMA_VERSION: u32 = 15;

// ── Fixtures ───────────────────────────────────────────────────────────────

/// Build a CoreContext backed by a fresh on-disk db migrated to version 15.
///
/// Returns the live context, the owning TempDir (kept alive by the caller), and
/// the absolute db path so tests can open / inspect / tamper the file directly
/// without relying on any db_path() getter. We deliberately avoid the global
/// `paths::db_path()` OnceLock so concurrent tests never share a path.
fn temp_ctx() -> (CoreContext, tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("tempdir should be creatable");
    let db_path = dir.path().join("opentivi.db");

    // Migrate to v15 via a one-shot connection (same pattern as playback_service
    // tests). DbExecutor::run would also work, but a direct connection keeps the
    // fixture synchronous and obvious.
    let conn = Connection::open(&db_path).expect("temp db should open");
    run_migrations(&conn).expect("migrations to v15 should succeed");
    drop(conn);

    let ctx = CoreContext::new(DbExecutor::new(db_path.clone()));
    (ctx, dir, db_path)
}

/// Open a one-shot connection to a db path for direct assertions / seeding.
fn open(path: &Path) -> Connection {
    Connection::open(path).expect("db should open")
}

/// Seed a source + N channels + one settings row into the db at `path`.
/// Returns (source_id, channel_count).
fn seed_data(path: &Path) -> (i64, i64) {
    let conn = open(path);
    conn.execute(
        "INSERT INTO sources (kind, name, location, enabled, created_at, updated_at) \
         VALUES ('m3u', 'Seed Source', 'http://example.com/seed.m3u', 1, datetime('now'), datetime('now'))",
        [],
    )
    .expect("source insert should succeed");
    let source_id = conn.last_insert_rowid();

    for i in 0..3 {
        conn.execute(
            "INSERT INTO channels (channel_key, source_id, name, stream_url, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))",
            opentivi_core::rusqlite::params![
                format!("ck.seed.{i}"),
                source_id,
                format!("Seed Channel {i}"),
                format!("http://example.com/seed{i}.ts"),
            ],
        )
        .expect("channel insert should succeed");
    }

    conn.execute(
        "INSERT INTO settings (key, value_json, updated_at) \
         VALUES ('backup.test.key', '\"sentinel-value\"', datetime('now'))",
        [],
    )
    .expect("settings insert should succeed");

    let channel_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM channels", [], |r| r.get(0))
        .unwrap();
    (source_id, channel_count)
}

/// Count rows in a table at the given db path.
fn count(path: &Path, table: &str) -> i64 {
    open(path)
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
        .unwrap()
}

/// Read the bytes of an entry inside a zip at `zip_path`. Panics if absent.
fn read_zip_entry(zip_path: &Path, name: &str) -> Vec<u8> {
    let file = std::fs::File::open(zip_path).expect("backup zip should open");
    let mut archive = zip::ZipArchive::new(file).expect("backup must be a valid zip");
    let mut entry = archive
        .by_name(name)
        .unwrap_or_else(|_| panic!("zip must contain `{name}`"));
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf).expect("entry read should succeed");
    buf
}

/// True if the zip at `zip_path` contains an entry named `name`.
fn zip_has_entry(zip_path: &Path, name: &str) -> bool {
    let file = std::fs::File::open(zip_path).expect("backup zip should open");
    let mut archive = zip::ZipArchive::new(file).expect("backup must be a valid zip");
    let found = archive.by_name(name).is_ok();
    found
}

/// Lowercase hex sha256 of a byte slice (independent of the implementation's hash).
fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Build a new tokio current-thread runtime for blocking on the async API.
fn block_on<F: std::future::Future>(fut: F) -> F::Output {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("runtime")
        .block_on(fut)
}

/// Write a custom zip (manifest + db bytes) to `out`, letting the test forge bad
/// packages. `manifest_bytes` is written verbatim as `manifest.json` (or omitted
/// if None), `db_bytes` as `opentivi.db` (or omitted if None).
fn write_zip(out: &Path, manifest_bytes: Option<&[u8]>, db_bytes: Option<&[u8]>) {
    let file = std::fs::File::create(out).expect("create forged zip");
    let mut zw = zip::ZipWriter::new(file);
    let opts: zip::write::FileOptions<'_, ()> =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    if let Some(m) = manifest_bytes {
        zw.start_file("manifest.json", opts).unwrap();
        zw.write_all(m).unwrap();
    }
    if let Some(d) = db_bytes {
        zw.start_file("opentivi.db", opts).unwrap();
        zw.write_all(d).unwrap();
    }
    zw.finish().expect("finish forged zip");
}

/// Find a `opentivi.db.bak-*` sibling of `db_path`, if any.
fn find_bak_file(db_path: &Path) -> Option<PathBuf> {
    let dir = db_path.parent().unwrap();
    std::fs::read_dir(dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .find(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("opentivi.db.bak-"))
                .unwrap_or(false)
        })
}

// ── T2: export 含 db + manifest ─────────────────────────────────────────────

/// Export must produce a zip containing BOTH `manifest.json` and `opentivi.db`.
///
/// Catches: an export that forgets the manifest, forgets the db snapshot, or
/// emits a non-zip / wrongly-named entries.
#[test]
fn export_zip_contains_manifest_and_db() {
    let (ctx, _dir, _db_path) = temp_ctx();
    let out = _dir.path().join("backup.zip");

    block_on(export_backup(&ctx, &out)).expect("export should succeed");

    assert!(out.exists(), "export must write the out_path file");
    assert!(
        zip_has_entry(&out, "manifest.json"),
        "backup zip must contain manifest.json"
    );
    assert!(
        zip_has_entry(&out, "opentivi.db"),
        "backup zip must contain opentivi.db"
    );
}

// ── T3: manifest schema_version / format_version 正确 ───────────────────────

/// The returned manifest must report schema_version == 15 (the highest applied
/// migration) and format_version == 1.
///
/// Catches: hardcoding the wrong schema version, reading it from the wrong place,
/// or shipping a format_version other than 1.
#[test]
fn manifest_reports_schema_and_format_version() {
    let (ctx, _dir, _db_path) = temp_ctx();
    let out = _dir.path().join("backup.zip");

    let manifest: BackupManifest = block_on(export_backup(&ctx, &out)).expect("export should succeed");

    assert_eq!(
        manifest.schema_version, CURRENT_SCHEMA_VERSION,
        "manifest.schema_version must equal the highest applied migration (15)"
    );
    assert_eq!(
        manifest.format_version, 1,
        "manifest.format_version must be 1"
    );
}

// ── T4: 校验和真实（sha256 + size） ─────────────────────────────────────────

/// The manifest's per-file sha256 must be the real lowercase-hex sha256 of the
/// db bytes stored in the zip, and `size` must equal the byte length.
///
/// Catches: a fabricated / placeholder hash, an upper-case or truncated hash, a
/// size that does not match the stored bytes, or hashing the wrong bytes.
#[test]
fn manifest_checksum_matches_stored_db_bytes() {
    let (ctx, _dir, _db_path) = temp_ctx();
    let out = _dir.path().join("backup.zip");

    let manifest = block_on(export_backup(&ctx, &out)).expect("export should succeed");

    let db_bytes = read_zip_entry(&out, "opentivi.db");
    let expected = sha256_hex(&db_bytes);

    let entry = manifest
        .files
        .iter()
        .find(|f| f.name == "opentivi.db")
        .expect("manifest.files must include an entry for opentivi.db");

    assert_eq!(
        entry.sha256, expected,
        "manifest sha256 for opentivi.db must be the real lowercase-hex digest of the stored bytes"
    );
    assert_eq!(
        entry.size,
        db_bytes.len() as u64,
        "manifest size for opentivi.db must equal the stored byte count"
    );
}

// ── T5: 恢复后数据一致 ──────────────────────────────────────────────────────

/// Round-trip: data written to ctx A and exported must reappear in an empty
/// ctx B (independent tempdir) after import — sources, channels, AND settings.
///
/// Catches: an import that drops tables, restores only some tables, loses the
/// settings row, or writes the snapshot to the wrong place.
#[test]
fn import_restores_sources_channels_and_settings() {
    let (ctx_a, dir_a, db_a) = temp_ctx();
    let (src_count_a, chan_count_a) = {
        seed_data(&db_a);
        (count(&db_a, "sources"), count(&db_a, "channels"))
    };
    let out = dir_a.path().join("backup.zip");
    block_on(export_backup(&ctx_a, &out)).expect("export should succeed");

    // Empty ctx B (migrated, no seed data).
    let (ctx_b, _dir_b, db_b) = temp_ctx();
    assert_eq!(count(&db_b, "channels"), 0, "B starts empty");

    block_on(import_backup(&ctx_b, &out)).expect("import should succeed");

    assert_eq!(
        count(&db_b, "sources"),
        src_count_a,
        "B.sources count must match A after restore"
    );
    assert_eq!(
        count(&db_b, "channels"),
        chan_count_a,
        "B.channels count must match A after restore"
    );

    let settings_value: String = open(&db_b)
        .query_row(
            "SELECT value_json FROM settings WHERE key = 'backup.test.key'",
            [],
            |r| r.get(0),
        )
        .expect("settings row must come back with the DB");
    assert_eq!(
        settings_value, "\"sentinel-value\"",
        "the settings row must be restored verbatim (settings travels with the DB)"
    );
}

// ── T6: WAL 未 checkpoint 也进快照 ──────────────────────────────────────────

/// Rows written under WAL without an explicit checkpoint must still appear in the
/// snapshot, so importing into B surfaces them.
///
/// `open_at` enables `journal_mode=WAL`, so writes may sit in the -wal file. A
/// naive byte-copy of just `opentivi.db` would miss them; `VACUUM INTO` (a
/// consistent snapshot) must capture them.
///
/// Catches: an export that copies the main db file raw and loses un-checkpointed
/// WAL writes.
#[test]
fn export_captures_uncheckpointed_wal_writes() {
    let (ctx_a, dir_a, db_a) = temp_ctx();

    // Write under WAL and deliberately do NOT checkpoint: open a connection,
    // insert, then drop without PRAGMA wal_checkpoint.
    {
        let conn = open(&db_a);
        conn.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
        conn.execute(
            "INSERT INTO sources (kind, name, location, enabled, created_at, updated_at) \
             VALUES ('m3u', 'WAL Source', 'http://example.com/wal.m3u', 1, datetime('now'), datetime('now'))",
            [],
        )
        .unwrap();
        let sid = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO channels (channel_key, source_id, name, stream_url, created_at, updated_at) \
             VALUES ('ck.wal', ?1, 'WAL Channel', 'http://example.com/wal.ts', datetime('now'), datetime('now'))",
            opentivi_core::rusqlite::params![sid],
        )
        .unwrap();
        // drop conn here — no explicit checkpoint
    }

    let out = dir_a.path().join("backup.zip");
    block_on(export_backup(&ctx_a, &out)).expect("export should succeed");

    let (ctx_b, _dir_b, db_b) = temp_ctx();
    block_on(import_backup(&ctx_b, &out)).expect("import should succeed");

    let wal_channels: i64 = open(&db_b)
        .query_row(
            "SELECT COUNT(*) FROM channels WHERE channel_key = 'ck.wal'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        wal_channels, 1,
        "un-checkpointed WAL writes must be present in the snapshot and restored into B"
    );
}

// ── T7: 版本不兼容拒绝（schema_version=999） ────────────────────────────────

/// A package whose manifest declares schema_version=999 (> current 15) must be
/// rejected, and the target db must be left untouched.
///
/// Catches: skipping the schema_version ceiling check (would let a newer-schema
/// backup clobber an older app and corrupt it), or mutating the target before
/// validation passes.
#[test]
fn import_rejects_incompatible_schema_version() {
    // Produce a real, valid backup first so the db bytes + hash are consistent;
    // then re-pack with a bumped schema_version so ONLY the version check fails.
    let (ctx_a, dir_a, _db_a) = temp_ctx();
    let real = dir_a.path().join("real.zip");
    block_on(export_backup(&ctx_a, &real)).expect("export should succeed");
    let db_bytes = read_zip_entry(&real, "opentivi.db");

    let manifest = serde_json::json!({
        "formatVersion": 1,
        "schemaVersion": 999,
        "appVersion": null,
        "createdAt": "2026-01-01T00:00:00Z",
        "files": [{
            "name": "opentivi.db",
            "size": db_bytes.len(),
            "sha256": sha256_hex(&db_bytes),
        }]
    });
    let forged = dir_a.path().join("forged-v999.zip");
    write_zip(
        &forged,
        Some(serde_json::to_vec(&manifest).unwrap().as_slice()),
        Some(&db_bytes),
    );

    let (ctx_b, _dir_b, db_b) = temp_ctx();
    seed_data(&db_b);
    let before = count(&db_b, "channels");

    let res = block_on(import_backup(&ctx_b, &forged));
    assert!(
        res.is_err(),
        "import must reject a backup whose schema_version (999) exceeds current (15)"
    );

    assert_eq!(
        count(&db_b, "channels"),
        before,
        "a rejected (incompatible) import must not mutate the target db"
    );
    assert!(
        find_bak_file(&db_b).is_none(),
        "a rejected import must not leave a .bak file (target untouched)"
    );
}

// ── T8: 校验和不符拒绝（篡改 db 一字节） ─────────────────────────────────────

/// Tampering one byte of the packed `opentivi.db` without updating the manifest
/// sha256 must make import fail, leaving the target untouched.
///
/// Catches: skipping per-file sha256 verification (would silently restore a
/// corrupted / maliciously altered db).
#[test]
fn import_rejects_checksum_mismatch() {
    let (ctx_a, dir_a, _db_a) = temp_ctx();
    let real = dir_a.path().join("real.zip");
    let manifest = block_on(export_backup(&ctx_a, &real)).expect("export should succeed");

    // Take the REAL manifest bytes (unchanged hash) but corrupt the db payload.
    let mut db_bytes = read_zip_entry(&real, "opentivi.db");
    let real_entry = manifest
        .files
        .iter()
        .find(|f| f.name == "opentivi.db")
        .unwrap();
    // Flip one byte deep enough to not be a header/magic the unpacker rejects
    // before hashing (we want the HASH check to be the thing that fails).
    let idx = db_bytes.len() / 2;
    db_bytes[idx] ^= 0xFF;

    let manifest_json = serde_json::json!({
        "formatVersion": manifest.format_version,
        "schemaVersion": manifest.schema_version,
        "appVersion": manifest.app_version,
        "createdAt": manifest.created_at,
        "files": [{
            "name": "opentivi.db",
            // size unchanged (we flipped, not resized) and sha256 still the ORIGINAL
            "size": real_entry.size,
            "sha256": real_entry.sha256,
        }]
    });
    let forged = dir_a.path().join("forged-tampered.zip");
    write_zip(
        &forged,
        Some(serde_json::to_vec(&manifest_json).unwrap().as_slice()),
        Some(&db_bytes),
    );

    let (ctx_b, _dir_b, db_b) = temp_ctx();
    seed_data(&db_b);
    let before = count(&db_b, "channels");

    let res = block_on(import_backup(&ctx_b, &forged));
    assert!(
        res.is_err(),
        "import must reject a backup whose db bytes do not match the manifest sha256"
    );
    assert_eq!(
        count(&db_b, "channels"),
        before,
        "a checksum-failed import must not mutate the target db"
    );
}

// ── T9a: 恢复保留旧库（opentivi.db.bak-*） ──────────────────────────────────

/// A successful import must rename the pre-existing db to `opentivi.db.bak-<ts>`
/// (preserving the old data) before landing the new one. The .bak file's content
/// must equal the original target db.
///
/// Catches: an import that overwrites the live db in place with no backup, or
/// names the backup file wrongly so a rollback is impossible.
#[test]
fn import_preserves_old_db_as_bak() {
    // Build a backup from A.
    let (ctx_a, dir_a, _db_a) = temp_ctx();
    seed_data(&_db_a);
    let out = dir_a.path().join("backup.zip");
    block_on(export_backup(&ctx_a, &out)).expect("export should succeed");

    // B has its OWN distinct content before import.
    let (ctx_b, _dir_b, db_b) = temp_ctx();
    {
        let conn = open(&db_b);
        conn.execute(
            "INSERT INTO settings (key, value_json, updated_at) \
             VALUES ('b.only', '\"old-b-data\"', datetime('now'))",
            [],
        )
        .unwrap();
    }
    let original_b_bytes = std::fs::read(&db_b).expect("read B db before import");

    block_on(import_backup(&ctx_b, &out)).expect("import should succeed");

    let bak = find_bak_file(&db_b).expect("import must leave an opentivi.db.bak-* file");
    let bak_bytes = std::fs::read(&bak).expect("read bak file");
    assert_eq!(
        bak_bytes, original_b_bytes,
        "the .bak file content must equal B's original db (old library preserved)"
    );
}

// ── T9b: 坏包拒绝（缺 manifest.json） ───────────────────────────────────────

/// A zip missing `manifest.json` must be rejected, and the target untouched.
///
/// Catches: an import that assumes the manifest is present and panics / restores
/// a db it never validated.
#[test]
fn import_rejects_zip_missing_manifest() {
    let (ctx_a, dir_a, _db_a) = temp_ctx();
    let real = dir_a.path().join("real.zip");
    block_on(export_backup(&ctx_a, &real)).expect("export should succeed");
    let db_bytes = read_zip_entry(&real, "opentivi.db");

    // Zip with ONLY opentivi.db, no manifest.json.
    let bad = dir_a.path().join("no-manifest.zip");
    write_zip(&bad, None, Some(&db_bytes));

    let (ctx_b, _dir_b, db_b) = temp_ctx();
    seed_data(&db_b);
    let before = count(&db_b, "channels");

    let res = block_on(import_backup(&ctx_b, &bad));
    assert!(
        res.is_err(),
        "import must reject a zip with no manifest.json"
    );
    assert_eq!(
        count(&db_b, "channels"),
        before,
        "rejecting a manifest-less zip must not mutate the target db"
    );
}

// ── T9c: 坏包拒绝（format_version=2） ───────────────────────────────────────

/// A manifest declaring format_version=2 (unknown) must be rejected, target
/// untouched.
///
/// Catches: skipping the format_version==1 gate (would let a future/foreign pack
/// format be mis-restored).
#[test]
fn import_rejects_unknown_format_version() {
    let (ctx_a, dir_a, _db_a) = temp_ctx();
    let real = dir_a.path().join("real.zip");
    block_on(export_backup(&ctx_a, &real)).expect("export should succeed");
    let db_bytes = read_zip_entry(&real, "opentivi.db");

    let manifest = serde_json::json!({
        "formatVersion": 2,
        "schemaVersion": CURRENT_SCHEMA_VERSION,
        "appVersion": null,
        "createdAt": "2026-01-01T00:00:00Z",
        "files": [{
            "name": "opentivi.db",
            "size": db_bytes.len(),
            "sha256": sha256_hex(&db_bytes),
        }]
    });
    let forged = dir_a.path().join("forged-fmt2.zip");
    write_zip(
        &forged,
        Some(serde_json::to_vec(&manifest).unwrap().as_slice()),
        Some(&db_bytes),
    );

    let (ctx_b, _dir_b, db_b) = temp_ctx();
    seed_data(&db_b);
    let before = count(&db_b, "channels");

    let res = block_on(import_backup(&ctx_b, &forged));
    assert!(
        res.is_err(),
        "import must reject a manifest with format_version != 1"
    );
    assert_eq!(
        count(&db_b, "channels"),
        before,
        "rejecting an unknown format_version must not mutate the target db"
    );
}
