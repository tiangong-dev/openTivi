use std::sync::Mutex;

use rusqlite::Connection;

use crate::platform::db;
use crate::core::services::prewarm_orchestrator::ResourcePrewarmOrchestrator;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub proxy_port: u16,
    pub remote_config_url: String,
    pub prewarm: ResourcePrewarmOrchestrator,
}

impl AppState {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let conn = db::connection::open_connection()?;
        db::migrations::run_migrations(&conn)?;

        // Backfill normalized_name for existing channels
        let _ = crate::platform::db::repositories::channel_repo::backfill_normalized_names(&conn);

        let proxy_port = crate::platform::proxy::start_proxy_server();
        let prewarm = ResourcePrewarmOrchestrator::new(proxy_port);

        // Start remote config server (LAN-accessible, token-protected)
        let remote_info = crate::platform::remote_config::start_remote_config_server();

        // Start background health check worker
        crate::core::services::health_worker::start_health_worker();

        Ok(Self {
            db: Mutex::new(conn),
            proxy_port,
            remote_config_url: remote_info.url,
            prewarm,
        })
    }
}
