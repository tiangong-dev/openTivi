use crate::platform::db::executor::DbExecutor;

#[derive(Clone)]
pub struct CoreContext {
    pub db: DbExecutor,
    pub http: reqwest::Client,
}

impl CoreContext {
    pub fn new(db: DbExecutor) -> Self {
        let http = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(8))
            .timeout(std::time::Duration::from_secs(60))
            .pool_max_idle_per_host(8)
            .build()
            .expect("Failed to create HTTP client");
        Self { db, http }
    }
}
