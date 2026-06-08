use tauri::State;

use crate::core::services::reminders_service;
use crate::error::AppResult;
use crate::state::AppState;

use super::dto::*;

#[tauri::command]
pub async fn add_reminder(
    state: State<'_, AppState>,
    channel_id: i64,
    program_start_epoch: i64,
    program_stop_epoch: Option<i64>,
    program_title: String,
    program_desc: Option<String>,
) -> AppResult<i64> {
    reminders_service::add_reminder(
        &state.ctx,
        channel_id,
        program_start_epoch,
        program_stop_epoch,
        program_title,
        program_desc,
    )
    .await
}

#[tauri::command]
pub async fn remove_reminder(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    reminders_service::remove_reminder(&state.ctx, id).await
}

#[tauri::command]
pub async fn list_reminders(state: State<'_, AppState>) -> AppResult<Vec<ReminderDto>> {
    reminders_service::list_reminders(&state.ctx).await
}

#[tauri::command]
pub async fn due_reminders(
    state: State<'_, AppState>,
    now_epoch: i64,
    window_secs: i64,
) -> AppResult<Vec<ReminderDto>> {
    reminders_service::due_reminders(&state.ctx, now_epoch, window_secs).await
}

#[tauri::command]
pub async fn mark_reminder_fired(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    reminders_service::mark_reminder_fired(&state.ctx, id).await
}
