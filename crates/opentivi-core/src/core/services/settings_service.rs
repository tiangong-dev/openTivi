use crate::context::CoreContext;
use crate::dto::SettingDto;
use crate::error::AppResult;

pub async fn get_settings(ctx: &CoreContext) -> AppResult<Vec<SettingDto>> {
    ctx.db
        .run(|conn| crate::platform::db::repositories::settings_repo::list_all(conn))
        .await
}

pub async fn set_setting(
    ctx: &CoreContext,
    key: String,
    value: serde_json::Value,
) -> AppResult<SettingDto> {
    ctx.db
        .run(move |conn| crate::platform::db::repositories::settings_repo::upsert(conn, &key, &value))
        .await
}
