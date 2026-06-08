use crate::context::CoreContext;
use crate::dto::ChannelListItemDto;
use crate::error::AppResult;

pub async fn list_favorites(ctx: &CoreContext) -> AppResult<Vec<ChannelListItemDto>> {
    ctx.db
        .run(|conn| crate::platform::db::repositories::favorites_repo::list_favorites(conn))
        .await
}

pub async fn set_favorite(ctx: &CoreContext, channel_id: i64, favorite: bool) -> AppResult<()> {
    ctx.db
        .run(move |conn| {
            if favorite {
                crate::platform::db::repositories::favorites_repo::add_favorite(conn, channel_id)
            } else {
                crate::platform::db::repositories::favorites_repo::remove_favorite(conn, channel_id)
            }
        })
        .await
}
