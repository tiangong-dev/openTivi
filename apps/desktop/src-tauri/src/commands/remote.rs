use serde::Serialize;
use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConfigInfoDto {
    pub url: String,
}

#[tauri::command]
pub fn get_remote_config_info(state: State<AppState>) -> AppResult<RemoteConfigInfoDto> {
    Ok(RemoteConfigInfoDto {
        url: state.remote_config_url.clone(),
    })
}
