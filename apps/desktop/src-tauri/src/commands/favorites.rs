use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub async fn list_favorites(state: State<'_, AppState>) -> AppResult<Vec<ChannelListItemDto>> {
    crate::core::services::favorites_service::list_favorites(&state.ctx).await
}

#[tauri::command]
pub async fn set_favorite(state: State<'_, AppState>, input: SetFavoriteInput) -> AppResult<()> {
    crate::core::services::favorites_service::set_favorite(&state.ctx, input.channel_id, input.favorite).await
}
