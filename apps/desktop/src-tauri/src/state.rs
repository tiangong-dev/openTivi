use opentivi_core::context::CoreContext;
use opentivi_core::core::services::prewarm_orchestrator::ResourcePrewarmOrchestrator;
use opentivi_core::platform::db::executor::DbExecutor;

pub struct AppState {
    pub ctx: CoreContext,
    pub proxy_port: u16,
    pub remote_config_url: String,
    pub prewarm: ResourcePrewarmOrchestrator,
}

impl AppState {
    pub async fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let db_path = opentivi_core::platform::fs::paths::db_path()?;

        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Run migrations on a fresh connection (one-time startup cost)
        tauri::async_runtime::spawn_blocking(move || {
            let conn = opentivi_core::platform::db::connection::open_connection()
                .map_err(|e| e.to_string())?;
            opentivi_core::platform::db::migrations::run_migrations(&conn)
                .map_err(|e| e.to_string())?;
            let _ = opentivi_core::platform::db::repositories::channel_repo::backfill_normalized_names(&conn);
            Ok::<(), String>(())
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;

        let db = DbExecutor::new(db_path);
        let ctx = CoreContext::new(db);

        let proxy_port = opentivi_core::platform::proxy::start_proxy_server().await;
        let prewarm = ResourcePrewarmOrchestrator::new(proxy_port);

        let remote_info = opentivi_core::platform::remote_config::start_remote_config_server(ctx.clone()).await;

        opentivi_core::core::services::health_worker::start_health_worker(ctx.clone());

        Ok(Self {
            ctx,
            proxy_port,
            remote_config_url: remote_info.url,
            prewarm,
        })
    }
}
