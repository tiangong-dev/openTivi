use crate::context::CoreContext;
use crate::dto::ReminderDto;
use crate::error::AppResult;
use crate::platform::db::repositories::reminders_repo;

pub async fn add_reminder(
    ctx: &CoreContext,
    channel_id: i64,
    program_start_epoch: i64,
    program_stop_epoch: Option<i64>,
    program_title: String,
    program_desc: Option<String>,
) -> AppResult<i64> {
    ctx.db
        .run(move |conn| {
            reminders_repo::add_reminder(
                conn,
                channel_id,
                program_start_epoch,
                program_stop_epoch,
                &program_title,
                program_desc.as_deref(),
            )
        })
        .await
}

pub async fn remove_reminder(ctx: &CoreContext, id: i64) -> AppResult<()> {
    ctx.db
        .run(move |conn| reminders_repo::remove_reminder(conn, id))
        .await
}

pub async fn list_reminders(ctx: &CoreContext) -> AppResult<Vec<ReminderDto>> {
    ctx.db
        .run(|conn| reminders_repo::list_reminders(conn))
        .await
}

pub async fn due_reminders(
    ctx: &CoreContext,
    now_epoch: i64,
    window_secs: i64,
) -> AppResult<Vec<ReminderDto>> {
    ctx.db
        .run(move |conn| reminders_repo::due_reminders(conn, now_epoch, window_secs))
        .await
}

pub async fn mark_reminder_fired(ctx: &CoreContext, id: i64) -> AppResult<()> {
    ctx.db
        .run(move |conn| reminders_repo::mark_reminder_fired(conn, id))
        .await
}
