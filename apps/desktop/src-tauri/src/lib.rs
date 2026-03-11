mod commands;
mod core;
mod error;
mod platform;
mod state;

use state::AppState;

pub fn run() {
    let app_state = AppState::new().expect("Failed to initialize app state");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::health::health,
            commands::health::get_proxy_port,
            commands::sources::list_sources,
            commands::sources::import_m3u,
            commands::sources::import_xtream,
            commands::sources::import_xmltv,
            commands::sources::refresh_source,
            commands::sources::update_source,
            commands::sources::delete_source,
            commands::channels::list_channels,
            commands::channels::list_groups,
            commands::channels::get_channel,
            commands::channels::get_channel_epg,
            commands::channels::get_channels_epg_snapshots,
            commands::channels::search_epg,
            commands::favorites::list_favorites,
            commands::favorites::set_favorite,
            commands::recents::list_recents,
            commands::recents::mark_recent_watched,
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::playback::resolve_playback,
            commands::playback::list_playback_candidates,
            commands::prewarm::prewarm_report_primary,
            commands::prewarm::prewarm_submit_intents,
            commands::prewarm::prewarm_clear_source,
            commands::runtime_log::append_runtime_log,
            commands::runtime_log::get_runtime_logs,
            commands::runtime_log::clear_runtime_logs,
            commands::update::check_app_update,
            commands::remote::get_remote_config_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
