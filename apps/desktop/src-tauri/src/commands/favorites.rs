use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub fn list_favorites(state: State<AppState>) -> AppResult<Vec<ChannelListItemDto>> {
    let conn = state.db.lock().unwrap();
    crate::core::services::favorites_service::list_favorites(&conn)
}

#[tauri::command]
pub fn set_favorite(state: State<AppState>, input: SetFavoriteInput) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    crate::core::services::favorites_service::set_favorite(&conn, input.channel_id, input.favorite)
}
