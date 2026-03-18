use crate::context::CoreContext;
use crate::core::models::source::SourceKind;
use crate::dto::ImportSummaryDto;
use crate::error::{AppError, AppResult};

pub async fn import_m3u(
    ctx: &CoreContext,
    name: &str,
    location: &str,
    auto_refresh_minutes: Option<u32>,
) -> AppResult<ImportSummaryDto> {
    let content = fetch_content(&ctx.http, location).await?;
    let channels = tokio::task::spawn_blocking(move || {
        crate::core::parsers::m3u::parse_m3u(&content)
    })
    .await
    .map_err(|e| AppError::Internal(format!("parse task failed: {e}")))??;

    let name = name.to_string();
    let location = location.to_string();
    ctx.db
        .run(move |conn| {
            let source_id = crate::platform::db::repositories::source_repo::upsert_source(
                conn,
                SourceKind::M3u,
                &name,
                &location,
                None,
                None,
                auto_refresh_minutes,
            )?;
            crate::platform::db::repositories::channel_repo::upsert_channels(
                conn, source_id, &channels,
            )
        })
        .await
}

pub async fn import_xtream(
    ctx: &CoreContext,
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
    let content = fetch_content(&ctx.http, &url).await?;
    let server_url_owned = server_url.to_string();
    let username_owned = username.to_string();
    let password_owned = password.to_string();
    let channels = tokio::task::spawn_blocking(move || {
        crate::core::parsers::xtream::parse_xtream_live_streams(
            &content,
            &server_url_owned,
            &username_owned,
            &password_owned,
        )
    })
    .await
    .map_err(|e| AppError::Internal(format!("parse task failed: {e}")))??;

    let name = name.to_string();
    let server_url = server_url.to_string();
    let username = username.to_string();
    let password = password.to_string();
    ctx.db
        .run(move |conn| {
            let source_id = crate::platform::db::repositories::source_repo::upsert_source(
                conn,
                SourceKind::Xtream,
                &name,
                &server_url,
                Some(&username),
                Some(&password),
                None,
            )?;
            crate::platform::db::repositories::channel_repo::upsert_channels(
                conn, source_id, &channels,
            )
        })
        .await
}

pub async fn import_xmltv(
    ctx: &CoreContext,
    name: &str,
    location: &str,
) -> AppResult<ImportSummaryDto> {
    let content = fetch_content(&ctx.http, location).await?;
    let content2 = content.clone();
    let programs = tokio::task::spawn_blocking(move || {
        crate::core::parsers::xmltv::parse_xmltv(&content)
    })
    .await
    .map_err(|e| AppError::Internal(format!("parse task failed: {e}")))??;

    let aliases = tokio::task::spawn_blocking(move || {
        crate::core::parsers::xmltv::parse_xmltv_channel_aliases(&content2)
    })
    .await
    .map_err(|e| AppError::Internal(format!("parse task failed: {e}")))??;

    let name = name.to_string();
    let location = location.to_string();
    ctx.db
        .run(move |conn| {
            let source_id = crate::platform::db::repositories::source_repo::upsert_source(
                conn,
                SourceKind::Xmltv,
                &name,
                &location,
                None,
                None,
                None,
            )?;

            let programs_imported =
                crate::platform::db::repositories::epg_repo::replace_programs(
                    conn, source_id, &programs,
                )?;
            let _ = crate::platform::db::repositories::epg_repo::replace_channel_aliases(
                conn, source_id, &aliases,
            )?;

            Ok(ImportSummaryDto {
                source_id,
                channels_imported: programs_imported,
                channels_updated: 0,
                channels_removed: 0,
            })
        })
        .await
}

pub async fn refresh_source(ctx: &CoreContext, source_id: i64) -> AppResult<ImportSummaryDto> {
    let source = ctx
        .db
        .run(move |conn| {
            let source =
                crate::platform::db::repositories::source_repo::get_by_id(conn, source_id)?
                    .ok_or_else(|| {
                        AppError::NotFound(format!("Source {} not found", source_id))
                    })?;
            Ok(source)
        })
        .await?;

    if !source.enabled {
        return Err(AppError::Validation(format!(
            "Source {} is disabled",
            source_id
        )));
    }

    if let Some(next_retry_at) = source.next_retry_at.as_deref() {
        let retry_due = parse_sqlite_datetime(next_retry_at)
            .map(|ts| ts <= chrono::Utc::now())
            .unwrap_or(true);
        if !retry_due {
            return Err(AppError::Validation(format!(
                "Source {} is in refresh backoff until {}",
                source_id, next_retry_at
            )));
        }
    }

    let result = match source.kind {
        SourceKind::M3u => {
            import_m3u(ctx, &source.name, &source.location, source.auto_refresh_minutes).await
        }
        SourceKind::Xtream => {
            let username = source.username.unwrap_or_default();
            let password = source.password.unwrap_or_default();
            import_xtream(ctx, &source.name, &source.location, &username, &password).await
        }
        SourceKind::Xmltv => import_xmltv(ctx, &source.name, &source.location).await,
    };

    match result {
        Ok(summary) => {
            ctx.db
                .run(move |conn| {
                    crate::platform::db::repositories::source_repo::clear_refresh_failure_state(
                        conn, source_id,
                    )
                })
                .await?;
            Ok(summary)
        }
        Err(error) => {
            let error_msg = error.to_string();
            ctx.db
                .run(move |conn| {
                    crate::platform::db::repositories::source_repo::record_refresh_failure(
                        conn,
                        source_id,
                        &error_msg,
                    )
                })
                .await?;
            Err(error)
        }
    }
}

async fn fetch_content(client: &reqwest::Client, location: &str) -> AppResult<String> {
    if location.starts_with("http://") || location.starts_with("https://") {
        crate::platform::http::client::fetch_text(client, location).await
    } else {
        tokio::fs::read_to_string(location)
            .await
            .map_err(|e| e.into())
    }
}

fn parse_sqlite_datetime(value: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(value) {
        return Some(dt.with_timezone(&chrono::Utc));
    }
    let normalized = if value.contains('T') {
        value.to_string()
    } else {
        format!("{}Z", value.replace(' ', "T"))
    };
    chrono::DateTime::parse_from_rfc3339(&normalized)
        .ok()
        .map(|dt| dt.with_timezone(&chrono::Utc))
}
