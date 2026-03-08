use std::sync::Mutex;

use rusqlite::Connection;

use crate::platform::db;
use crate::core::services::prewarm_orchestrator::ResourcePrewarmOrchestrator;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub proxy_port: u16,
    pub prewarm: ResourcePrewarmOrchestrator,
}

impl AppState {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let conn = db::connection::open_connection()?;
        db::migrations::run_migrations(&conn)?;

        let proxy_port = crate::platform::proxy::start_proxy_server();
        let prewarm = ResourcePrewarmOrchestrator::new(proxy_port);

        Ok(Self {
            db: Mutex::new(conn),
            proxy_port,
            prewarm,
        })
    }
}
