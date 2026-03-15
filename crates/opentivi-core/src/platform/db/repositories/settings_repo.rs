use rusqlite::Connection;

use crate::dto::SettingDto;
use crate::error::AppResult;

pub fn list_all(conn: &Connection) -> AppResult<Vec<SettingDto>> {
    let mut stmt = conn.prepare("SELECT key, value_json, updated_at FROM settings ORDER BY key")?;

    let rows = stmt.query_map([], |row| {
        let value_str: String = row.get(1)?;
        let value: serde_json::Value =
            serde_json::from_str(&value_str).unwrap_or(serde_json::Value::Null);
        Ok(SettingDto {
            key: row.get(0)?,
            value,
            updated_at: row.get(2)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub fn upsert(conn: &Connection, key: &str, value: &serde_json::Value) -> AppResult<SettingDto> {
    let value_json = serde_json::to_string(value)?;

    conn.execute(
        "INSERT INTO settings (key, value_json, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value_json = ?2, updated_at = datetime('now')",
        rusqlite::params![key, value_json],
    )?;

    let setting = conn.query_row(
        "SELECT key, value_json, updated_at FROM settings WHERE key = ?1",
        [key],
        |row| {
            let vstr: String = row.get(1)?;
            let v: serde_json::Value =
                serde_json::from_str(&vstr).unwrap_or(serde_json::Value::Null);
            Ok(SettingDto {
                key: row.get(0)?,
                value: v,
                updated_at: row.get(2)?,
            })
        },
    )?;

    Ok(setting)
}
