use crate::context::CoreContext;
use crate::dto::ChannelListItemDto;
use crate::error::AppResult;

pub async fn list_channels(
    ctx: &CoreContext,
    source_id: Option<i64>,
    group_name: Option<String>,
    search: Option<String>,
    favorites_only: bool,
    limit: u32,
    offset: u32,
) -> AppResult<Vec<ChannelListItemDto>> {
    ctx.db
        .run(move |conn| {
            crate::platform::db::repositories::channel_repo::list_channels(
                conn,
                source_id,
                group_name.as_deref(),
                search.as_deref(),
                favorites_only,
                limit,
                offset,
            )
        })
        .await
}

pub async fn list_groups(ctx: &CoreContext, source_id: Option<i64>) -> AppResult<Vec<String>> {
    ctx.db
        .run(move |conn| crate::platform::db::repositories::channel_repo::list_groups(conn, source_id))
        .await
}
