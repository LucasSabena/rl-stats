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
//!
//! # Wire contract
//!
//! Every message is a JSON object with a `type` and an optional `data`
//! payload. The canonical full-state event is `state` (camelCase payload);
//! the SDK also accepts the legacy `snapshot` alias so overlays written
//! against the old server keep working:
//!
//! ```json
//! { "type": "state", "data": { "scoreBlue": 2, "timeRemaining": 143, ... } }
//! ```
//!
//! # Security
//!
//! The server is loopback-only, but a malicious page could still open a
//! WebSocket to `127.0.0.1`. Browsers always send an `Origin` header on
//! WebSocket handshakes, so:
//! - requests from one of our own overlay origins are accepted;
//! - browser requests from any other origin are rejected;
//! - non-browser clients (no `Origin`) are accepted, and
//! - a per-run bearer token (`?token=...`) is accepted from any origin and
//!   is required for `file://` overlays, whose origin is sent as `null`.
//!
//! Responses served to browser sources carry a strict CSP plus `nosniff`
//! and `frame-ancestors 'none'`.

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, watch, RwLock};
use tracing::{error, info, warn};

use crate::core::models::{LiveMatchState, LivePlayer};

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
#[serde(rename_all = "camelCase")]
pub struct OverlayServerStatus {
    /// Whether the HTTP server is currently accepting connections.
    pub running: bool,
    /// The TCP port the server is listening on (0 if not running).
    pub port: u16,
    /// Number of WebSocket clients currently connected.
    pub connected_clients: usize,
    /// Bearer token for custom (`file://`) overlays. Empty when stopped.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub token: String,
}

/// Canonical overlay payload. Mirrors [`LiveMatchState`] but serializes to
/// camelCase, matching the documented SDK contract and every bundled asset.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OverlayState<'a> {
    match_guid: &'a Option<String>,
    arena: &'a Option<String>,
    is_online: bool,
    is_overtime: bool,
    time_remaining: i32,
    score_blue: i32,
    score_orange: i32,
    players: Vec<&'a LivePlayer>,
    ball_speed: f64,
    player_count: usize,
    match_type: &'a Option<String>,
    last_touch_team: Option<i32>,
    playlist_id: Option<i32>,
    training_elapsed_seconds: Option<i64>,
}

impl<'a> From<&'a LiveMatchState> for OverlayState<'a> {
    fn from(state: &'a LiveMatchState) -> Self {
        Self {
            match_guid: &state.match_guid,
            arena: &state.arena,
            is_online: state.is_online,
            is_overtime: state.is_overtime,
            time_remaining: state.time_remaining,
            score_blue: state.score_blue,
            score_orange: state.score_orange,
            players: state.players.iter().collect(),
            ball_speed: state.ball_speed,
            player_count: state.player_count,
            match_type: &state.match_type,
            last_touch_team: state.last_touch_team,
            playlist_id: state.playlist_id,
            training_elapsed_seconds: state.training_elapsed_seconds,
        }
    }
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

    /// Cached latest match state as JSON (updated by broadcast_state).
    latest_state: Arc<RwLock<Option<String>>>,

    /// Per-run bearer token accepted by `/ws` and `/api/state`. Required for
    /// overlays loaded from `file://` (their browser origin is `null`).
    token: Arc<String>,

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
            token: Arc::new(uuid::Uuid::new_v4().simple().to_string()),
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
            token: Arc::clone(&self.token),
            port,
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
        // Cache full-state events so late joiners and `GET /api/state`
        // consumers get the current match immediately.
        if event.get("type").and_then(|v| v.as_str()) == Some("state") {
            if let Ok(json) = serde_json::to_string(&event["data"]) {
                if let Ok(mut guard) = self.latest_state.try_write() {
                    *guard = Some(json);
                }
            }
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
    /// The payload sent on the wire is `{ "type": "state", "data": <camelCase state> }`.
    pub fn broadcast_state(&self, state: &LiveMatchState) {
        let event = serde_json::json!({
            "type": "state",
            "data": OverlayState::from(state)
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

    /// Broadcasts a ball touch. `team_num` is the team that made the touch
    /// (`-1` when the stream did not report one).
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

    /// Signals a kickoff countdown so overlays can play their intro.
    pub fn broadcast_countdown_begin(&self) {
        let event = serde_json::json!({ "type": "countdown_begin" });
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
            token: if self.running {
                (*self.token).clone()
            } else {
                String::new()
            },
        }
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn token(&self) -> &str {
        &self.token
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
    /// Bearer token accepted by protected endpoints.
    token: Arc<String>,
    /// Bound port, used to build the same-origin allowlist.
    port: u16,
}

/// Optional `?token=` query parameter.
#[derive(Debug, Default, Deserialize)]
struct AuthQuery {
    #[serde(default)]
    token: Option<String>,
}

/// Whether `origin` is one of our own overlay origins.
fn is_self_origin(origin: &str, port: u16) -> bool {
    matches!(
        origin,
        o if o == format!("http://127.0.0.1:{port}")
            || o == format!("http://localhost:{port}")
            || o == format!("http://[::1]:{port}")
    )
}

/// Authorizes a request against the token + origin allowlist.
///
/// - A valid `?token=` always authorizes (needed for `file://` overlays).
/// - A browser `Origin` header must be one of our own origins.
/// - Requests without an `Origin` header are non-browser clients (OBS API
///   sources, curl, the SDK from a local process) and are allowed.
/// - `Origin: null` (sandboxed iframes, data: URLs, `file://`) is rejected
///   unless the token matches.
fn authorize(headers: &HeaderMap, query: &AuthQuery, ctx: &AppContext) -> bool {
    if let Some(token) = &query.token {
        return token == &*ctx.token;
    }
    match headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        Some(origin) => is_self_origin(origin, ctx.port),
        None => true,
    }
}

/// Attaches hardening headers to an HTML/JS response.
fn with_security_headers(mut response: Response, content_type: &str) -> Response {
    let headers = response.headers_mut();
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store, max-age=0"),
    );
    if content_type.starts_with("text/html") {
        // Overlays are self-contained and inline their scripts/styles, so
        // inline execution is allowed; everything remote is not. The
        // `ws://127.0.0.1:*` source keeps WebSocket connections working
        // across ports even when a custom port is configured.
        headers.insert(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static(
                "default-src 'self'; \
                 script-src 'self' 'unsafe-inline'; \
                 style-src 'self' 'unsafe-inline'; \
                 img-src 'self' data:; \
                 font-src 'self'; \
                 connect-src 'self' ws://127.0.0.1:* ws://localhost:*; \
                 media-src 'self'; \
                 object-src 'none'; \
                 base-uri 'none'; \
                 frame-ancestors 'none'",
            ),
        );
        headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    }
    response
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/// Upgrades an HTTP request to a WebSocket connection at `/ws`.
async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<AuthQuery>,
    headers: HeaderMap,
    State(state): State<Arc<AppContext>>,
) -> impl IntoResponse {
    if !authorize(&headers, &query, &state) {
        warn!("Rejected overlay WebSocket connection (origin/token mismatch)");
        return StatusCode::FORBIDDEN.into_response();
    }
    ws.on_upgrade(move |socket| handle_ws(socket, state))
        .into_response()
}

/// Manages the lifecycle of a single WebSocket client.
///
/// On connect the client receives a `{"type":"connected"}` handshake message
/// followed by the cached `state` (if any), then all subsequent broadcast
/// events are streamed to it. The connection stays open until the client
/// disconnects or the broadcast channel closes.
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

    // Late joiners get the current match immediately instead of waiting for
    // the next snapshot (OBS scenes re-load browser sources on every switch).
    {
        let cached = state.latest_state.read().await;
        if let Some(data) = &*cached {
            let event = serde_json::json!({
                "type": "state",
                "data": serde_json::from_str::<serde_json::Value>(data).unwrap_or_default()
            });
            if let Ok(msg) = serde_json::to_string(&event) {
                if socket.send(Message::Text(msg.into())).await.is_err() {
                    state.client_count.fetch_sub(1, Ordering::SeqCst);
                    return;
                }
            }
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
        let response = (
            [(header::CONTENT_TYPE, mime.as_ref())],
            content.data.to_vec(),
        )
            .into_response();
        return with_security_headers(response, mime.as_ref());
    }

    // Fallback: try appending .html for clean URLs.
    let html_path = format!("{}.html", path);
    if let Some(content) = OverlayAssets::get(&html_path) {
        let response =
            ([(header::CONTENT_TYPE, "text/html")], content.data.to_vec()).into_response();
        return with_security_headers(response, "text/html");
    }

    (StatusCode::NOT_FOUND, "Overlay not found").into_response()
}

/// Returns the latest cached match state as JSON at `GET /api/state`.
async fn get_state_handler(
    Query(query): Query<AuthQuery>,
    headers: HeaderMap,
    State(state): State<Arc<AppContext>>,
) -> impl IntoResponse {
    if !authorize(&headers, &query, &state) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let guard = state.latest_state.read().await;
    let body = guard.clone().unwrap_or_else(|| "{}".to_string());
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "no-store, max-age=0"),
        ],
        body,
    )
        .into_response()
}

/// Serves the overlay SDK JavaScript file at `GET /sdk/rl-overlay.js`.
async fn serve_sdk() -> impl IntoResponse {
    match OverlayAssets::get("rl-overlay-sdk.js") {
        Some(content) => {
            let response = (
                [(header::CONTENT_TYPE, "application/javascript")],
                content.data.to_vec(),
            )
                .into_response();
            with_security_headers(response, "application/javascript")
        }
        None => (StatusCode::NOT_FOUND, "SDK not found").into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::models::LivePlayer;

    fn context(port: u16, token: &str) -> AppContext {
        let (event_tx, _) = broadcast::channel::<String>(16);
        AppContext {
            event_tx,
            client_count: Arc::new(AtomicUsize::new(0)),
            latest_state: Arc::new(RwLock::new(None)),
            token: Arc::new(token.to_string()),
            port,
        }
    }

    fn headers(origin: Option<&str>) -> HeaderMap {
        let mut map = HeaderMap::new();
        if let Some(origin) = origin {
            map.insert(header::ORIGIN, HeaderValue::from_str(origin).unwrap());
        }
        map
    }

    #[test]
    fn new_server_starts_stopped_with_empty_state() {
        let server = OverlayServer::new(9528);
        let status = server.status();
        assert!(!status.running);
        assert_eq!(status.port, 9528);
        assert_eq!(status.connected_clients, 0);
        assert_eq!(server.port(), 9528);
        assert!(status.token.is_empty());
    }

    #[test]
    fn token_is_generated_and_exposed_while_running() {
        let mut server = OverlayServer::new(9528);
        server.running = true;
        let status = server.status();
        assert!(!status.token.is_empty());
        assert_eq!(status.token, server.token());
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
    fn authorize_allows_token_and_self_origin_and_bare_clients() {
        let ctx = context(9528, "secret");
        let token = AuthQuery {
            token: Some("secret".into()),
        };
        assert!(authorize(&headers(Some("https://evil.com")), &token, &ctx));

        let none = AuthQuery::default();
        assert!(authorize(
            &headers(Some("http://127.0.0.1:9528")),
            &none,
            &ctx
        ));
        assert!(authorize(
            &headers(Some("http://localhost:9528")),
            &none,
            &ctx
        ));
        assert!(authorize(&headers(None), &none, &ctx));
    }

    #[test]
    fn authorize_rejects_foreign_origin_and_null_origin_without_token() {
        let ctx = context(9528, "secret");
        let none = AuthQuery::default();
        assert!(!authorize(&headers(Some("https://evil.com")), &none, &ctx));
        assert!(!authorize(
            &headers(Some("http://127.0.0.1:9999")),
            &none,
            &ctx
        ));
        assert!(!authorize(&headers(Some("null")), &none, &ctx));

        let wrong = AuthQuery {
            token: Some("nope".into()),
        };
        assert!(!authorize(&headers(Some("null")), &wrong, &ctx));
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

    #[test]
    fn broadcast_ball_hit_carries_team() {
        let server = OverlayServer::new(0);
        let mut rx = server.event_tx.subscribe();
        server.broadcast_ball_hit(1);
        let value: serde_json::Value = serde_json::from_str(&rx.try_recv().unwrap()).unwrap();
        assert_eq!(value["type"], "ball_hit");
        assert_eq!(value["data"]["teamNum"], 1);
    }

    #[test]
    fn broadcast_countdown_begin_emits_type() {
        let server = OverlayServer::new(0);
        let mut rx = server.event_tx.subscribe();
        server.broadcast_countdown_begin();
        let value: serde_json::Value = serde_json::from_str(&rx.try_recv().unwrap()).unwrap();
        assert_eq!(value["type"], "countdown_begin");
    }

    #[tokio::test]
    async fn broadcast_state_emits_camel_case_state_event() {
        let server = OverlayServer::new(0);
        let mut rx = server.event_tx.subscribe();
        let state = LiveMatchState {
            match_guid: Some("guid-1".into()),
            score_blue: 2,
            score_orange: 1,
            is_online: true,
            time_remaining: 143,
            players: vec![LivePlayer {
                name: "Alice".into(),
                ..Default::default()
            }],
            ..Default::default()
        };

        server.broadcast_state(&state);

        let event: serde_json::Value = serde_json::from_str(&rx.try_recv().unwrap()).unwrap();
        assert_eq!(event["type"], "state");
        assert_eq!(event["data"]["scoreBlue"], 2);
        assert_eq!(event["data"]["scoreOrange"], 1);
        assert_eq!(event["data"]["timeRemaining"], 143);
        assert_eq!(event["data"]["isOnline"], true);
        assert_eq!(event["data"]["matchGuid"], "guid-1");
        assert_eq!(event["data"]["players"][0]["name"], "Alice");

        // The cached payload is exactly the `data` object (REST consumer shape).
        let handle = server.latest_state_handle();
        let cached = handle.read().await;
        let cached: serde_json::Value = serde_json::from_str(cached.as_deref().unwrap()).unwrap();
        assert_eq!(cached["scoreBlue"], 2);
        assert!(cached.get("type").is_none());
    }

    #[tokio::test]
    async fn unrelated_event_does_not_touch_cached_state() {
        let server = OverlayServer::new(0);
        server.broadcast_ball_hit(0);

        let handle = server.latest_state_handle();
        assert!(handle.read().await.is_none());
    }
}
