use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub async fn list_sources(state: State<'_, AppState>) -> AppResult<Vec<SourceDto>> {
    crate::core::services::source_service::list_sources(&state.ctx).await
}

#[tauri::command]
pub async fn import_m3u(state: State<'_, AppState>, input: ImportM3uInput) -> AppResult<ImportSummaryDto> {
    crate::core::services::import_service::import_m3u(
        &state.ctx,
        &input.name,
        &input.location,
        input.auto_refresh_minutes,
    )
    .await
}

#[tauri::command]
pub async fn import_xtream(state: State<'_, AppState>, input: ImportXtreamInput) -> AppResult<ImportSummaryDto> {
    crate::core::services::import_service::import_xtream(
        &state.ctx,
        &input.name,
        &input.server_url,
        &input.username,
        &input.password,
    )
    .await
}

#[tauri::command]
pub async fn import_xmltv(state: State<'_, AppState>, input: ImportXmltvInput) -> AppResult<ImportSummaryDto> {
    crate::core::services::import_service::import_xmltv(&state.ctx, &input.name, &input.location).await
}

#[tauri::command]
pub async fn refresh_source(state: State<'_, AppState>, source_id: i64) -> AppResult<ImportSummaryDto> {
    crate::core::services::import_service::refresh_source(&state.ctx, source_id).await
}

#[tauri::command]
pub async fn delete_source(state: State<'_, AppState>, source_id: i64) -> AppResult<()> {
    crate::core::services::source_service::delete_source(&state.ctx, source_id).await
}

#[tauri::command]
pub async fn update_source(state: State<'_, AppState>, input: UpdateSourceInput) -> AppResult<()> {
    crate::core::services::source_service::update_source(
        &state.ctx,
        input.source_id,
        input.name,
        input.location,
        input.username,
        input.password,
        input.auto_refresh_minutes,
        input.enabled,
    )
    .await
}
