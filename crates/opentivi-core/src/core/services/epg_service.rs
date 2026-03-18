use chrono::{DateTime, Duration, Local, LocalResult, NaiveDateTime, TimeZone, Utc};

use crate::context::CoreContext;
use crate::dto::{
    ChannelEpgSnapshotDto, EpgProgramDto, EpgProgramMiniDto, EpgProgramSearchResultDto,
};
use crate::error::AppResult;

pub async fn get_channel_epg(
    ctx: &CoreContext,
    channel_id: i64,
    from: Option<String>,
    to: Option<String>,
) -> AppResult<Vec<EpgProgramDto>> {
    ctx.db
        .run(move |conn| {
            crate::platform::db::repositories::epg_repo::get_channel_epg(
                conn,
                channel_id,
                from.as_deref(),
                to.as_deref(),
            )
        })
        .await
}

pub async fn get_channels_epg_snapshots(
    ctx: &CoreContext,
    channel_ids: Vec<i64>,
    window_start_ts: Option<i64>,
    window_end_ts: Option<i64>,
) -> AppResult<Vec<ChannelEpgSnapshotDto>> {
    ctx.db
        .run(move |conn| {
            let now = Utc::now();
            let default_window_start = now - Duration::minutes(30);
            let window_start = window_start_ts
                .and_then(DateTime::<Utc>::from_timestamp_millis)
                .unwrap_or(default_window_start);
            let window_end = window_end_ts
                .and_then(DateTime::<Utc>::from_timestamp_millis)
                .filter(|ts| *ts > window_start)
                .unwrap_or(window_start + Duration::hours(2));
            let mut snapshots = Vec::with_capacity(channel_ids.len());

            for channel_id in &channel_ids {
                let programs = crate::platform::db::repositories::epg_repo::get_channel_epg(
                    conn,
                    *channel_id,
                    None,
                    None,
                )?;
                let mut now_program: Option<EpgProgramMiniDto> = None;
                let mut next_program: Option<EpgProgramMiniDto> = None;
                let mut next_start_ts: Option<DateTime<Utc>> = None;
                let mut timeline_programs: Vec<EpgProgramMiniDto> = Vec::new();

                for program in programs {
                    let start = parse_program_time(&program.start_at);
                    let end = parse_program_time(&program.end_at);
                    let mini = to_mini_program(&program);
                    if let (Some(start_ts), Some(end_ts)) = (start, end) {
                        if start_ts <= now && now < end_ts {
                            now_program = Some(mini.clone());
                        }
                        if start_ts > now {
                            let should_replace = match next_start_ts {
                                Some(existing) => start_ts < existing,
                                None => true,
                            };
                            if should_replace {
                                next_start_ts = Some(start_ts);
                                next_program = Some(mini.clone());
                            }
                        }
                        if end_ts > window_start && start_ts < window_end {
                            timeline_programs.push(mini);
                        }
                    }
                }

                snapshots.push(ChannelEpgSnapshotDto {
                    channel_id: *channel_id,
                    now: now_program,
                    next: next_program,
                    timeline_programs,
                });
            }

            Ok(snapshots)
        })
        .await
}

pub async fn search_programs(
    ctx: &CoreContext,
    search: Option<String>,
    state: Option<String>,
    limit: u32,
) -> AppResult<Vec<EpgProgramSearchResultDto>> {
    ctx.db
        .run(move |conn| {
            let now = Utc::now();
            let results = crate::platform::db::repositories::epg_repo::search_programs(
                conn,
                search.as_deref(),
                limit,
            )?;

            Ok(results
                .into_iter()
                .filter(|program| match state.as_deref().unwrap_or("all") {
                    "live" => {
                        let start = parse_program_time(&program.start_at);
                        let end = parse_program_time(&program.end_at);
                        matches!((start, end), (Some(start), Some(end)) if start <= now && now < end)
                    }
                    "upcoming" => {
                        parse_program_time(&program.start_at).is_some_and(|start| start > now)
                    }
                    _ => true,
                })
                .collect())
        })
        .await
}

fn to_mini_program(program: &EpgProgramDto) -> EpgProgramMiniDto {
    EpgProgramMiniDto {
        title: program.title.clone(),
        start_at: program.start_at.clone(),
        end_at: program.end_at.clone(),
    }
}

fn parse_program_time(raw: &str) -> Option<DateTime<Utc>> {
    for fmt in ["%Y%m%d%H%M%S %z", "%Y%m%d%H%M%S%z"] {
        if let Ok(dt) = DateTime::parse_from_str(raw.trim(), fmt) {
            return Some(dt.with_timezone(&Utc));
        }
    }
    if let Ok(dt) = DateTime::parse_from_rfc3339(raw.trim()) {
        return Some(dt.with_timezone(&Utc));
    }
    if let Ok(ndt) = NaiveDateTime::parse_from_str(raw.trim(), "%Y-%m-%d %H:%M:%S") {
        return local_naive_to_utc(ndt);
    }
    if let Ok(ndt) = NaiveDateTime::parse_from_str(raw.trim(), "%Y%m%d%H%M%S") {
        return local_naive_to_utc(ndt);
    }
    None
}

fn local_naive_to_utc(ndt: NaiveDateTime) -> Option<DateTime<Utc>> {
    match Local.from_local_datetime(&ndt) {
        LocalResult::Single(dt) => Some(dt.with_timezone(&Utc)),
        LocalResult::Ambiguous(dt, _) => Some(dt.with_timezone(&Utc)),
        LocalResult::None => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_xmltv_timestamp_without_timezone_as_local_time() {
        let actual = parse_program_time("20260312083000").unwrap();
        let expected = Local
            .with_ymd_and_hms(2026, 3, 12, 8, 30, 0)
            .single()
            .unwrap()
            .with_timezone(&Utc);
        assert_eq!(actual, expected);
    }

    #[test]
    fn parses_xmltv_timestamp_with_timezone_offset() {
        let actual = parse_program_time("20260312083000 +0800").unwrap();
        let expected = DateTime::parse_from_rfc3339("2026-03-12T08:30:00+08:00")
            .unwrap()
            .with_timezone(&Utc);
        assert_eq!(actual, expected);
    }
}
