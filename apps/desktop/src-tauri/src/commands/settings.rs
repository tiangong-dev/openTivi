use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> AppResult<Vec<SettingDto>> {
    let conn = state.db.lock().unwrap();
    crate::core::services::settings_service::get_settings(&conn)
}

#[tauri::command]
pub fn set_setting(state: State<AppState>, input: SetSettingInput) -> AppResult<SettingDto> {
    let conn = state.db.lock().unwrap();
    crate::core::services::settings_service::set_setting(&conn, &input.key, &input.value)
}
