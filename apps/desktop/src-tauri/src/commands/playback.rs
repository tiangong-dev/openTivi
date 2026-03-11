use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub fn resolve_playback(state: State<AppState>, channel_id: i64) -> AppResult<PlaybackSourceDto> {
    let conn = state.db.lock().unwrap();
    crate::core::services::playback_service::resolve_playback(&conn, channel_id)
}

#[tauri::command]
pub fn list_playback_candidates(
    state: State<AppState>,
    channel_id: i64,
) -> AppResult<Vec<PlaybackSourceDto>> {
    let conn = state.db.lock().unwrap();
    crate::core::services::playback_service::list_playback_candidates(&conn, channel_id)
}

#[tauri::command]
pub async fn probe_playback_kind(stream_url: String) -> String {
    crate::core::services::playback_service::probe_playback_kind(&stream_url).await
}
