use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
pub fn health() -> AppResult<String> {
    Ok("ok".to_string())
}

#[tauri::command]
pub fn get_proxy_port(state: State<AppState>) -> AppResult<u16> {
    Ok(state.proxy_port)
}
