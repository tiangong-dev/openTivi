use std::time::Duration;

use tokio::time;

const CHECK_INTERVAL_SECS: u64 = 60;
const STALE_MINUTES: i64 = 30;
const BATCH_SIZE: u32 = 25;
const PROBE_TIMEOUT: Duration = Duration::from_secs(4);

/// Start the background health-check worker.
/// Opens its own DB connection to avoid contention with the main Tauri thread.
pub fn start_health_worker() {
    std::thread::spawn(|| {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create health worker runtime");
        rt.block_on(async {
            let mut interval = time::interval(Duration::from_secs(CHECK_INTERVAL_SECS));
            loop {
                interval.tick().await;
                if let Err(e) = run_check_cycle().await {
                    log::warn!("Health check cycle error: {}", e);
                }
            }
        });
    });
}

async fn run_check_cycle() -> Result<(), Box<dyn std::error::Error>> {
    let conn = crate::platform::db::connection::open_connection()?;
    let due = crate::platform::db::repositories::channel_health_repo::list_due_channels(
        &conn,
        STALE_MINUTES,
        BATCH_SIZE,
    )?;

    for (channel_id, stream_url) in due {
        let result = check_stream(&stream_url).await;
        crate::platform::db::repositories::channel_health_repo::upsert_health(
            &conn,
            channel_id,
            result.status,
            result.response_time_ms,
            result.error.as_deref(),
        )?;
    }
    Ok(())
}

struct CheckResult {
    status: &'static str,
    response_time_ms: Option<i64>,
    error: Option<String>,
}

async fn check_stream(url: &str) -> CheckResult {
    let start = std::time::Instant::now();

    if url.starts_with("http://") || url.starts_with("https://") {
        match check_http(url).await {
            Ok(()) => CheckResult {
                status: "alive",
                response_time_ms: Some(start.elapsed().as_millis() as i64),
                error: None,
            },
            Err(e) => {
                let status = if is_ambiguous_error(&e) {
                    "unknown"
                } else {
                    "dead"
                };
                CheckResult {
                    status,
                    response_time_ms: Some(start.elapsed().as_millis() as i64),
                    error: Some(e),
                }
            }
        }
    } else if url.starts_with("rtsp://") || url.starts_with("rtmp://") {
        match check_tcp(url).await {
            Ok(()) => CheckResult {
                status: "alive",
                response_time_ms: Some(start.elapsed().as_millis() as i64),
                error: None,
            },
            Err(e) => CheckResult {
                status: "dead",
                response_time_ms: Some(start.elapsed().as_millis() as i64),
                error: Some(e),
            },
        }
    } else {
        CheckResult {
            status: "unknown",
            response_time_ms: None,
            error: Some("Unsupported scheme".to_string()),
        }
    }
}

async fn check_http(url: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(PROBE_TIMEOUT)
        .connect_timeout(PROBE_TIMEOUT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .head(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status().as_u16();
    if status < 400 {
        Ok(())
    } else if status == 401 || status == 403 || status == 405 {
        // Ambiguous — server is alive but may require auth or disallow HEAD
        Err(format!("HTTP {}", status))
    } else {
        Err(format!("HTTP {}", status))
    }
}

fn is_ambiguous_error(err: &str) -> bool {
    err.contains("HTTP 401") || err.contains("HTTP 403") || err.contains("HTTP 405")
}

async fn check_tcp(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| e.to_string())?;
    let host = parsed.host_str().ok_or("No host in URL")?;
    let port = parsed.port().unwrap_or(match parsed.scheme() {
        "rtsp" => 554,
        "rtmp" => 1935,
        _ => 80,
    });

    let addr = format!("{}:{}", host, port);
    tokio::time::timeout(PROBE_TIMEOUT, tokio::net::TcpStream::connect(&addr))
        .await
        .map_err(|_| "Connection timeout".to_string())?
        .map_err(|e| e.to_string())?;
    Ok(())
}
