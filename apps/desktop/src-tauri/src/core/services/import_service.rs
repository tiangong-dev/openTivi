use rusqlite::Connection;

use crate::commands::dto::ImportSummaryDto;
use crate::core::models::source::SourceKind;
use crate::error::{AppError, AppResult};

pub fn import_m3u(
    conn: &Connection,
    name: &str,
    location: &str,
    auto_refresh_minutes: Option<u32>,
) -> AppResult<ImportSummaryDto> {
    let content = fetch_content(location)?;
    let channels = crate::core::parsers::m3u::parse_m3u(&content)?;

    let source_id = crate::platform::db::repositories::source_repo::upsert_source(
        conn,
        SourceKind::M3u,
        name,
        location,
        None,
        None,
        auto_refresh_minutes,
    )?;

    let summary = crate::platform::db::repositories::channel_repo::upsert_channels(
        conn, source_id, &channels,
    )?;

    Ok(summary)
}

pub fn import_xtream(
    conn: &Connection,
    name: &str,
    server_url: &str,
    username: &str,
    password: &str,
) -> AppResult<ImportSummaryDto> {
    let url = format!(
        "{}/player_api.php?username={}&password={}&action=get_live_streams",
        server_url.trim_end_matches('/'),
        username,
        password,
    );
    let content = fetch_content(&url)?;
    let channels = crate::core::parsers::xtream::parse_xtream_live_streams(
        &content, server_url, username, password,
    )?;

    let source_id = crate::platform::db::repositories::source_repo::upsert_source(
        conn,
        SourceKind::Xtream,
        name,
        server_url,
        Some(username),
        Some(password),
        None,
    )?;

    let summary = crate::platform::db::repositories::channel_repo::upsert_channels(
        conn, source_id, &channels,
    )?;

    Ok(summary)
}

pub fn import_xmltv(conn: &Connection, name: &str, location: &str) -> AppResult<ImportSummaryDto> {
    let content = fetch_content(location)?;
    let programs = crate::core::parsers::xmltv::parse_xmltv(&content)?;
    let aliases = crate::core::parsers::xmltv::parse_xmltv_channel_aliases(&content)?;

    let source_id = crate::platform::db::repositories::source_repo::upsert_source(
        conn,
        SourceKind::Xmltv,
        name,
        location,
        None,
        None,
        None,
    )?;

    let programs_imported =
        crate::platform::db::repositories::epg_repo::replace_programs(conn, source_id, &programs)?;
    let _ = crate::platform::db::repositories::epg_repo::replace_channel_aliases(
        conn, source_id, &aliases,
    )?;

    Ok(ImportSummaryDto {
        source_id,
        channels_imported: programs_imported,
        channels_updated: 0,
        channels_removed: 0,
    })
}

pub fn refresh_source(conn: &Connection, source_id: i64) -> AppResult<ImportSummaryDto> {
    let source = crate::platform::db::repositories::source_repo::get_by_id(conn, source_id)?
        .ok_or_else(|| AppError::NotFound(format!("Source {} not found", source_id)))?;

    if !source.enabled {
        return Err(AppError::Validation(format!(
            "Source {} is disabled",
            source_id
        )));
    }

    match source.kind {
        SourceKind::M3u => import_m3u(
            conn,
            &source.name,
            &source.location,
            source.auto_refresh_minutes,
        ),
        SourceKind::Xtream => {
            let username = source.username.unwrap_or_default();
            let password = source.password.unwrap_or_default();
            import_xtream(conn, &source.name, &source.location, &username, &password)
        }
        SourceKind::Xmltv => import_xmltv(conn, &source.name, &source.location),
    }
}

fn fetch_content(location: &str) -> AppResult<String> {
    if location.starts_with("http://") || location.starts_with("https://") {
        crate::platform::http::client::fetch_text(location)
    } else {
        Ok(std::fs::read_to_string(location)?)
    }
}
