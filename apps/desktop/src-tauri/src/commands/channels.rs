use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub fn list_channels(
    state: State<AppState>,
    query: ListChannelsQuery,
) -> AppResult<Vec<ChannelListItemDto>> {
    let conn = state.db.lock().unwrap();
    crate::core::services::channel_service::list_channels(
        &conn,
        query.source_id,
        query.group_name.as_deref(),
        query.search.as_deref(),
        query.favorites_only.unwrap_or(false),
        query.limit.unwrap_or(200),
        query.offset.unwrap_or(0),
    )
}

#[tauri::command]
pub fn list_groups(state: State<AppState>, source_id: Option<i64>) -> AppResult<Vec<String>> {
    let conn = state.db.lock().unwrap();
    crate::core::services::channel_service::list_groups(&conn, source_id)
}

#[tauri::command]
pub fn get_channel_epg(
    state: State<AppState>,
    query: GetChannelEpgQuery,
) -> AppResult<Vec<EpgProgramDto>> {
    let conn = state.db.lock().unwrap();
    crate::core::services::epg_service::get_channel_epg(
        &conn,
        query.channel_id,
        query.from.as_deref(),
        query.to.as_deref(),
    )
}

#[tauri::command]
pub fn get_channels_epg_snapshots(
    state: State<AppState>,
    query: GetChannelsEpgSnapshotsQuery,
) -> AppResult<Vec<ChannelEpgSnapshotDto>> {
    let conn = state.db.lock().unwrap();
    crate::core::services::epg_service::get_channels_epg_snapshots(
        &conn,
        &query.channel_ids,
        query.window_start_ts,
        query.window_end_ts,
    )
}
