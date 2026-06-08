use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub async fn list_channels(
    state: State<'_, AppState>,
    query: ListChannelsQuery,
) -> AppResult<Vec<ChannelListItemDto>> {
    crate::core::services::channel_service::list_channels(
        &state.ctx,
        query.source_id,
        query.group_name,
        query.search,
        query.favorites_only.unwrap_or(false),
        query.limit.unwrap_or(200),
        query.offset.unwrap_or(0),
    )
    .await
}

#[tauri::command]
pub async fn list_groups(state: State<'_, AppState>, source_id: Option<i64>) -> AppResult<Vec<String>> {
    crate::core::services::channel_service::list_groups(&state.ctx, source_id).await
}

#[tauri::command]
pub async fn get_channel_epg(
    state: State<'_, AppState>,
    query: GetChannelEpgQuery,
) -> AppResult<Vec<EpgProgramDto>> {
    crate::core::services::epg_service::get_channel_epg(
        &state.ctx,
        query.channel_id,
        query.from,
        query.to,
    )
    .await
}

#[tauri::command]
pub async fn get_channels_epg_snapshots(
    state: State<'_, AppState>,
    query: GetChannelsEpgSnapshotsQuery,
) -> AppResult<Vec<ChannelEpgSnapshotDto>> {
    crate::core::services::epg_service::get_channels_epg_snapshots(
        &state.ctx,
        query.channel_ids,
        query.window_start_ts,
        query.window_end_ts,
    )
    .await
}

#[tauri::command]
pub async fn search_epg(
    state: State<'_, AppState>,
    query: SearchEpgQuery,
) -> AppResult<Vec<EpgProgramSearchResultDto>> {
    crate::core::services::epg_service::search_programs(
        &state.ctx,
        query.search,
        query.state,
        query.limit.unwrap_or(100),
    )
    .await
}

#[tauri::command]
pub async fn get_channel(state: State<'_, AppState>, channel_id: i64) -> AppResult<Option<ChannelListItemDto>> {
    state.ctx.db.run(move |conn| {
        crate::platform::db::repositories::channel_repo::get_enabled_channel_dto_by_id(conn, channel_id)
    }).await
}
