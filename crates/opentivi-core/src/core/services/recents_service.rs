use crate::context::CoreContext;
use crate::dto::RecentChannelDto;
use crate::error::AppResult;

pub async fn list_recents(ctx: &CoreContext, limit: u32) -> AppResult<Vec<RecentChannelDto>> {
    ctx.db
        .run(move |conn| crate::platform::db::repositories::recents_repo::list_recents(conn, limit))
        .await
}

pub async fn mark_recent_watched(ctx: &CoreContext, channel_id: i64) -> AppResult<()> {
    ctx.db
        .run(move |conn| crate::platform::db::repositories::recents_repo::mark_watched(conn, channel_id))
        .await
}
