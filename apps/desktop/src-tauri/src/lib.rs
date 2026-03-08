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
            commands::channels::get_channel_epg,
            commands::channels::get_channels_epg_snapshots,
            commands::favorites::list_favorites,
            commands::favorites::set_favorite,
            commands::recents::list_recents,
            commands::recents::mark_recent_watched,
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::playback::resolve_playback,
            commands::update::check_app_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
