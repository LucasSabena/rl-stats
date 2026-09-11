//! Tauri command handlers for the overlay server.
//!
//! These commands allow the React frontend to start/stop the overlay
//! HTTP server, query its status, and retrieve the URLs of available
//! overlay pages that can be pasted into OBS as browser sources.

use crate::core::overlay::{OverlayServer, OverlayServerStatus};
use crate::core::settings::{get_settings, set_settings};
use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// A named overlay URL returned to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayUrl {
    /// Stable identifier (used as a React key and for scene presets).
    pub id: String,
    /// Human-readable overlay name (e.g. "Scoreboard").
    pub name: String,
    /// One-line explanation of what the overlay shows.
    pub description: String,
    /// Full HTTP URL for use as an OBS browser source.
    pub url: String,
}

/// Query-string customization for the enhanced overlay.
///
/// Empty values are omitted so the overlay keeps its defaults.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySceneConfig {
    pub title: String,
    pub blue_name: String,
    pub orange_name: String,
    pub blue_logo: String,
    pub orange_logo: String,
    pub series: Option<u32>,
    /// Comma-separated module list to hide (e.g. `"events,rosters"`).
    pub hide: String,
    /// Alert types the alerts overlay should play.
    pub alert_types: String,
}

fn scene_query(config: &OverlaySceneConfig, token: &str) -> String {
    let mut serializer = form_urlencoded::Serializer::new(String::new());
    serializer.append_pair("token", token);
    if !config.title.is_empty() {
        serializer.append_pair("title", &config.title);
    }
    if !config.blue_name.is_empty() {
        serializer.append_pair("blueName", &config.blue_name);
    }
    if !config.orange_name.is_empty() {
        serializer.append_pair("orangeName", &config.orange_name);
    }
    if !config.blue_logo.is_empty() {
        serializer.append_pair("blueLogo", &config.blue_logo);
    }
    if !config.orange_logo.is_empty() {
        serializer.append_pair("orangeLogo", &config.orange_logo);
    }
    if let Some(series) = config.series.filter(|s| *s > 0) {
        serializer.append_pair("series", &series.to_string());
    }
    if !config.hide.is_empty() {
        serializer.append_pair("hide", &config.hide);
    }
    if !config.alert_types.is_empty() {
        serializer.append_pair("types", &config.alert_types);
    }
    serializer.finish()
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Starts the overlay HTTP/WebSocket server on the given port.
///
/// The server handle is stored in [`AppState::overlay_server`] so it can
/// be accessed by other commands and the event-processing loop. The port and
/// the enabled flag are persisted so the server can auto-start next launch.
///
/// # Errors
///
/// Returns `Err` if the server is already running or if the TCP port
/// cannot be bound.
#[tauri::command]
pub async fn start_overlay_server(
    state: State<'_, AppState>,
    port: u16,
) -> Result<OverlayServerStatus, String> {
    info!(port, "Starting overlay server");

    let mut server = OverlayServer::new(port);
    server.start().await?;

    let status = server.status();
    *state.overlay_server.lock().await = Some(server);

    // Persist so the server comes back with the app.
    if let Ok(mut settings) = get_settings(&state.db_pool) {
        settings.overlay_server_enabled = true;
        settings.overlay_server_port = port;
        if let Err(e) = set_settings(&state.db_pool, &settings) {
            tracing::warn!(error = %e, "Could not persist overlay server settings");
        }
    }

    Ok(status)
}

/// Stops a running overlay server.
///
/// Sends a graceful-shutdown signal and clears the stored handle.
/// Idempotent — safe to call even when no server is running.
#[tauri::command]
pub async fn stop_overlay_server(state: State<'_, AppState>) -> Result<(), String> {
    info!("Stopping overlay server");

    let mut guard = state.overlay_server.lock().await;
    if let Some(ref mut server) = *guard {
        server.stop();
    }
    *guard = None;
    drop(guard);

    if let Ok(mut settings) = get_settings(&state.db_pool) {
        settings.overlay_server_enabled = false;
        if let Err(e) = set_settings(&state.db_pool, &settings) {
            tracing::warn!(error = %e, "Could not persist overlay server settings");
        }
    }

    Ok(())
}

/// Returns the current status of the overlay server.
///
/// When no server has been started, returns `running: false, port: 0,
/// connected_clients: 0`.
#[tauri::command]
pub async fn get_overlay_server_status(
    state: State<'_, AppState>,
) -> Result<OverlayServerStatus, String> {
    let guard = state.overlay_server.lock().await;
    match &*guard {
        Some(server) => Ok(server.status()),
        None => Ok(OverlayServerStatus {
            running: false,
            port: 0,
            connected_clients: 0,
            token: String::new(),
        }),
    }
}

/// Returns a list of available overlay URLs for use as OBS browser sources.
///
/// Each URL carries the server token plus any configured scene
/// customization (title, team names, series length) so one click in
/// Settings yields a ready-to-paste browser source.
///
/// # Errors
///
/// Returns `Err` if the overlay server is not running.
#[tauri::command]
pub async fn get_overlay_urls(
    state: State<'_, AppState>,
    config: Option<OverlaySceneConfig>,
) -> Result<Vec<OverlayUrl>, String> {
    let guard = state.overlay_server.lock().await;
    let (port, token) = match &*guard {
        Some(server) => (server.port(), server.token().to_string()),
        None => return Err("Overlay server is not running".into()),
    };
    drop(guard);

    let configured = config.unwrap_or_default();
    let query = scene_query(&configured, &token);

    #[rustfmt::skip]
    let overlays: &[(&str, &str, &str)] = &[
        ("enhanced",      "Enhanced",      "Broadcast scorebug with rosters, events and goal alerts"),
        ("scoreboard",    "Scoreboard",    "Compact score and clock"),
        ("player-stats",  "Player Stats",  "Live scoreboard table for both teams"),
        ("event-feed",    "Event Feed",    "Goals, saves, assists and demos as they happen"),
        ("alerts",        "Alerts",        "Full-screen goal and play alerts for scene switches"),
        ("all-in-one",    "All-in-One",    "Scoreboard, stats and event feed in a single source"),
    ];

    Ok(overlays
        .iter()
        .map(|(id, name, description)| OverlayUrl {
            id: (*id).to_string(),
            name: (*name).to_string(),
            description: (*description).to_string(),
            url: format!("http://127.0.0.1:{}/overlays/{}?{}", port, id, query),
        })
        .collect())
}

/// Returns the current live match state as a JSON string.
/// Useful for OBS URL/API source plugins that poll for data.
#[tauri::command]
pub async fn get_overlay_state(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let guard = state.overlay_server.lock().await;
    match &*guard {
        Some(server) => {
            let cached = server.latest_state_handle();
            let value = cached.read().await;
            match &*value {
                Some(json) => serde_json::from_str(json).map_err(|e| e.to_string()),
                None => Ok(serde_json::json!({})),
            }
        }
        None => Err("Overlay server is not running".into()),
    }
}
