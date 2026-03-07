use rusqlite::Connection;

use chrono::{DateTime, NaiveDateTime, Utc};

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
) -> AppResult<Vec<ChannelEpgSnapshotDto>> {
    let now = Utc::now();
    let mut snapshots = Vec::with_capacity(channel_ids.len());

    for channel_id in channel_ids {
        let programs = crate::platform::db::repositories::epg_repo::get_channel_epg(
            conn,
            *channel_id,
            None,
            None,
        )?;
        let mut now_program: Option<EpgProgramDto> = None;
        let mut next_program: Option<EpgProgramDto> = None;
        let mut next_start_ts: Option<DateTime<Utc>> = None;

        for program in programs {
            let start = parse_program_time(&program.start_at);
            let end = parse_program_time(&program.end_at);
            if let (Some(start_ts), Some(end_ts)) = (start, end) {
                if start_ts <= now && now < end_ts {
                    now_program = Some(program);
                    continue;
                }
                if start_ts > now {
                    let should_replace = match next_start_ts {
                        Some(existing) => start_ts < existing,
                        None => true,
                    };
                    if should_replace {
                        next_start_ts = Some(start_ts);
                        next_program = Some(program);
                    }
                }
            }
        }

        snapshots.push(ChannelEpgSnapshotDto {
            channel_id: *channel_id,
            now: now_program.map(to_mini_program),
            next: next_program.map(to_mini_program),
        });
    }

    Ok(snapshots)
}

fn to_mini_program(program: EpgProgramDto) -> EpgProgramMiniDto {
    EpgProgramMiniDto {
        title: program.title,
        start_at: program.start_at,
        end_at: program.end_at,
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
