pub mod connection;
pub mod migrations;
pub mod repositories;

use crate::error::AppResult;

pub fn collect_rows<T>(rows: rusqlite::MappedRows<'_, impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>>) -> AppResult<Vec<T>> {
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn optional_row<T>(result: rusqlite::Result<T>) -> AppResult<Option<T>> {
    match result {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}
