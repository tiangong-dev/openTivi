use rusqlite::Connection;

use crate::dto::SettingDto;
use crate::error::AppResult;

pub fn get_settings(conn: &Connection) -> AppResult<Vec<SettingDto>> {
    crate::platform::db::repositories::settings_repo::list_all(conn)
}

pub fn set_setting(
    conn: &Connection,
    key: &str,
    value: &serde_json::Value,
) -> AppResult<SettingDto> {
    crate::platform::db::repositories::settings_repo::upsert(conn, key, value)
}
