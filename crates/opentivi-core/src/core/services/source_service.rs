use crate::context::CoreContext;
use crate::core::models::source::SourceKind;
use crate::dto::SourceDto;
use crate::error::{AppError, AppResult};

pub async fn list_sources(ctx: &CoreContext) -> AppResult<Vec<SourceDto>> {
    ctx.db
        .run(|conn| crate::platform::db::repositories::source_repo::list_all(conn))
        .await
}

pub async fn delete_source(ctx: &CoreContext, source_id: i64) -> AppResult<()> {
    ctx.db
        .run(move |conn| crate::platform::db::repositories::source_repo::delete(conn, source_id))
        .await
}

pub async fn update_source(
    ctx: &CoreContext,
    source_id: i64,
    name: String,
    location: String,
    username: Option<String>,
    password: Option<String>,
    auto_refresh_minutes: Option<u32>,
    enabled: bool,
) -> AppResult<()> {
    ctx.db
        .run(move |conn| {
            let source =
                crate::platform::db::repositories::source_repo::get_by_id(conn, source_id)?
                    .ok_or_else(|| {
                        AppError::NotFound(format!("Source {} not found", source_id))
                    })?;

            let normalized_refresh = match source.kind {
                SourceKind::M3u => auto_refresh_minutes,
                _ => None,
            };

            crate::platform::db::repositories::source_repo::update_source(
                conn,
                source_id,
                &name,
                &location,
                username.as_deref(),
                password.as_deref(),
                normalized_refresh,
                enabled,
            )
        })
        .await
}
