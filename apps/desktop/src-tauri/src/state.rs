use std::sync::Mutex;

use opentivi_core::platform::db;
use opentivi_core::core::services::prewarm_orchestrator::ResourcePrewarmOrchestrator;

pub struct AppState {
    pub db: Mutex<opentivi_core::rusqlite::Connection>,
    pub proxy_port: u16,
    pub remote_config_url: String,
    pub prewarm: ResourcePrewarmOrchestrator,
}

impl AppState {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let conn = db::connection::open_connection()?;
        db::migrations::run_migrations(&conn)?;

        // Backfill normalized_name for existing channels
        let _ = opentivi_core::platform::db::repositories::channel_repo::backfill_normalized_names(&conn);

        let proxy_port = opentivi_core::platform::proxy::start_proxy_server();
        let prewarm = ResourcePrewarmOrchestrator::new(proxy_port);

        // Start remote config server (LAN-accessible, token-protected)
        let remote_info = opentivi_core::platform::remote_config::start_remote_config_server();

        // Start background health check worker
        opentivi_core::core::services::health_worker::start_health_worker();

        Ok(Self {
            db: Mutex::new(conn),
            proxy_port,
            remote_config_url: remote_info.url,
            prewarm,
        })
    }
}
