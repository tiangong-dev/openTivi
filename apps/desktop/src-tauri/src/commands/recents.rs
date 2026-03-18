use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub async fn list_recents(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> AppResult<Vec<RecentChannelDto>> {
    crate::core::services::recents_service::list_recents(&state.ctx, limit.unwrap_or(50)).await
}

#[tauri::command]
pub async fn mark_recent_watched(state: State<'_, AppState>, channel_id: i64) -> AppResult<()> {
    crate::core::services::recents_service::mark_recent_watched(&state.ctx, channel_id).await
}
