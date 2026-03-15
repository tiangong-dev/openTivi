use std::collections::HashMap;
use std::net::{TcpListener, UdpSocket};

use serde::{Deserialize, Serialize};
use warp::Filter;

pub struct RemoteServerInfo {
    pub url: String,
}

/// Start a LAN-accessible HTTP server for remote source configuration.
/// Returns the port, full URL (with LAN IP), and session token.
pub fn start_remote_config_server() -> RemoteServerInfo {
    let token = generate_token();
    let listener = TcpListener::bind("0.0.0.0:0").expect("Failed to bind remote config port");
    let port = listener.local_addr().unwrap().port();
    drop(listener);

    let lan_ip = get_lan_ip().unwrap_or_else(|| "127.0.0.1".to_string());
    let url = format!("http://{}:{}/remote?t={}", lan_ip, port, token);

    let token_for_routes = token.clone();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create remote config runtime");
        rt.block_on(async move {
            let token = token_for_routes;

            let page = {
                let t = token.clone();
                warp::path("remote")
                    .and(warp::get())
                    .and(warp::query::<HashMap<String, String>>())
                    .map(move |params: HashMap<String, String>| {
                        if params.get("t").map(|s| s.as_str()) != Some(&t) {
                            return warp::reply::with_status(
                                warp::reply::html("Unauthorized".to_string()),
                                warp::http::StatusCode::UNAUTHORIZED,
                            );
                        }
                        warp::reply::with_status(
                            warp::reply::html(remote_page_html(&t)),
                            warp::http::StatusCode::OK,
                        )
                    })
            };

            let import_m3u = {
                let t = token.clone();
                warp::path!("api" / "import" / "m3u")
                    .and(warp::post())
                    .and(warp::query::<HashMap<String, String>>())
                    .and(warp::body::json::<RemoteImportM3uInput>())
                    .and_then(move |params: HashMap<String, String>, input: RemoteImportM3uInput| {
                        let t = t.clone();
                        async move {
                            if params.get("t").map(|s| s.as_str()) != Some(&t) {
                                return Ok::<_, warp::Rejection>(warp::reply::with_status(
                                    warp::reply::json(&serde_json::json!({"error": "Unauthorized"})),
                                    warp::http::StatusCode::UNAUTHORIZED,
                                ));
                            }
                            match handle_import_m3u(input) {
                                Ok(summary) => Ok(warp::reply::with_status(
                                    warp::reply::json(&summary),
                                    warp::http::StatusCode::OK,
                                )),
                                Err(e) => Ok(warp::reply::with_status(
                                    warp::reply::json(&serde_json::json!({"error": e})),
                                    warp::http::StatusCode::BAD_REQUEST,
                                )),
                            }
                        }
                    })
            };

            let import_xtream = {
                let t = token.clone();
                warp::path!("api" / "import" / "xtream")
                    .and(warp::post())
                    .and(warp::query::<HashMap<String, String>>())
                    .and(warp::body::json::<RemoteImportXtreamInput>())
                    .and_then(move |params: HashMap<String, String>, input: RemoteImportXtreamInput| {
                        let t = t.clone();
                        async move {
                            if params.get("t").map(|s| s.as_str()) != Some(&t) {
                                return Ok::<_, warp::Rejection>(warp::reply::with_status(
                                    warp::reply::json(&serde_json::json!({"error": "Unauthorized"})),
                                    warp::http::StatusCode::UNAUTHORIZED,
                                ));
                            }
                            match handle_import_xtream(input) {
                                Ok(summary) => Ok(warp::reply::with_status(
                                    warp::reply::json(&summary),
                                    warp::http::StatusCode::OK,
                                )),
                                Err(e) => Ok(warp::reply::with_status(
                                    warp::reply::json(&serde_json::json!({"error": e})),
                                    warp::http::StatusCode::BAD_REQUEST,
                                )),
                            }
                        }
                    })
            };

            let cors = warp::cors()
                .allow_any_origin()
                .allow_methods(vec!["GET", "POST"])
                .allow_headers(vec!["content-type"]);

            let routes = page.or(import_m3u).or(import_xtream).with(cors);
            warp::serve(routes).run(([0, 0, 0, 0], port)).await;
        });
    });

    RemoteServerInfo {
        url,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteImportM3uInput {
    name: String,
    location: String,
    auto_refresh_minutes: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteImportXtreamInput {
    name: String,
    server_url: String,
    username: String,
    password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteImportResult {
    source_id: i64,
    channels_imported: u32,
    channels_updated: u32,
    channels_removed: u32,
}

fn handle_import_m3u(input: RemoteImportM3uInput) -> Result<RemoteImportResult, String> {
    let conn = crate::platform::db::connection::open_connection()
        .map_err(|e| format!("DB error: {}", e))?;
    let summary = crate::core::services::import_service::import_m3u(
        &conn,
        &input.name,
        &input.location,
        input.auto_refresh_minutes,
    )
    .map_err(|e| format!("{}", e))?;
    Ok(RemoteImportResult {
        source_id: summary.source_id,
        channels_imported: summary.channels_imported,
        channels_updated: summary.channels_updated,
        channels_removed: summary.channels_removed,
    })
}

fn handle_import_xtream(input: RemoteImportXtreamInput) -> Result<RemoteImportResult, String> {
    let conn = crate::platform::db::connection::open_connection()
        .map_err(|e| format!("DB error: {}", e))?;
    let summary = crate::core::services::import_service::import_xtream(
        &conn,
        &input.name,
        &input.server_url,
        &input.username,
        &input.password,
    )
    .map_err(|e| format!("{}", e))?;
    Ok(RemoteImportResult {
        source_id: summary.source_id,
        channels_imported: summary.channels_imported,
        channels_updated: summary.channels_updated,
        channels_removed: summary.channels_removed,
    })
}

fn generate_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:x}", ts)
}

fn get_lan_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    Some(addr.ip().to_string())
}

fn remote_page_html(token: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenTivi Remote Config</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }}
  h1 {{ font-size: 22px; margin-bottom: 20px; text-align: center; }}
  .card {{ background: #16213e; border-radius: 12px; padding: 20px; margin-bottom: 16px; }}
  .card h2 {{ font-size: 16px; margin-bottom: 12px; color: #00d9ff; }}
  label {{ display: block; font-size: 13px; margin-bottom: 4px; color: #aaa; }}
  input {{ width: 100%; padding: 10px; border: 1px solid #333; border-radius: 8px; background: #0f3460; color: #eee; font-size: 14px; margin-bottom: 12px; }}
  button {{ width: 100%; padding: 12px; border: none; border-radius: 8px; background: #00d9ff; color: #1a1a2e; font-size: 15px; font-weight: 600; cursor: pointer; }}
  button:active {{ opacity: 0.8; }}
  .msg {{ margin-top: 12px; padding: 10px; border-radius: 8px; font-size: 13px; }}
  .msg.ok {{ background: #1b4332; color: #95d5b2; }}
  .msg.err {{ background: #3d0000; color: #ff6b6b; }}
</style>
</head>
<body>
<h1>📺 OpenTivi Remote Config</h1>

<div class="card">
  <h2>Import M3U</h2>
  <label>Name</label>
  <input id="m3u-name" placeholder="My IPTV">
  <label>M3U URL or file path</label>
  <input id="m3u-url" placeholder="http://example.com/playlist.m3u">
  <button onclick="importM3u()">Import</button>
  <div id="m3u-msg"></div>
</div>

<div class="card">
  <h2>Import Xtream Codes</h2>
  <label>Name</label>
  <input id="xt-name" placeholder="My Xtream">
  <label>Server URL</label>
  <input id="xt-server" placeholder="http://example.com:8080">
  <label>Username</label>
  <input id="xt-user" placeholder="username">
  <label>Password</label>
  <input id="xt-pass" type="password" placeholder="password">
  <button onclick="importXtream()">Import</button>
  <div id="xt-msg"></div>
</div>

<script>
const TOKEN = "{token}";
const BASE = location.origin;

async function post(path, body) {{
  const res = await fetch(BASE + path + "?t=" + TOKEN, {{
    method: "POST",
    headers: {{ "Content-Type": "application/json" }},
    body: JSON.stringify(body),
  }});
  return {{ ok: res.ok, data: await res.json() }};
}}

function showMsg(id, ok, text) {{
  const el = document.getElementById(id);
  el.className = "msg " + (ok ? "ok" : "err");
  el.textContent = text;
}}

async function importM3u() {{
  const name = document.getElementById("m3u-name").value.trim();
  const location = document.getElementById("m3u-url").value.trim();
  if (!name || !location) {{ showMsg("m3u-msg", false, "Please fill all fields"); return; }}
  try {{
    const r = await post("/api/import/m3u", {{ name, location }});
    if (r.ok) showMsg("m3u-msg", true, "Imported " + r.data.channelsImported + " channels");
    else showMsg("m3u-msg", false, r.data.error || "Import failed");
  }} catch(e) {{ showMsg("m3u-msg", false, "Network error"); }}
}}

async function importXtream() {{
  const name = document.getElementById("xt-name").value.trim();
  const serverUrl = document.getElementById("xt-server").value.trim();
  const username = document.getElementById("xt-user").value.trim();
  const password = document.getElementById("xt-pass").value;
  if (!name || !serverUrl || !username || !password) {{ showMsg("xt-msg", false, "Please fill all fields"); return; }}
  try {{
    const r = await post("/api/import/xtream", {{ name, serverUrl, username, password }});
    if (r.ok) showMsg("xt-msg", true, "Imported " + r.data.channelsImported + " channels");
    else showMsg("xt-msg", false, r.data.error || "Import failed");
  }} catch(e) {{ showMsg("xt-msg", false, "Network error"); }}
}}
</script>
</body>
</html>"#,
        token = token
    )
}
