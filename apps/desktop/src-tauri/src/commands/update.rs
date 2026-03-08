use crate::commands::dto::AppUpdateInfoDto;
use crate::error::AppResult;

#[tauri::command]
pub fn check_app_update() -> AppResult<AppUpdateInfoDto> {
    crate::core::services::update_service::check_app_update()
}
