use std::sync::{Mutex, OnceLock};

// ── Global state ────────────────────────────────────────────────────────

static ENGINE: OnceLock<Mutex<EngineState>> = OnceLock::new();

struct EngineState {
    db: rusqlite::Connection,
    proxy_port: u16,
}

fn with_engine<T>(f: impl FnOnce(&EngineState) -> Result<T, String>) -> Result<T, String> {
    let state = ENGINE.get().ok_or("Engine not initialized")?;
    let guard = state.lock().map_err(|e| format!("Lock error: {e}"))?;
    f(&guard)
}

fn with_engine_mut<T>(f: impl FnOnce(&mut EngineState) -> Result<T, String>) -> Result<T, String> {
    let state = ENGINE.get().ok_or("Engine not initialized")?;
    let mut guard = state.lock().map_err(|e| format!("Lock error: {e}"))?;
    f(&mut guard)
}

// ── UniFFI record types ─────────────────────────────────────────────────

pub struct SourceInfo {
    pub id: i64,
    pub kind: String,
    pub name: String,
    pub location: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub enabled: bool,
    pub disabled_reason: Option<String>,
    pub auto_refresh_minutes: Option<u32>,
    pub channel_count: u32,
    pub group_count: u32,
    pub channels_with_tvg_id: u32,
    pub epg_program_count: u32,
    pub last_imported_at: Option<String>,
    pub last_refresh_error: Option<String>,
    pub last_refresh_attempt_at: Option<String>,
    pub consecutive_refresh_failures: u32,
    pub next_retry_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct ChannelInfo {
    pub id: i64,
    pub source_id: i64,
    pub name: String,
    pub channel_number: Option<String>,
    pub group_name: Option<String>,
    pub tvg_id: Option<String>,
    pub logo_url: Option<String>,
    pub stream_url: String,
    pub is_favorite: bool,
}

pub struct EpgProgramInfo {
    pub id: i64,
    pub channel_tvg_id: String,
    pub start_at: String,
    pub end_at: String,
    pub title: String,
    pub description: Option<String>,
    pub category: Option<String>,
}

pub struct EpgProgramMini {
    pub title: String,
    pub start_at: String,
    pub end_at: String,
}

pub struct ChannelEpgSnapshot {
    pub channel_id: i64,
    pub now: Option<EpgProgramMini>,
    pub next: Option<EpgProgramMini>,
    pub timeline_programs: Vec<EpgProgramMini>,
}

pub struct ImportResult {
    pub source_id: i64,
    pub channels_imported: u32,
    pub channels_updated: u32,
    pub channels_removed: u32,
}

pub struct RecentChannelInfo {
    pub id: i64,
    pub source_id: i64,
    pub name: String,
    pub channel_number: Option<String>,
    pub group_name: Option<String>,
    pub tvg_id: Option<String>,
    pub logo_url: Option<String>,
    pub stream_url: String,
    pub is_favorite: bool,
    pub last_watched_at: String,
    pub play_count: i64,
}

pub struct SettingInfo {
    pub key: String,
    pub value: String,
    pub updated_at: String,
}

pub struct PlaybackInfo {
    pub channel_id: i64,
    pub resolved_channel_id: i64,
    pub source_id: i64,
    pub channel_name: String,
    pub stream_url: String,
    pub logo_url: Option<String>,
}

pub struct EpgSearchResult {
    pub id: i64,
    pub channel_id: i64,
    pub source_id: i64,
    pub channel_name: String,
    pub channel_number: Option<String>,
    pub channel_tvg_id: String,
    pub start_at: String,
    pub end_at: String,
    pub title: String,
    pub description: Option<String>,
    pub category: Option<String>,
}

// ── Initialization ──────────────────────────────────────────────────────

pub fn init_engine(data_dir: String) -> Result<u16, String> {
    opentivi_core::platform::fs::paths::set_data_dir(&data_dir);

    let conn = opentivi_core::platform::db::connection::open_connection()
        .map_err(|e| e.to_string())?;

    opentivi_core::platform::db::migrations::run_migrations(&conn)
        .map_err(|e| e.to_string())?;

    let _ = opentivi_core::platform::db::repositories::channel_repo::backfill_normalized_names(&conn);

    let proxy_port = opentivi_core::platform::proxy::start_proxy_server();

    let state = EngineState { db: conn, proxy_port };
    ENGINE
        .set(Mutex::new(state))
        .map_err(|_| "Already initialized".to_string())?;

    Ok(proxy_port)
}

// ── Sources ─────────────────────────────────────────────────────────────

pub fn list_sources() -> Result<Vec<SourceInfo>, String> {
    with_engine(|state| {
        opentivi_core::core::services::source_service::list_sources(&state.db)
            .map(|sources| sources.into_iter().map(SourceInfo::from).collect())
            .map_err(|e| e.to_string())
    })
}

pub fn import_m3u(
    name: String,
    location: String,
    auto_refresh_minutes: Option<u32>,
) -> Result<ImportResult, String> {
    // Import operations open their own connection for long-running work
    let conn = opentivi_core::platform::db::connection::open_connection()
        .map_err(|e| e.to_string())?;
    opentivi_core::core::services::import_service::import_m3u(
        &conn,
        &name,
        &location,
        auto_refresh_minutes,
    )
    .map(ImportResult::from)
    .map_err(|e| e.to_string())
}

pub fn import_xtream(
    name: String,
    server_url: String,
    username: String,
    password: String,
) -> Result<ImportResult, String> {
    let conn = opentivi_core::platform::db::connection::open_connection()
        .map_err(|e| e.to_string())?;
    opentivi_core::core::services::import_service::import_xtream(
        &conn,
        &name,
        &server_url,
        &username,
        &password,
    )
    .map(ImportResult::from)
    .map_err(|e| e.to_string())
}

pub fn import_xmltv(name: String, location: String) -> Result<ImportResult, String> {
    let conn = opentivi_core::platform::db::connection::open_connection()
        .map_err(|e| e.to_string())?;
    opentivi_core::core::services::import_service::import_xmltv(&conn, &name, &location)
        .map(ImportResult::from)
        .map_err(|e| e.to_string())
}

pub fn refresh_source(source_id: i64) -> Result<ImportResult, String> {
    let conn = opentivi_core::platform::db::connection::open_connection()
        .map_err(|e| e.to_string())?;
    opentivi_core::core::services::import_service::refresh_source(&conn, source_id)
        .map(ImportResult::from)
        .map_err(|e| e.to_string())
}

pub fn update_source(
    source_id: i64,
    name: String,
    location: String,
    username: Option<String>,
    password: Option<String>,
    auto_refresh_minutes: Option<u32>,
    enabled: bool,
) -> Result<(), String> {
    with_engine(|state| {
        opentivi_core::core::services::source_service::update_source(
            &state.db,
            source_id,
            &name,
            &location,
            username.as_deref(),
            password.as_deref(),
            auto_refresh_minutes,
            enabled,
        )
        .map_err(|e| e.to_string())
    })
}

pub fn delete_source(source_id: i64) -> Result<(), String> {
    with_engine(|state| {
        opentivi_core::core::services::source_service::delete_source(&state.db, source_id)
            .map_err(|e| e.to_string())
    })
}

// ── Channels ────────────────────────────────────────────────────────────

pub fn list_channels(
    source_id: Option<i64>,
    group_name: Option<String>,
    search: Option<String>,
    favorites_only: Option<bool>,
    limit: u32,
    offset: u32,
) -> Result<Vec<ChannelInfo>, String> {
    with_engine(|state| {
        opentivi_core::core::services::channel_service::list_channels(
            &state.db,
            source_id,
            group_name.as_deref(),
            search.as_deref(),
            favorites_only.unwrap_or(false),
            limit,
            offset,
        )
        .map(|channels| channels.into_iter().map(ChannelInfo::from).collect())
        .map_err(|e| e.to_string())
    })
}

pub fn list_groups(source_id: Option<i64>) -> Result<Vec<String>, String> {
    with_engine(|state| {
        opentivi_core::core::services::channel_service::list_groups(&state.db, source_id)
            .map_err(|e| e.to_string())
    })
}

pub fn get_channel(channel_id: i64) -> Result<Option<ChannelInfo>, String> {
    with_engine(|state| {
        opentivi_core::platform::db::repositories::channel_repo::get_enabled_channel_dto_by_id(
            &state.db,
            channel_id,
        )
        .map(|opt| opt.map(ChannelInfo::from))
        .map_err(|e| e.to_string())
    })
}

// ── EPG ─────────────────────────────────────────────────────────────────

pub fn get_channel_epg(
    channel_id: i64,
    from_ts: Option<String>,
    to_ts: Option<String>,
) -> Result<Vec<EpgProgramInfo>, String> {
    with_engine(|state| {
        opentivi_core::core::services::epg_service::get_channel_epg(
            &state.db,
            channel_id,
            from_ts.as_deref(),
            to_ts.as_deref(),
        )
        .map(|programs| programs.into_iter().map(EpgProgramInfo::from).collect())
        .map_err(|e| e.to_string())
    })
}

pub fn get_channels_epg_snapshots(
    channel_ids: Vec<i64>,
    window_start_ts: Option<i64>,
    window_end_ts: Option<i64>,
) -> Result<Vec<ChannelEpgSnapshot>, String> {
    with_engine(|state| {
        opentivi_core::core::services::epg_service::get_channels_epg_snapshots(
            &state.db,
            &channel_ids,
            window_start_ts,
            window_end_ts,
        )
        .map(|snapshots| snapshots.into_iter().map(ChannelEpgSnapshot::from).collect())
        .map_err(|e| e.to_string())
    })
}

pub fn search_epg(
    search: Option<String>,
    state: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<EpgSearchResult>, String> {
    with_engine(|engine| {
        opentivi_core::core::services::epg_service::search_programs(
            &engine.db,
            search.as_deref(),
            state.as_deref(),
            limit.unwrap_or(100),
        )
        .map(|results| results.into_iter().map(EpgSearchResult::from).collect())
        .map_err(|e| e.to_string())
    })
}

// ── Favorites ───────────────────────────────────────────────────────────

pub fn list_favorites() -> Result<Vec<ChannelInfo>, String> {
    with_engine(|state| {
        opentivi_core::core::services::favorites_service::list_favorites(&state.db)
            .map(|channels| channels.into_iter().map(ChannelInfo::from).collect())
            .map_err(|e| e.to_string())
    })
}

pub fn set_favorite(channel_id: i64, favorite: bool) -> Result<(), String> {
    with_engine(|state| {
        opentivi_core::core::services::favorites_service::set_favorite(
            &state.db,
            channel_id,
            favorite,
        )
        .map_err(|e| e.to_string())
    })
}

// ── Recents ─────────────────────────────────────────────────────────────

pub fn list_recents() -> Result<Vec<RecentChannelInfo>, String> {
    with_engine(|state| {
        opentivi_core::core::services::recents_service::list_recents(&state.db, 50)
            .map(|recents| recents.into_iter().map(RecentChannelInfo::from).collect())
            .map_err(|e| e.to_string())
    })
}

pub fn mark_recent_watched(channel_id: i64) -> Result<(), String> {
    with_engine(|state| {
        opentivi_core::core::services::recents_service::mark_recent_watched(
            &state.db,
            channel_id,
        )
        .map_err(|e| e.to_string())
    })
}

// ── Playback ────────────────────────────────────────────────────────────

pub fn resolve_playback(channel_id: i64) -> Result<PlaybackInfo, String> {
    with_engine(|state| {
        opentivi_core::core::services::playback_service::resolve_playback(&state.db, channel_id)
            .map(PlaybackInfo::from)
            .map_err(|e| e.to_string())
    })
}

pub fn list_playback_candidates(channel_id: i64) -> Result<Vec<PlaybackInfo>, String> {
    with_engine(|state| {
        opentivi_core::core::services::playback_service::list_playback_candidates(
            &state.db,
            channel_id,
        )
        .map(|candidates| candidates.into_iter().map(PlaybackInfo::from).collect())
        .map_err(|e| e.to_string())
    })
}

// ── Settings ────────────────────────────────────────────────────────────

pub fn get_all_settings() -> Result<Vec<SettingInfo>, String> {
    with_engine(|state| {
        opentivi_core::core::services::settings_service::get_settings(&state.db)
            .map(|settings| settings.into_iter().map(SettingInfo::from).collect())
            .map_err(|e| e.to_string())
    })
}

pub fn set_setting(key: String, value: String) -> Result<(), String> {
    with_engine(|state| {
        let json_value: serde_json::Value =
            serde_json::from_str(&value).unwrap_or(serde_json::Value::String(value.clone()));
        opentivi_core::core::services::settings_service::set_setting(
            &state.db,
            &key,
            &json_value,
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
    })
}

// ── Proxy ───────────────────────────────────────────────────────────────

pub fn get_proxy_port() -> Result<u16, String> {
    with_engine(|state| Ok(state.proxy_port))
}

// ── DTO → UniFFI record conversions ─────────────────────────────────────

impl From<opentivi_core::dto::SourceDto> for SourceInfo {
    fn from(s: opentivi_core::dto::SourceDto) -> Self {
        Self {
            id: s.id,
            kind: s.kind,
            name: s.name,
            location: s.location,
            username: s.username,
            password: s.password,
            enabled: s.enabled,
            disabled_reason: s.disabled_reason,
            auto_refresh_minutes: s.auto_refresh_minutes,
            channel_count: s.channel_count,
            group_count: s.group_count,
            channels_with_tvg_id: s.channels_with_tvg_id,
            epg_program_count: s.epg_program_count,
            last_imported_at: s.last_imported_at,
            last_refresh_error: s.last_refresh_error,
            last_refresh_attempt_at: s.last_refresh_attempt_at,
            consecutive_refresh_failures: s.consecutive_refresh_failures,
            next_retry_at: s.next_retry_at,
            created_at: s.created_at,
            updated_at: s.updated_at,
        }
    }
}

impl From<opentivi_core::dto::ChannelListItemDto> for ChannelInfo {
    fn from(c: opentivi_core::dto::ChannelListItemDto) -> Self {
        Self {
            id: c.id,
            source_id: c.source_id,
            name: c.name,
            channel_number: c.channel_number,
            group_name: c.group_name,
            tvg_id: c.tvg_id,
            logo_url: c.logo_url,
            stream_url: c.stream_url,
            is_favorite: c.is_favorite,
        }
    }
}

impl From<opentivi_core::dto::EpgProgramDto> for EpgProgramInfo {
    fn from(p: opentivi_core::dto::EpgProgramDto) -> Self {
        Self {
            id: p.id,
            channel_tvg_id: p.channel_tvg_id,
            start_at: p.start_at,
            end_at: p.end_at,
            title: p.title,
            description: p.description,
            category: p.category,
        }
    }
}

impl From<opentivi_core::dto::EpgProgramMiniDto> for EpgProgramMini {
    fn from(p: opentivi_core::dto::EpgProgramMiniDto) -> Self {
        Self {
            title: p.title,
            start_at: p.start_at,
            end_at: p.end_at,
        }
    }
}

impl From<opentivi_core::dto::ChannelEpgSnapshotDto> for ChannelEpgSnapshot {
    fn from(s: opentivi_core::dto::ChannelEpgSnapshotDto) -> Self {
        Self {
            channel_id: s.channel_id,
            now: s.now.map(EpgProgramMini::from),
            next: s.next.map(EpgProgramMini::from),
            timeline_programs: s
                .timeline_programs
                .into_iter()
                .map(EpgProgramMini::from)
                .collect(),
        }
    }
}

impl From<opentivi_core::dto::ImportSummaryDto> for ImportResult {
    fn from(s: opentivi_core::dto::ImportSummaryDto) -> Self {
        Self {
            source_id: s.source_id,
            channels_imported: s.channels_imported,
            channels_updated: s.channels_updated,
            channels_removed: s.channels_removed,
        }
    }
}

impl From<opentivi_core::dto::RecentChannelDto> for RecentChannelInfo {
    fn from(r: opentivi_core::dto::RecentChannelDto) -> Self {
        Self {
            id: r.id,
            source_id: r.source_id,
            name: r.name,
            channel_number: r.channel_number,
            group_name: r.group_name,
            tvg_id: r.tvg_id,
            logo_url: r.logo_url,
            stream_url: r.stream_url,
            is_favorite: r.is_favorite,
            last_watched_at: r.last_watched_at,
            play_count: r.play_count,
        }
    }
}

impl From<opentivi_core::dto::SettingDto> for SettingInfo {
    fn from(s: opentivi_core::dto::SettingDto) -> Self {
        Self {
            key: s.key,
            value: serde_json::to_string(&s.value).unwrap_or_default(),
            updated_at: s.updated_at,
        }
    }
}

impl From<opentivi_core::dto::PlaybackSourceDto> for PlaybackInfo {
    fn from(p: opentivi_core::dto::PlaybackSourceDto) -> Self {
        Self {
            channel_id: p.channel_id,
            resolved_channel_id: p.resolved_channel_id,
            source_id: p.source_id,
            channel_name: p.channel_name,
            stream_url: p.stream_url,
            logo_url: p.logo_url,
        }
    }
}

impl From<opentivi_core::dto::EpgProgramSearchResultDto> for EpgSearchResult {
    fn from(r: opentivi_core::dto::EpgProgramSearchResultDto) -> Self {
        Self {
            id: r.id,
            channel_id: r.channel_id,
            source_id: r.source_id,
            channel_name: r.channel_name,
            channel_number: r.channel_number,
            channel_tvg_id: r.channel_tvg_id,
            start_at: r.start_at,
            end_at: r.end_at,
            title: r.title,
            description: r.description,
            category: r.category,
        }
    }
}

uniffi::include_scaffolding!("opentivi");
