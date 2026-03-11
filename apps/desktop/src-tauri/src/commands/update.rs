use crate::commands::dto::AppUpdateInfoDto;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn check_app_update() -> AppResult<AppUpdateInfoDto> {
    tauri::async_runtime::spawn_blocking(crate::core::services::update_service::check_app_update)
        .await
        .map_err(|e| AppError::Internal(format!("update check task failed: {e}")))?
}
