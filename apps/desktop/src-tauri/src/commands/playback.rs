use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub async fn resolve_playback(state: State<'_, AppState>, channel_id: i64) -> AppResult<PlaybackSourceDto> {
    crate::core::services::playback_service::resolve_playback(&state.ctx, channel_id).await
}

#[tauri::command]
pub async fn list_playback_candidates(
    state: State<'_, AppState>,
    channel_id: i64,
) -> AppResult<Vec<PlaybackSourceDto>> {
    crate::core::services::playback_service::list_playback_candidates(&state.ctx, channel_id).await
}

#[tauri::command]
pub async fn probe_playback_kind(stream_url: String) -> String {
    crate::core::services::playback_service::probe_playback_kind(&stream_url).await
}
