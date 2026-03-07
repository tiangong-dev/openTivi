use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub fn list_recents(
    state: State<AppState>,
    limit: Option<u32>,
) -> AppResult<Vec<RecentChannelDto>> {
    let conn = state.db.lock().unwrap();
    crate::core::services::recents_service::list_recents(&conn, limit.unwrap_or(50))
}

#[tauri::command]
pub fn mark_recent_watched(state: State<AppState>, channel_id: i64) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    crate::core::services::recents_service::mark_recent_watched(&conn, channel_id)
}
