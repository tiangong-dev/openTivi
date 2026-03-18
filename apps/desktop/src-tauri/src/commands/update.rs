use tauri::State;

use crate::commands::dto::AppUpdateInfoDto;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
pub async fn check_app_update(state: State<'_, AppState>) -> AppResult<AppUpdateInfoDto> {
    crate::core::services::update_service::check_app_update(&state.ctx.http).await
}
