use rusqlite::Connection;

use chrono::{DateTime, Duration, NaiveDateTime, Utc};

use crate::commands::dto::{ChannelEpgSnapshotDto, EpgProgramDto, EpgProgramMiniDto};
use crate::error::AppResult;

pub fn get_channel_epg(
    conn: &Connection,
    channel_id: i64,
    from: Option<&str>,
    to: Option<&str>,
) -> AppResult<Vec<EpgProgramDto>> {
    crate::platform::db::repositories::epg_repo::get_channel_epg(conn, channel_id, from, to)
}

pub fn get_channels_epg_snapshots(
    conn: &Connection,
    channel_ids: &[i64],
    window_start_ts: Option<i64>,
    window_end_ts: Option<i64>,
) -> AppResult<Vec<ChannelEpgSnapshotDto>> {
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

    for channel_id in channel_ids {
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
        return Some(DateTime::from_naive_utc_and_offset(ndt, Utc));
    }
    None
}
