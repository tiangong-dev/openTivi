// reminders-core repo层失败测试（TDD red）。
//
// 本文件**只含** test mod，不含任何实现。它引用尚不存在的:
//   - `super::*` 里的 `add_reminder` / `remove_reminder` / `list_reminders` /
//     `due_reminders` / `mark_reminder_fired`（实现者在本文件加 repo 函数）
//   - `crate::dto::ReminderDto`（实现者在 dto.rs 加）
//   - 迁移 0016（实现者注册 epg_reminders 表）
// 因此当前**编译红**（cannot find function / cannot find type）。

use rusqlite::Connection;

use crate::dto::ReminderDto;
use crate::error::AppResult;

/// 读路径公共投影 + JOIN（list / due 共用）。墓碑频道与禁用源被过滤。
const SELECT_REMINDER_BASE: &str = "SELECT r.id, r.channel_id, c.name AS channel_name, \
     c.channel_number, r.program_start_epoch, r.program_stop_epoch, r.program_title, \
     r.program_desc, r.fired_at, r.created_at \
     FROM epg_reminders r \
     INNER JOIN channels c ON c.id = r.channel_id \
     INNER JOIN sources s ON s.id = c.source_id \
     WHERE s.enabled = 1 AND c.deleted_time IS NULL";

fn map_reminder(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReminderDto> {
    Ok(ReminderDto {
        id: row.get("id")?,
        channel_id: row.get("channel_id")?,
        channel_name: row.get("channel_name")?,
        channel_number: row.get("channel_number")?,
        program_start_epoch: row.get("program_start_epoch")?,
        program_stop_epoch: row.get("program_stop_epoch")?,
        program_title: row.get("program_title")?,
        program_desc: row.get("program_desc")?,
        fired_at: row.get("fired_at")?,
        created_at: row.get("created_at")?,
    })
}

pub fn add_reminder(
    conn: &Connection,
    channel_id: i64,
    program_start_epoch: i64,
    program_stop_epoch: Option<i64>,
    program_title: &str,
    program_desc: Option<&str>,
) -> AppResult<i64> {
    conn.execute(
        "INSERT OR IGNORE INTO epg_reminders \
         (channel_id, program_start_epoch, program_stop_epoch, program_title, program_desc, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
        rusqlite::params![
            channel_id,
            program_start_epoch,
            program_stop_epoch,
            program_title,
            program_desc
        ],
    )?;
    // OR IGNORE 命中既有行时 last_insert_rowid() 不可靠，回读确定 id。
    let id: i64 = conn.query_row(
        "SELECT id FROM epg_reminders WHERE channel_id = ?1 AND program_start_epoch = ?2",
        rusqlite::params![channel_id, program_start_epoch],
        |row| row.get(0),
    )?;
    Ok(id)
}

pub fn remove_reminder(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM epg_reminders WHERE id = ?1", [id])?;
    Ok(())
}

pub fn list_reminders(conn: &Connection) -> AppResult<Vec<ReminderDto>> {
    let sql = format!("{SELECT_REMINDER_BASE} ORDER BY r.program_start_epoch");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_reminder)?;
    crate::platform::db::collect_rows(rows)
}

pub fn due_reminders(
    conn: &Connection,
    now_epoch: i64,
    window_secs: i64,
) -> AppResult<Vec<ReminderDto>> {
    // 左闭右开: now <= start < now + window，且未触发。
    let sql = format!(
        "{SELECT_REMINDER_BASE} AND r.fired_at IS NULL \
         AND r.program_start_epoch >= ?1 AND r.program_start_epoch < ?2 \
         ORDER BY r.program_start_epoch"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        rusqlite::params![now_epoch, now_epoch + window_secs],
        map_reminder,
    )?;
    crate::platform::db::collect_rows(rows)
}

pub fn mark_reminder_fired(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute(
        "UPDATE epg_reminders SET fired_at = datetime('now') WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::models::channel::ParsedChannel;
    use crate::core::models::source::SourceKind;
    use crate::dto::ReminderDto;
    use crate::platform::db::migrations;
    use crate::platform::db::repositories::{channel_repo, source_repo};
    use rusqlite::Connection;

    // ── seed helpers ────────────────────────────────────────────────────────

    fn fresh_db() -> Connection {
        let conn = Connection::open_in_memory().expect("db should open");
        // 裸内存库默认开 FK；run_migrations 建全部表（含将由 0016 引入的 epg_reminders）。
        migrations::run_migrations(&conn).expect("migrations should run");
        conn
    }

    fn seed_source(conn: &Connection, name: &str, location: &str) -> i64 {
        source_repo::upsert_source(conn, SourceKind::M3u, name, location, None, None, None)
            .expect("source should be created")
    }

    /// 自己用全字段构造 ParsedChannel（含 catchup_*/user_agent/referer 默认值）。
    /// `tvg_id` 给非空值以便关联。
    fn sample_channel(channel_key: &str, name: &str, number: Option<&str>) -> ParsedChannel {
        ParsedChannel {
            channel_key: channel_key.to_string(),
            external_id: None,
            name: name.to_string(),
            channel_number: number.map(|s| s.to_string()),
            group_name: None,
            tvg_id: Some(channel_key.to_string()),
            tvg_name: None,
            logo_url: None,
            stream_url: format!("http://example.com/{channel_key}"),
            container_extension: None,
            is_live: true,
            catchup_type: None,
            catchup_source: None,
            catchup_days: None,
            catchup_hours: None,
            user_agent: None,
            referer: None,
        }
    }

    /// 用 channel_repo::upsert_channels 建频道并取回它的 channels.id。
    fn seed_channel(
        conn: &Connection,
        source_id: i64,
        channel_key: &str,
        name: &str,
        number: Option<&str>,
    ) -> i64 {
        let ch = sample_channel(channel_key, name, number);
        channel_repo::upsert_channels(conn, source_id, std::slice::from_ref(&ch))
            .expect("upsert_channels should succeed");
        conn.query_row(
            "SELECT id FROM channels WHERE source_id = ?1 AND channel_key = ?2",
            rusqlite::params![source_id, channel_key],
            |row| row.get(0),
        )
        .expect("channel id should be retrievable")
    }

    /// 墓碑化：用不含该 channel_key 的列表再 upsert_channels 同 source，
    /// 使该频道 deleted_time 被置（行仍在库）。
    fn tombstone_channel(conn: &Connection, source_id: i64) {
        channel_repo::upsert_channels(conn, source_id, &[])
            .expect("empty upsert should tombstone source channels");
    }

    fn disable_source(conn: &Connection, source_id: i64) {
        conn.execute("UPDATE sources SET enabled = 0 WHERE id = ?1", [source_id])
            .expect("disable source");
    }

    // ── 测试 1: 迁移 0016 注册 + 表存在 + 幂等 ───────────────────────────────
    //
    // 断言: run_migrations 后 _migrations 里 version=16 恰好 1 行（按精确 version，
    //       不用全局 MAX，避免后续迁移加入时回归）；epg_reminders 表存在；
    //       二次 run_migrations 仍 Ok（幂等）。
    // 抓 bug: 0016 未注册（version=16 不存在）；表名/迁移写错；非幂等 ALTER 在二次
    //         run_migrations 上炸。
    #[test]
    fn migration_0016_registers_reminders_table_and_is_idempotent() {
        let conn = fresh_db();

        let v16_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM _migrations WHERE version = 16",
                [],
                |row| row.get(0),
            )
            .expect("query _migrations");
        assert_eq!(v16_count, 1, "迁移 0016 必须恰好注册并应用一次");

        let table_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'epg_reminders'",
                [],
                |row| row.get(0),
            )
            .expect("query sqlite_master");
        assert_eq!(table_exists, 1, "epg_reminders 表必须存在");

        // 二次 run_migrations 必须幂等。
        migrations::run_migrations(&conn).expect("second run_migrations should be idempotent");
    }

    // ── 测试 2: 加 + 列出 ──────────────────────────────────────────────────
    //
    // 断言: add_reminder 返回正 id；list_reminders 含该条且字段正确——尤其
    //       channel_name/channel_number 来自 JOIN channels，program_* 原样回读。
    // 抓 bug: JOIN 写错导致 channel_name 缺失/错；DTO 字段映射错位；可空字段处理错。
    #[test]
    fn add_then_list_returns_row_with_joined_channel_fields() {
        let conn = fresh_db();
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");
        let ch = seed_channel(&conn, src, "ch1", "Channel One", Some("101"));

        let id = add_reminder(
            &conn,
            ch,
            1_000,
            Some(2_000),
            "Evening News",
            Some("daily recap"),
        )
        .expect("add_reminder should succeed");
        assert!(id > 0, "add_reminder 必须返回有效行 id");

        let list = list_reminders(&conn).expect("list_reminders should succeed");
        assert_eq!(list.len(), 1, "应恰好列出 1 条提醒");
        let r: &ReminderDto = &list[0];
        assert_eq!(r.id, id);
        assert_eq!(r.channel_id, ch);
        assert_eq!(r.channel_name, "Channel One", "channel_name 须来自 JOIN channels");
        assert_eq!(r.channel_number.as_deref(), Some("101"));
        assert_eq!(r.program_start_epoch, 1_000);
        assert_eq!(r.program_stop_epoch, Some(2_000));
        assert_eq!(r.program_title, "Evening News");
        assert_eq!(r.program_desc.as_deref(), Some("daily recap"));
        assert!(r.fired_at.is_none(), "新建提醒 fired_at 必须为空");
        assert!(!r.created_at.is_empty(), "created_at 必须被填充");
    }

    // ── 测试 3: 去重（INSERT OR IGNORE on UNIQUE(channel_id, start)）─────────
    //
    // 断言: 同 (channel_id, program_start_epoch) 加两次 → 库内仅 1 行，且第二次返回
    //       与第一次相同的 id（命中既有返回既有 id，而非 last_insert_rowid 的 0/脏值）。
    // 抓 bug: 缺 UNIQUE 约束导致重复行；OR IGNORE 命中后误返回 0/错误 id。
    #[test]
    fn duplicate_same_channel_and_start_is_deduped_and_returns_existing_id() {
        let conn = fresh_db();
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");
        let ch = seed_channel(&conn, src, "ch1", "Channel One", None);

        let id1 = add_reminder(&conn, ch, 5_000, None, "Movie", None).expect("first add");
        let id2 = add_reminder(&conn, ch, 5_000, Some(9_999), "Movie Renamed", Some("x"))
            .expect("second add (duplicate key)");

        assert_eq!(id2, id1, "重复 (channel_id, start) 第二次须返回既有 id");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM epg_reminders", [], |row| row.get(0))
            .expect("count epg_reminders");
        assert_eq!(count, 1, "去重后库内必须仅 1 行");

        let list = list_reminders(&conn).expect("list_reminders");
        assert_eq!(list.len(), 1);
    }

    // ── 测试 4: 删除 ───────────────────────────────────────────────────────
    //
    // 断言: remove_reminder 后 list_reminders 为空。
    // 抓 bug: 删除 SQL 没绑对 id / 删错行。
    #[test]
    fn remove_reminder_empties_the_list() {
        let conn = fresh_db();
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");
        let ch = seed_channel(&conn, src, "ch1", "Channel One", None);

        let id = add_reminder(&conn, ch, 1_000, None, "Show", None).expect("add");
        assert_eq!(list_reminders(&conn).expect("list").len(), 1);

        remove_reminder(&conn, id).expect("remove_reminder should succeed");
        assert!(
            list_reminders(&conn).expect("list").is_empty(),
            "删除后 list_reminders 必须为空"
        );
    }

    // ── 测试 5: due 窗口 + mark_fired ──────────────────────────────────────
    //
    // 语义: due = fired_at IS NULL AND now <= start_epoch < now+window。
    // 断言: start 落在 [now, now+window) → 返回；start < now → 不返回；
    //       start == now+window（窗口右开）→ 不返回；mark_reminder_fired 后 →
    //       due 不返回（fired_at 非空）。
    // 抓 bug: 边界用 <=/< 写反（把右端点算进去，或漏掉左端点 now）；过期(早于 now)
    //         仍返回；fired 后仍被当作 due。
    #[test]
    fn due_reminders_respects_window_bounds_and_fired_flag() {
        let conn = fresh_db();
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");
        let ch = seed_channel(&conn, src, "ch1", "Channel One", None);

        let now = 10_000_i64;
        let window = 600_i64; // 窗口 [10_000, 10_600)

        let past = add_reminder(&conn, ch, now - 1, None, "Past", None).expect("add past");
        let at_now = add_reminder(&conn, ch, now, None, "AtNow", None).expect("add at_now");
        let inside = add_reminder(&conn, ch, now + 300, None, "Inside", None).expect("add inside");
        let at_edge =
            add_reminder(&conn, ch, now + window, None, "AtEdge", None).expect("add at_edge");

        let due = due_reminders(&conn, now, window).expect("due_reminders");
        let due_ids: Vec<i64> = due.iter().map(|r| r.id).collect();

        assert!(due_ids.contains(&at_now), "start == now 必须在窗口内（左闭）");
        assert!(due_ids.contains(&inside), "start 在窗口内必须返回");
        assert!(!due_ids.contains(&past), "早于 now 的过期提醒不得返回");
        assert!(
            !due_ids.contains(&at_edge),
            "start == now+window 必须排除（右开）"
        );

        // mark_fired 后该条不再 due。
        mark_reminder_fired(&conn, inside).expect("mark_reminder_fired");
        let due_after = due_reminders(&conn, now, window).expect("due_reminders after fire");
        assert!(
            !due_after.iter().any(|r| r.id == inside),
            "fired_at 非空后必须不再返回为 due"
        );
        // 但仍在 list_reminders（仅被标记，未删除）。
        assert!(
            list_reminders(&conn).expect("list").iter().any(|r| r.id == inside),
            "mark_fired 不应删除提醒，仅置 fired_at"
        );
    }

    // ── 测试 6: 墓碑 / 级联过滤（核心）──────────────────────────────────────
    //
    // 断言:
    //  (a) 频道墓碑化(deleted_time 非空)后，list_reminders/due_reminders 都不返回该
    //      提醒——靠 read path 的 `c.deleted_time IS NULL` 隐藏，但行仍在 epg_reminders。
    //  (b) source_repo::delete 删 source 触发 FK CASCADE（channels→epg_reminders
    //      ON DELETE CASCADE）→ 提醒行被真删。
    // 抓 bug: 读路径漏 `deleted_time IS NULL`（墓碑频道的提醒泄漏）；
    //         FK/CASCADE 没建对（删 source 后提醒成孤儿残留）。
    #[test]
    fn tombstoned_channel_hides_reminders_and_source_delete_cascades() {
        let conn = fresh_db();
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");
        let ch = seed_channel(&conn, src, "ch1", "Channel One", None);

        let now = 10_000_i64;
        add_reminder(&conn, ch, now + 100, None, "Soon", None).expect("add reminder");

        // 健全性: 墓碑前能查到（list 与 due 都返回）。
        assert_eq!(list_reminders(&conn).expect("list").len(), 1);
        assert_eq!(
            due_reminders(&conn, now, 600).expect("due").len(),
            1,
            "墓碑前该提醒应为 due"
        );

        // 墓碑化频道（行仍在 epg_reminders）。
        tombstone_channel(&conn, src);

        // 健全性: epg_reminders 行还在。
        let raw_rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM epg_reminders", [], |row| row.get(0))
            .expect("count rows");
        assert_eq!(raw_rows, 1, "墓碑化只隐藏，不应删除 epg_reminders 行");

        // 读路径必须隐藏墓碑频道的提醒。
        assert!(
            list_reminders(&conn).expect("list").is_empty(),
            "list_reminders 必须靠 c.deleted_time IS NULL 隐藏墓碑频道的提醒"
        );
        assert!(
            due_reminders(&conn, now, 600).expect("due").is_empty(),
            "due_reminders 必须排除墓碑频道的提醒"
        );

        // 删 source → CASCADE 真删提醒行。
        source_repo::delete(&conn, src).expect("delete source");
        let rows_after: i64 = conn
            .query_row("SELECT COUNT(*) FROM epg_reminders", [], |row| row.get(0))
            .expect("count rows after source delete");
        assert_eq!(
            rows_after, 0,
            "删 source 须经 channels→epg_reminders ON DELETE CASCADE 真删提醒行"
        );
    }

    // ── 测试 7: disabled source 过滤 ──────────────────────────────────────
    //
    // 断言: source enabled=0 时，其频道的提醒既不在 list_reminders 也不在
    //       due_reminders 返回。
    // 抓 bug: 读路径漏 `s.enabled = 1`（禁用源的提醒泄漏）。
    #[test]
    fn disabled_source_reminders_are_excluded() {
        let conn = fresh_db();
        let src = seed_source(&conn, "A", "http://example.com/a.m3u");
        let ch = seed_channel(&conn, src, "ch1", "Channel One", None);

        let now = 10_000_i64;
        add_reminder(&conn, ch, now + 100, None, "Soon", None).expect("add reminder");
        assert_eq!(list_reminders(&conn).expect("list").len(), 1);

        disable_source(&conn, src);

        assert!(
            list_reminders(&conn).expect("list").is_empty(),
            "禁用源(enabled=0)的提醒必须从 list_reminders 排除"
        );
        assert!(
            due_reminders(&conn, now, 600).expect("due").is_empty(),
            "禁用源(enabled=0)的提醒必须从 due_reminders 排除"
        );
    }
}
