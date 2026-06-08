use std::time::Duration;

use tokio::time;

use crate::context::CoreContext;

const CHECK_INTERVAL_SECS: u64 = 60;
const STALE_MINUTES: i64 = 30;
const BATCH_SIZE: u32 = 25;
const PROBE_TIMEOUT: Duration = Duration::from_secs(4);
/// Hard wall-clock limit per check — catches hung DNS, stuck sockets, etc.
const CHECK_DEADLINE: Duration = Duration::from_secs(6);

pub fn start_health_worker(ctx: CoreContext) {
    tokio::spawn(async move {
        // Shared client — reuses connections across checks.
        let client = reqwest::Client::builder()
            .timeout(PROBE_TIMEOUT)
            .connect_timeout(PROBE_TIMEOUT)
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .unwrap_or_default();

        let mut interval = time::interval(Duration::from_secs(CHECK_INTERVAL_SECS));
        loop {
            interval.tick().await;
            if let Err(e) = run_check_cycle(&ctx, &client).await {
                eprintln!("[health] cycle error: {e}");
            }
        }
    });
}

async fn run_check_cycle(
    ctx: &CoreContext,
    client: &reqwest::Client,
) -> Result<(), Box<dyn std::error::Error>> {
    let due = ctx
        .db
        .run(|conn| {
            crate::platform::db::repositories::channel_health_repo::list_due_channels(
                conn,
                STALE_MINUTES,
                BATCH_SIZE,
            )
        })
        .await?;

    if due.is_empty() {
        return Ok(());
    }

    // Check all channels concurrently (bounded by BATCH_SIZE).
    let mut handles = Vec::with_capacity(due.len());
    for (channel_id, stream_url) in due {
        let client = client.clone();
        handles.push(tokio::spawn(async move {
            // Hard deadline wraps the entire check, including DNS.
            let result = match tokio::time::timeout(CHECK_DEADLINE, check_stream(&client, &stream_url)).await
            {
                Ok(r) => r,
                Err(_) => CheckResult {
                    status: "dead",
                    response_time_ms: Some(CHECK_DEADLINE.as_millis() as i64),
                    error: Some("check deadline exceeded".into()),
                },
            };
            (channel_id, result)
        }));
    }

    // Collect results and write to DB.
    for handle in handles {
        match handle.await {
            Ok((channel_id, result)) => {
                let status = result.status.to_string();
                let response_time_ms = result.response_time_ms;
                let error = result.error;
                if let Err(e) = ctx
                    .db
                    .run(move |conn| {
                        crate::platform::db::repositories::channel_health_repo::upsert_health(
                            conn,
                            channel_id,
                            &status,
                            response_time_ms,
                            error.as_deref(),
                        )
                    })
                    .await
                {
                    eprintln!("[health] db write error for channel {channel_id}: {e}");
                }
            }
            Err(e) => {
                // JoinError — task panicked; log and continue.
                eprintln!("[health] task panic: {e}");
            }
        }
    }

    Ok(())
}

struct CheckResult {
    status: &'static str,
    response_time_ms: Option<i64>,
    error: Option<String>,
}

async fn check_stream(client: &reqwest::Client, url: &str) -> CheckResult {
    let start = std::time::Instant::now();

    if url.starts_with("http://") || url.starts_with("https://") {
        match check_http(client, url).await {
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
            error: Some("Unsupported scheme".into()),
        }
    }
}

async fn check_http(client: &reqwest::Client, url: &str) -> Result<(), String> {
    let resp = client.head(url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    if status < 400 {
        Ok(())
    } else {
        Err(format!("HTTP {status}"))
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
    let addr = format!("{host}:{port}");
    tokio::time::timeout(PROBE_TIMEOUT, tokio::net::TcpStream::connect(&addr))
        .await
        .map_err(|_| "Connection timeout".to_string())?
        .map_err(|e| e.to_string())?;
    Ok(())
}
