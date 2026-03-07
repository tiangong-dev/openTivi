use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub fn resolve_playback(state: State<AppState>, channel_id: i64) -> AppResult<PlaybackSourceDto> {
    let conn = state.db.lock().unwrap();
    crate::core::services::playback_service::resolve_playback(&conn, channel_id)
}
