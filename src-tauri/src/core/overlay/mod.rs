//! OBS overlay streaming server.
//!
//! Provides an HTTP server with WebSocket support that broadcasts
//! live Rocket League match data to overlay clients (OBS browser sources).
//!
//! Architecture:
//! - Axum HTTP server bound to 127.0.0.1 on a configurable port
//! - WebSocket endpoint at `/ws` for real-time event streaming
//! - Static overlay HTML files served via `rust-embed` at `/overlays/{*path}`
//! - `tokio::sync::broadcast` channel for event fan-out to all connected clients
//! - `tokio::sync::watch` for graceful shutdown signaling

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
    Router,
};
use rust_embed::RustEmbed;
use serde::Serialize;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, watch, RwLock};
use tracing::{error, info, warn};

use crate::core::models::LiveMatchState;

// ---------------------------------------------------------------------------
// Embedded overlay assets
// ---------------------------------------------------------------------------

/// Overlay HTML/CSS/JS files served at `/overlays/{*path}`.
///
/// The `overlays/` directory lives at the crate root (alongside `Cargo.toml`).
/// Add `.html` files here and they become available on the overlay server.
#[derive(RustEmbed)]
#[folder = "overlays/"]
struct OverlayAssets;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Read-only status snapshot of the overlay server.
///
/// Returned by Tauri commands so the frontend can display server state.
#[derive(Clone, Debug, Serialize)]
pub struct OverlayServerStatus {
    /// Whether the HTTP server is currently accepting connections.
    pub running: bool,
    /// The TCP port the server is listening on (0 if not running).
    pub port: u16,
    /// Number of WebSocket clients currently connected.
    pub connected_clients: usize,
}

// ---------------------------------------------------------------------------
// OverlayServer
// ---------------------------------------------------------------------------

/// Manages the lifecycle of the overlay HTTP/WebSocket server.
///
/// # Example
///
/// ```ignore
/// let mut server = OverlayServer::new(9528);
/// server.start().await?;
/// server.broadcast_state(&live_match_state);
/// // ... later
/// server.stop();
/// ```
pub struct OverlayServer {
    /// TCP port the server binds to.
    port: u16,

    /// Graceful-shutdown signal. `None` means the server has never been
    /// started or has already been stopped.
    shutdown_tx: Option<watch::Sender<bool>>,

    /// Broadcast channel for pushing events to all connected WebSocket
    /// clients simultaneously.
    event_tx: broadcast::Sender<String>,

    /// Atomically-tracked connected client count (incremented on connect,
    /// decremented on disconnect).
    client_count: Arc<AtomicUsize>,

    /// Cached latest match state as JSON (updated by broadcast_event).
    latest_state: Arc<RwLock<Option<String>>>,

    /// Cached status that mirrors the shutdown signal + port.
    running: bool,
}

impl OverlayServer {
    /// Creates a new overlay server bound to `port`.
    ///
    /// The server is **not** started automatically; call [`start`](Self::start).
    pub fn new(port: u16) -> Self {
        let (event_tx, _) = broadcast::channel::<String>(256);
        Self {
            port,
            shutdown_tx: None,
            event_tx,
            client_count: Arc::new(AtomicUsize::new(0)),
            latest_state: Arc::new(RwLock::new(None)),
            running: false,
        }
    }

    /// Starts the HTTP server on `127.0.0.1:{port}`.
    ///
    /// Spawns a background task that runs until [`stop`](Self::stop) is called
    /// or the shutdown signal is triggered.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the server is already running or if the TCP listener
    /// cannot be bound.
    pub async fn start(&mut self) -> Result<(), String> {
        if self.running {
            return Err("Overlay server is already running".into());
        }

        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        self.shutdown_tx = Some(shutdown_tx);

        let event_tx = self.event_tx.clone();
        let client_count = Arc::clone(&self.client_count);
        let port = self.port;
        let addr = format!("127.0.0.1:{}", port);

        // Build the router.
        let shared_state = Arc::new(AppContext {
            event_tx: event_tx.clone(),
            client_count: client_count.clone(),
            latest_state: self.latest_state_handle(),
        });

        let app = Router::new()
            .route("/ws", get(ws_handler))
            .route("/api/state", get(get_state_handler))
            .route("/sdk/rl-overlay.js", get(serve_sdk))
            .route("/overlays/{*path}", get(serve_overlay))
            .with_state(shared_state);

        let listener = tokio::net::TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;

        self.running = true;

        // Log before spawning so the caller gets immediate feedback.
        info!(%addr, "Overlay server started");

        // Spawn the server on its own task so `start` returns immediately.
        let spawn_addr = addr.clone();
        tokio::spawn(async move {
            info!(%spawn_addr, "Overlay server listening");

            if let Err(e) = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let mut rx = shutdown_rx;
                    loop {
                        // Check current value first, then wait for change.
                        if *rx.borrow() {
                            break;
                        }
                        if rx.changed().await.is_err() {
                            // Sender dropped — treat as shutdown.
                            break;
                        }
                    }
                })
                .await
            {
                error!(%spawn_addr, error = %e, "Overlay server error");
            }

            info!(%spawn_addr, "Overlay server shut down");
        });
        Ok(())
    }

    /// Signals the running server to shut down gracefully.
    ///
    /// Idempotent — calling this multiple times or when the server is not
    /// running is a no-op.
    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(true);
        }
        self.running = false;
        info!("Overlay server stop signal sent");
    }

    /// Broadcasts an arbitrary JSON payload to all connected WebSocket
    /// clients.
    ///
    /// The event is serialized to a string and pushed onto the internal
    /// broadcast channel. Lagged clients see a warning but stay connected.
    pub fn broadcast_event(&self, event: serde_json::Value) {
        // Auto-cache the latest match state for `GET /api/state`. This used to
        // spawn a task per event (20/s) and only matched the "state" type,
        // which nothing sends — the endpoint always returned {}.
        match event.get("type").and_then(|v| v.as_str()) {
            Some("state") => {
                if let Ok(json) = serde_json::to_string(&event) {
                    if let Ok(mut guard) = self.latest_state.try_write() {
                        *guard = Some(json);
                    }
                }
            }
            Some("snapshot") => {
                if let Ok(json) = serde_json::to_string(&event["data"]) {
                    if let Ok(mut guard) = self.latest_state.try_write() {
                        *guard = Some(json);
                    }
                }
            }
            _ => {}
        }

        match serde_json::to_string(&event) {
            Ok(msg) => {
                // `send` returns `Err` only when there are no receivers,
                // which is harmless.
                let _ = self.event_tx.send(msg);
            }
            Err(e) => {
                warn!(error = %e, "Failed to serialize overlay broadcast event");
            }
        }
    }

    /// Convenience wrapper that broadcasts a full `LiveMatchState` snapshot.
    ///
    /// The payload sent on the wire is `{ "type": "snapshot", "data": <state> }`.
    pub fn broadcast_state(&self, state: &LiveMatchState) {
        let event = serde_json::json!({
            "type": "snapshot",
            "data": state
        });
        self.broadcast_event(event);
    }

    pub fn broadcast_goal(&self, scorer_name: &str, team_num: i32) {
        let event = serde_json::json!({
            "type": "goal",
            "data": { "scorerName": scorer_name, "teamNum": team_num }
        });
        self.broadcast_event(event);
    }

    pub fn broadcast_statfeed(
        &self,
        event_name: &str,
        main_target_name: &str,
        main_target_team: i32,
        secondary_target_name: Option<&str>,
        secondary_target_team: Option<i32>,
    ) {
        let event = serde_json::json!({
            "type": "statfeed",
            "data": {
                "eventName": event_name,
                "mainTarget": { "name": main_target_name, "teamNum": main_target_team },
                "secondaryTarget": secondary_target_name.map(|n| serde_json::json!({
                    "name": n,
                    "teamNum": secondary_target_team.unwrap_or(-1)
                }))
            }
        });
        self.broadcast_event(event);
    }

    pub fn broadcast_ball_hit(&self, team_num: i32) {
        let event = serde_json::json!({
            "type": "ball_hit",
            "data": { "teamNum": team_num }
        });
        self.broadcast_event(event);
    }

    pub fn broadcast_clock(&self, time: i32) {
        let event = serde_json::json!({
            "type": "clock",
            "data": { "time": time }
        });
        self.broadcast_event(event);
    }

    pub fn broadcast_match_started(&self) {
        let event = serde_json::json!({ "type": "match_started" });
        self.broadcast_event(event);
    }

    pub fn broadcast_match_ended(&self, winner_team_num: Option<i32>) {
        let event = serde_json::json!({
            "type": "match_ended",
            "data": { "winnerTeamNum": winner_team_num }
        });
        self.broadcast_event(event);
    }

    pub fn broadcast_replay_start(&self) {
        let event = serde_json::json!({ "type": "replay_start" });
        self.broadcast_event(event);
    }

    pub fn broadcast_replay_end(&self) {
        let event = serde_json::json!({ "type": "replay_end" });
        self.broadcast_event(event);
    }

    pub fn broadcast_match_paused(&self) {
        let event = serde_json::json!({ "type": "match_paused" });
        self.broadcast_event(event);
    }

    pub fn broadcast_match_unpaused(&self) {
        let event = serde_json::json!({ "type": "match_unpaused" });
        self.broadcast_event(event);
    }

    /// Returns a clone of the cached state handle for REST API access.
    pub fn latest_state_handle(&self) -> Arc<RwLock<Option<String>>> {
        Arc::clone(&self.latest_state)
    }

    pub fn status(&self) -> OverlayServerStatus {
        OverlayServerStatus {
            running: self.running,
            port: self.port,
            connected_clients: self.client_count.load(Ordering::SeqCst),
        }
    }

    pub fn port(&self) -> u16 {
        self.port
    }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/// Shared application state injected into every Axum handler.
struct AppContext {
    /// Broadcast sender cloned from the `OverlayServer`.
    event_tx: broadcast::Sender<String>,
    /// Shared atomic counter for connected WebSocket clients.
    client_count: Arc<AtomicUsize>,
    /// Cached latest match state for REST API consumers.
    latest_state: Arc<RwLock<Option<String>>>,
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/// Upgrades an HTTP request to a WebSocket connection at `/ws`.
async fn ws_handler(
    ws: WebSocketUpgrade,
    axum::extract::State(state): axum::extract::State<Arc<AppContext>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

/// Manages the lifecycle of a single WebSocket client.
///
/// On connect the client receives a `{"type":"connected"}` handshake message,
/// then all subsequent broadcast events are streamed to it. The connection
/// stays open until the client disconnects or the broadcast channel closes.
async fn handle_ws(mut socket: WebSocket, state: Arc<AppContext>) {
    state.client_count.fetch_add(1, Ordering::SeqCst);
    info!(
        total = state.client_count.load(Ordering::SeqCst),
        "WebSocket client connected"
    );

    // Handshake message so the client knows the connection is live.
    let connected = serde_json::json!({"type": "connected"});
    if let Ok(msg) = serde_json::to_string(&connected) {
        if socket.send(Message::Text(msg.into())).await.is_err() {
            state.client_count.fetch_sub(1, Ordering::SeqCst);
            return;
        }
    }

    let mut rx = state.event_tx.subscribe();

    loop {
        tokio::select! {
            // Broadcast relay — forward every event from the channel.
            result = rx.recv() => {
                match result {
                    Ok(msg) => {
                        if socket.send(Message::Text(msg.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        warn!(skipped, "WebSocket client lagging; skipped messages");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }

            // Client frames — handle pings and detect disconnects.
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Ping(data))) if socket.send(Message::Pong(data.clone())).await.is_err() => {
                        break;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    // Ignore other message types (text, binary, pong).
                    _ => {}
                }
            }
        }
    }

    state.client_count.fetch_sub(1, Ordering::SeqCst);
    info!(
        total = state.client_count.load(Ordering::SeqCst),
        "WebSocket client disconnected"
    );
}

/// Serves embedded overlay files from `overlays/` at `/overlays/{*path}`.
///
/// File extensions are inferred from the path; if a file is not found, we
/// try appending `.html` before returning a 404.
async fn serve_overlay(
    axum::extract::Path(path): axum::extract::Path<String>,
) -> impl IntoResponse {
    let path = path.trim_start_matches('/');

    // Direct match first.
    if let Some(content) = OverlayAssets::get(path) {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        return (
            [(axum::http::header::CONTENT_TYPE, mime.as_ref())],
            content.data.to_vec(),
        )
            .into_response();
    }

    // Fallback: try appending .html for clean URLs.
    let html_path = format!("{}.html", path);
    if let Some(content) = OverlayAssets::get(&html_path) {
        return (
            [(axum::http::header::CONTENT_TYPE, "text/html")],
            content.data.to_vec(),
        )
            .into_response();
    }

    (axum::http::StatusCode::NOT_FOUND, "Overlay not found").into_response()
}

/// Returns the latest cached match state as JSON at `GET /api/state`.
async fn get_state_handler(
    axum::extract::State(state): axum::extract::State<Arc<AppContext>>,
) -> impl IntoResponse {
    let guard = state.latest_state.read().await;
    match &*guard {
        Some(json) => (
            axum::http::StatusCode::OK,
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            json.clone(),
        )
            .into_response(),
        None => (
            axum::http::StatusCode::OK,
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            "{}",
        )
            .into_response(),
    }
}

/// Serves the overlay SDK JavaScript file at `GET /sdk/rl-overlay.js`.
async fn serve_sdk() -> impl IntoResponse {
    match OverlayAssets::get("rl-overlay-sdk.js") {
        Some(content) => (
            [(axum::http::header::CONTENT_TYPE, "application/javascript")],
            content.data.to_vec(),
        )
            .into_response(),
        None => (axum::http::StatusCode::NOT_FOUND, "SDK not found").into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_server_starts_stopped_with_empty_state() {
        let server = OverlayServer::new(9528);
        let status = server.status();
        assert!(!status.running);
        assert_eq!(status.port, 9528);
        assert_eq!(status.connected_clients, 0);
        assert_eq!(server.port(), 9528);
    }

    #[test]
    fn status_reports_connected_client_count() {
        let server = OverlayServer::new(0);
        let _ = server.client_count.fetch_add(2, Ordering::SeqCst);
        assert_eq!(server.status().connected_clients, 2);
    }

    #[test]
    fn stop_without_start_is_idempotent() {
        let mut server = OverlayServer::new(9528);
        server.stop();
        server.stop();
        assert!(!server.status().running);
    }

    #[tokio::test]
    async fn start_rejects_when_already_running_without_binding() {
        let mut server = OverlayServer::new(0);
        server.running = true;
        let error = server.start().await.unwrap_err();
        assert_eq!(error, "Overlay server is already running");
    }

    #[test]
    fn broadcast_goal_reaches_subscribers_with_payload() {
        let server = OverlayServer::new(0);
        let mut rx = server.event_tx.subscribe();
        server.broadcast_goal("Alice", 1);

        let message = rx
            .try_recv()
            .expect("broadcast should reach the subscriber");
        let value: serde_json::Value = serde_json::from_str(&message).unwrap();
        assert_eq!(value["type"], "goal");
        assert_eq!(value["data"]["scorerName"], "Alice");
        assert_eq!(value["data"]["teamNum"], 1);
    }

    #[test]
    fn broadcast_statfeed_serializes_optional_secondary_target() {
        let server = OverlayServer::new(0);
        let mut rx = server.event_tx.subscribe();

        server.broadcast_statfeed("Save", "Bob", 0, None, None);
        let without_secondary: serde_json::Value =
            serde_json::from_str(&rx.try_recv().unwrap()).unwrap();
        assert_eq!(without_secondary["data"]["eventName"], "Save");
        assert_eq!(without_secondary["data"]["mainTarget"]["name"], "Bob");
        assert!(without_secondary["data"]["secondaryTarget"].is_null());

        server.broadcast_statfeed("Goal", "Bob", 0, Some("Carol"), Some(1));
        let with_secondary: serde_json::Value =
            serde_json::from_str(&rx.try_recv().unwrap()).unwrap();
        assert_eq!(with_secondary["data"]["secondaryTarget"]["name"], "Carol");
        assert_eq!(with_secondary["data"]["secondaryTarget"]["teamNum"], 1);
    }

    #[tokio::test]
    async fn broadcast_state_caches_snapshot_for_api() {
        let server = OverlayServer::new(0);
        let state = LiveMatchState {
            match_guid: Some("guid-1".into()),
            score_blue: 2,
            score_orange: 1,
            ..Default::default()
        };
        let expected: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&state).unwrap()).unwrap();

        server.broadcast_state(&state);

        let handle = server.latest_state_handle();
        let cached = handle.read().await;
        let cached: serde_json::Value = serde_json::from_str(cached.as_deref().unwrap()).unwrap();
        assert_eq!(cached, expected);
    }

    #[tokio::test]
    async fn state_event_caches_full_event_payload() {
        let server = OverlayServer::new(0);
        server.broadcast_event(serde_json::json!({"type": "state", "foo": 1}));

        let handle = server.latest_state_handle();
        let cached = handle.read().await;
        let value: serde_json::Value = serde_json::from_str(cached.as_deref().unwrap()).unwrap();
        assert_eq!(value["type"], "state");
        assert_eq!(value["foo"], 1);
    }

    #[tokio::test]
    async fn unrelated_event_does_not_touch_cached_state() {
        let server = OverlayServer::new(0);
        server.broadcast_ball_hit(0);

        let handle = server.latest_state_handle();
        assert!(handle.read().await.is_none());
    }
}
