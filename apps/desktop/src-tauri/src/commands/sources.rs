use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub async fn list_sources() -> AppResult<Vec<SourceDto>> {
    tauri::async_runtime::spawn_blocking(move || {
        let conn = crate::platform::db::connection::open_connection()
            .map_err(|e| AppError::Internal(format!("failed to open database: {e}")))?;
        crate::core::services::source_service::list_sources(&conn)
    })
    .await
    .map_err(|e| AppError::Internal(format!("list sources task failed: {e}")))?
}

#[tauri::command]
pub async fn import_m3u(input: ImportM3uInput) -> AppResult<ImportSummaryDto> {
    run_import_job(move |conn| {
        crate::core::services::import_service::import_m3u(
            conn,
            &input.name,
            &input.location,
            input.auto_refresh_minutes,
        )
    })
    .await
}

#[tauri::command]
pub async fn import_xtream(input: ImportXtreamInput) -> AppResult<ImportSummaryDto> {
    run_import_job(move |conn| {
        crate::core::services::import_service::import_xtream(
            conn,
            &input.name,
            &input.server_url,
            &input.username,
            &input.password,
        )
    })
    .await
}

#[tauri::command]
pub async fn import_xmltv(input: ImportXmltvInput) -> AppResult<ImportSummaryDto> {
    run_import_job(move |conn| {
        crate::core::services::import_service::import_xmltv(conn, &input.name, &input.location)
    })
    .await
}

#[tauri::command]
pub async fn refresh_source(source_id: i64) -> AppResult<ImportSummaryDto> {
    run_import_job(move |conn| {
        crate::core::services::import_service::refresh_source(conn, source_id)
    })
    .await
}

#[tauri::command]
pub fn delete_source(state: State<AppState>, source_id: i64) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    crate::core::services::source_service::delete_source(&conn, source_id)
}

#[tauri::command]
pub fn update_source(state: State<AppState>, input: UpdateSourceInput) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    crate::core::services::source_service::update_source(
        &conn,
        input.source_id,
        &input.name,
        &input.location,
        input.username.as_deref(),
        input.password.as_deref(),
        input.auto_refresh_minutes,
        input.enabled,
    )
}

async fn run_import_job<F>(job: F) -> AppResult<ImportSummaryDto>
where
    F: FnOnce(&rusqlite::Connection) -> AppResult<ImportSummaryDto> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let conn = crate::platform::db::connection::open_connection()
            .map_err(|e| AppError::Internal(format!("failed to open database: {e}")))?;
        job(&conn)
    })
    .await
    .map_err(|e| AppError::Internal(format!("background import task failed: {e}")))?
}
