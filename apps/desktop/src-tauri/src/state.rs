use std::sync::Mutex;

use rusqlite::Connection;

use crate::platform::db;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub proxy_port: u16,
}

impl AppState {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let conn = db::connection::open_connection()?;
        db::migrations::run_migrations(&conn)?;

        let proxy_port = crate::platform::proxy::start_proxy_server();

        Ok(Self {
            db: Mutex::new(conn),
            proxy_port,
        })
    }
}
