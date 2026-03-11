use serde::Deserialize;

use crate::core::services::runtime_logger;
use crate::error::AppResult;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLogInput {
    pub component: String,
    pub event: String,
    pub data: Option<serde_json::Value>,
}

#[tauri::command]
pub fn append_runtime_log(input: RuntimeLogInput) -> AppResult<()> {
    runtime_logger::append_runtime_log(
        input.component.trim(),
        input.event.trim(),
        input.data.unwrap_or(serde_json::Value::Null),
    );
    Ok(())
}

#[tauri::command]
pub fn get_runtime_logs(limit: Option<usize>) -> AppResult<Vec<String>> {
    Ok(runtime_logger::read_runtime_logs(limit)?)
}

#[tauri::command]
pub fn clear_runtime_logs() -> AppResult<()> {
    runtime_logger::clear_runtime_logs()?;
    Ok(())
}
