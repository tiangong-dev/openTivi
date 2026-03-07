use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub fn list_sources(state: State<AppState>) -> AppResult<Vec<SourceDto>> {
    let conn = state.db.lock().unwrap();
    crate::core::services::source_service::list_sources(&conn)
}

#[tauri::command]
pub fn import_m3u(state: State<AppState>, input: ImportM3uInput) -> AppResult<ImportSummaryDto> {
    let conn = state.db.lock().unwrap();
    crate::core::services::import_service::import_m3u(&conn, &input.name, &input.location)
}

#[tauri::command]
pub fn import_xtream(
    state: State<AppState>,
    input: ImportXtreamInput,
) -> AppResult<ImportSummaryDto> {
    let conn = state.db.lock().unwrap();
    crate::core::services::import_service::import_xtream(
        &conn,
        &input.name,
        &input.server_url,
        &input.username,
        &input.password,
    )
}

#[tauri::command]
pub fn import_xmltv(
    state: State<AppState>,
    input: ImportXmltvInput,
) -> AppResult<ImportSummaryDto> {
    let conn = state.db.lock().unwrap();
    crate::core::services::import_service::import_xmltv(&conn, &input.name, &input.location)
}

#[tauri::command]
pub fn refresh_source(state: State<AppState>, source_id: i64) -> AppResult<ImportSummaryDto> {
    let conn = state.db.lock().unwrap();
    crate::core::services::import_service::refresh_source(&conn, source_id)
}

#[tauri::command]
pub fn delete_source(state: State<AppState>, source_id: i64) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    crate::core::services::source_service::delete_source(&conn, source_id)
}
