use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<Vec<SettingDto>> {
    crate::core::services::settings_service::get_settings(&state.ctx).await
}

#[tauri::command]
pub async fn set_setting(state: State<'_, AppState>, input: SetSettingInput) -> AppResult<SettingDto> {
    crate::core::services::settings_service::set_setting(&state.ctx, input.key, input.value).await
}
