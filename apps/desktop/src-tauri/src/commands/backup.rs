use std::path::Path;

use tauri::State;

use crate::core::services::backup_service::{self, BackupManifest};
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
pub async fn export_backup(state: State<'_, AppState>, out_path: String) -> AppResult<BackupManifest> {
    backup_service::export_backup(&state.ctx, Path::new(&out_path)).await
}

#[tauri::command]
pub async fn import_backup(state: State<'_, AppState>, in_path: String) -> AppResult<BackupManifest> {
    backup_service::import_backup(&state.ctx, Path::new(&in_path)).await
}
