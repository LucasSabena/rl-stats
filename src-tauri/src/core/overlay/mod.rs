//! OBS overlay streaming server.
//!
//! Provides an HTTP server with WebSocket support that broadcasts live
//! Rocket League match data, chat and broadcast-state events to overlay
//! clients (OBS browser sources), the Control Room dock and third-party tools.
//!
//! Architecture:
//! - Axum HTTP server bound to 127.0.0.1 (or 0.0.0.0 in LAN mode)
//! - WebSocket endpoint at `/ws` for real-time event streaming
//! - Static overlay HTML files served via `rust-embed` at `/overlays/{*path}`
//! - Uploaded assets served at `/assets/{*path}` from the app data directory
//! - A [`BroadcastHub`](crate::core::broadcast::BroadcastHub) owns the
//!   fan-out channel so chat, tournament state and the game loop all feed the
//!   same stream
//! - `tokio::sync::watch` for graceful shutdown signaling
//!
//! # Wire contract
//!
//! Every message is a JSON object with a `type` and an optional `data`
//! payload, wrapped in a v2 envelope (`v`, `seq`, `ts`) that legacy clients
//! ignore. The canonical full-state event is `state` (camelCase payload).
//!
//! # Security
//!
//! Browser pages can open a WebSocket to `127.0.0.1`, so:
//! - requests from one of our own overlay origins are accepted;
//! - browser requests from any other origin need a valid token;
//! - non-browser clients (no `Origin`) are trusted as local;
//! - tokens are role-scoped (`admin`, `referee`, `viewer`) and persisted, so
//!   OBS URLs do not break across restarts.

pub mod assets;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Json, Path, Query, State,
    },
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{broadcast, watch, RwLock};
use tracing::{error, info, warn};

use crate::core::broadcast::packs::{builtin_packs, default_layout_for_state, font_options};
use crate::core::broadcast::{store, ActionRequest, BroadcastHub};
use crate::core::models::{LiveMatchState, LivePlayer, LiveTarget, TeamInfo};
use crate::core::overlay::assets::AssetStore;
use crate::core::storage::{self, DbPool};

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
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayServerStatus {
    /// Whether the HTTP server is currently accepting connections.
    pub running: bool,
    /// The TCP port the server is listening on (0 if not running).
    pub port: u16,
    /// Number of WebSocket clients currently connected.
    pub connected_clients: usize,
    /// Persistent admin token used to build overlay URLs.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub token: String,
    /// Whether the server listens on all interfaces (LAN tournament mode).
    pub bind_lan: bool,
    /// Broadcast delay applied to the overlay feed, in seconds.
    pub delay_seconds: u64,
    /// Currently active broadcast state (`waiting`, `live`, ...).
    pub active_state: String,
}

/// A role-scoped access token.
#[derive(Clone, Debug, PartialEq)]
pub struct AuthToken {
    pub token: String,
    pub role: String,
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
    teams: &'a [TeamInfo],
    target: Option<&'a LiveTarget>,
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
            teams: &state.teams,
            target: state.target.as_ref(),
            playlist_id: state.playlist_id,
            training_elapsed_seconds: state.training_elapsed_seconds,
        }
    }
}

// ---------------------------------------------------------------------------
// OverlayServer
// ---------------------------------------------------------------------------

/// Manages the lifecycle of the overlay HTTP/WebSocket server.
pub struct OverlayServer {
    /// TCP port the server binds to.
    port: u16,

    /// Graceful-shutdown signal. `None` means the server has never been
    /// started or has already been stopped.
    shutdown_tx: Option<watch::Sender<bool>>,

    /// Shared event fan-out (also used by chat and the Control Room).
    hub: BroadcastHub,

    /// Role-scoped tokens accepted by protected endpoints.
    tokens: Arc<RwLock<Vec<AuthToken>>>,

    /// Uploaded assets directory. `None` disables `/assets`.
    assets_dir: Option<std::path::PathBuf>,

    /// Whether to bind on all interfaces instead of loopback only.
    bind_lan: bool,

    /// Active broadcast state, published to overlays on change.
    active_state: Arc<RwLock<String>>,

    /// Cached status that mirrors the shutdown signal + port.
    running: bool,

    /// Profile database handle for the local API. `None` in tests.
    db_pool: Option<Arc<DbPool>>,
}

impl OverlayServer {
    /// Creates a new overlay server bound to `port` with a private hub.
    pub fn new(port: u16) -> Self {
        Self::with_hub(port, BroadcastHub::new())
    }

    /// Creates a server that shares the application-wide broadcast hub.
    pub fn with_hub(port: u16, hub: BroadcastHub) -> Self {
        Self {
            port,
            shutdown_tx: None,
            hub,
            tokens: Arc::new(RwLock::new(Vec::new())),
            assets_dir: None,
            bind_lan: false,
            active_state: Arc::new(RwLock::new("waiting".to_string())),
            running: false,
            db_pool: None,
        }
    }

    /// Attaches the profile database used by the local API routes.
    pub fn set_db_pool(&mut self, pool: Arc<DbPool>) {
        self.db_pool = Some(pool);
    }

    /// Replaces the accepted tokens (persisted tokens live in the database).
    pub fn set_tokens(&mut self, tokens: Vec<AuthToken>) {
        if let Ok(mut guard) = self.tokens.try_write() {
            *guard = tokens;
        }
    }

    /// Enables `/assets` serving from `dir`.
    pub fn set_assets_dir(&mut self, dir: std::path::PathBuf) {
        self.assets_dir = Some(dir);
    }

    pub fn set_bind_lan(&mut self, bind_lan: bool) {
        self.bind_lan = bind_lan;
    }

    pub fn set_active_state(&self, state: &str) {
        if let Ok(mut guard) = self.active_state.try_write() {
            *guard = state.to_string();
        }
    }

    /// The shared hub, so other subsystems can publish on the same stream.
    pub fn hub(&self) -> &BroadcastHub {
        &self.hub
    }

    /// Starts the HTTP server.
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

        let port = self.port;
        let host = if self.bind_lan {
            "0.0.0.0"
        } else {
            "127.0.0.1"
        };
        let addr = format!("{host}:{port}");

        let assets = self.assets_dir.clone().map(AssetStore::new);

        let shared_state = Arc::new(AppContext {
            hub: self.hub.clone(),
            port,
            tokens: Arc::clone(&self.tokens),
            assets,
            db_pool: self.db_pool.clone(),
            active_state: Arc::clone(&self.active_state),
        });

        let app = Router::new()
            .route("/ws", get(ws_handler))
            .route("/health", get(health_handler))
            .route("/dock", get(serve_dock))
            .route("/api/state", get(get_state_handler))
            .route("/api/v1/matches", get(v1_matches_handler))
            .route("/api/v1/stats", get(v1_stats_handler))
            .route("/api/v2/packs", get(v2_packs_handler))
            .route("/api/v2/scene", get(v2_scene_handler))
            .route("/api/v2/series", get(v2_series_handler))
            .route("/api/v2/teams", get(v2_teams_handler))
            .route("/api/v2/tournament", get(v2_tournament_handler))
            .route("/api/v2/session", get(v2_session_handler))
            .route("/api/v2/action", post(v2_action_handler))
            .route("/sdk/rl-overlay.js", get(serve_sdk))
            .route("/assets/{*path}", get(serve_asset))
            .route("/overlays/{*path}", get(serve_overlay))
            .with_state(shared_state);

        let listener = tokio::net::TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;

        self.running = true;
        info!(%addr, lan = self.bind_lan, "Overlay server started");

        // Delay flusher: re-emits events queued by the broadcast delay.
        {
            let hub = self.hub.clone();
            let mut shutdown_rx = shutdown_rx.clone();
            tokio::spawn(async move {
                let mut tick = tokio::time::interval(tokio::time::Duration::from_millis(200));
                tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
                loop {
                    tokio::select! {
                        _ = tick.tick() => {
                            hub.flush_due();
                        }
                        _ = shutdown_rx.changed() => break,
                    }
                }
            });
        }

        let spawn_addr = addr.clone();
        let hub = self.hub.clone();
        tokio::spawn(async move {
            info!(%spawn_addr, "Overlay server listening");

            if let Err(e) = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let mut rx = shutdown_rx;
                    loop {
                        if *rx.borrow() {
                            break;
                        }
                        if rx.changed().await.is_err() {
                            break;
                        }
                    }
                })
                .await
            {
                error!(%spawn_addr, error = %e, "Overlay server error");
            }

            hub.publish_typed("server_stopped", None);
            info!(%spawn_addr, "Overlay server shut down");
        });
        Ok(())
    }

    /// Signals the running server to shut down gracefully.
    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(true);
        }
        self.running = false;
        info!("Overlay server stop signal sent");
    }

    /// Broadcasts an arbitrary JSON payload through the shared hub.
    pub fn broadcast_event(&self, event: serde_json::Value) {
        self.hub.publish(event);
    }

    /// Convenience wrapper that broadcasts a full `LiveMatchState` snapshot.
    pub fn broadcast_state(&self, state: &LiveMatchState) {
        self.hub.publish(serde_json::json!({
            "type": "state",
            "data": OverlayState::from(state)
        }));
    }

    pub fn broadcast_goal(&self, scorer_name: &str, team_num: i32) {
        self.hub.publish(serde_json::json!({
            "type": "goal",
            "data": { "scorerName": scorer_name, "teamNum": team_num }
        }));
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
        self.hub.publish(event);
    }

    /// A shot hit the crossbar (a fan-favorite broadcast moment).
    pub fn broadcast_crossbar(&self, player_name: &str, team_num: i32) {
        self.hub.publish(serde_json::json!({
            "type": "crossbar",
            "data": { "playerName": player_name, "teamNum": team_num }
        }));
    }

    pub fn broadcast_ball_hit(&self, team_num: i32) {
        self.hub.publish(serde_json::json!({
            "type": "ball_hit",
            "data": { "teamNum": team_num }
        }));
    }

    pub fn broadcast_clock(&self, time: i32) {
        self.hub.publish(serde_json::json!({
            "type": "clock",
            "data": { "time": time }
        }));
    }

    pub fn broadcast_match_started(&self) {
        self.hub.publish_typed("match_started", None);
    }

    pub fn broadcast_match_ended(&self, winner_team_num: Option<i32>) {
        self.hub.publish(serde_json::json!({
            "type": "match_ended",
            "data": { "winnerTeamNum": winner_team_num }
        }));
    }

    pub fn broadcast_replay_start(&self) {
        self.hub.publish_typed("replay_start", None);
    }

    pub fn broadcast_replay_end(&self) {
        self.hub.publish_typed("replay_end", None);
    }

    pub fn broadcast_match_paused(&self) {
        self.hub.publish_typed("match_paused", None);
    }

    pub fn broadcast_match_unpaused(&self) {
        self.hub.publish_typed("match_unpaused", None);
    }

    /// Signals a kickoff countdown so overlays can play their intro.
    pub fn broadcast_countdown_begin(&self) {
        self.hub.publish_typed("countdown_begin", None);
    }

    /// Returns a clone of the cached state handle for REST API access.
    pub fn latest_state_handle(&self) -> &BroadcastHub {
        &self.hub
    }

    pub fn status(&self) -> OverlayServerStatus {
        let token = self
            .tokens
            .try_read()
            .ok()
            .and_then(|tokens| {
                tokens
                    .iter()
                    .find(|token| token.role == "admin")
                    .map(|token| token.token.clone())
            })
            .unwrap_or_default();
        let active_state = self
            .active_state
            .try_read()
            .map(|state| state.clone())
            .unwrap_or_else(|_| "waiting".to_string());
        OverlayServerStatus {
            running: self.running,
            port: self.port,
            connected_clients: self.hub.client_count(),
            token: if self.running { token } else { String::new() },
            bind_lan: self.bind_lan,
            delay_seconds: self.hub.delay_seconds(),
            active_state,
        }
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// The first admin token, used by the frontend to build overlay URLs.
    pub fn token(&self) -> String {
        self.tokens
            .try_read()
            .ok()
            .and_then(|tokens| {
                tokens
                    .iter()
                    .find(|token| token.role == "admin")
                    .map(|token| token.token.clone())
            })
            .unwrap_or_default()
    }

    pub fn delay_seconds(&self) -> u64 {
        self.hub.delay_seconds()
    }

    pub fn set_delay_seconds(&self, seconds: u64) {
        self.hub.set_delay_seconds(seconds);
    }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/// Shared application state injected into every Axum handler.
struct AppContext {
    hub: BroadcastHub,
    port: u16,
    tokens: Arc<RwLock<Vec<AuthToken>>>,
    assets: Option<AssetStore>,
    db_pool: Option<Arc<DbPool>>,
    active_state: Arc<RwLock<String>>,
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

/// Resolves the calling role: `Some("local")` for own-origin/no-origin
/// requests, the token role for valid tokens, `None` when unauthorized.
fn authorize(headers: &HeaderMap, query: &AuthQuery, ctx: &AppContext) -> Option<String> {
    let header_token = headers
        .get("x-rl-token")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let token = query.token.clone().or(header_token);

    if let Some(token) = token {
        if let Ok(tokens) = ctx.tokens.try_read() {
            if let Some(found) = tokens.iter().find(|candidate| candidate.token == token) {
                return Some(found.role.clone());
            }
        }
        return None;
    }

    match headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        Some(origin) => is_self_origin(origin, ctx.port).then(|| "local".to_string()),
        None => Some("local".to_string()),
    }
}

/// Whether a role may dispatch an operator action.
fn role_can_act(role: &str, action: &str) -> bool {
    match role {
        "local" | "admin" => true,
        "referee" => matches!(
            action,
            "set_state"
                | "series_score"
                | "series_game"
                | "set_delay"
                | "take_graphic"
                | "out_graphic"
                | "timer"
                | "game_command"
        ),
        _ => false,
    }
}

/// Attaches hardening headers to an HTML/JS response.
///
/// `frame-ancestors` allows our own pages only (the Tauri app previews
/// overlays in an iframe), which replaces the old blanket
/// `X-Frame-Options: DENY` that blocked the in-app preview.
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
        headers.insert(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static(
                "default-src 'self'; \
                 script-src 'self' 'unsafe-inline'; \
                 style-src 'self' 'unsafe-inline'; \
                 img-src 'self' data: https://static-cdn.jtvnw.net https://files.kick.com; \
                 font-src 'self' data:; \
                 connect-src 'self' ws://127.0.0.1:* ws://localhost:*; \
                 media-src 'self'; \
                 object-src 'none'; \
                 base-uri 'none'; \
                 frame-ancestors 'self' http://tauri.localhost https://tauri.localhost \
                 tauri://localhost http://localhost:1420 http://127.0.0.1:1420",
            ),
        );
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
    let Some(role) = authorize(&headers, &query, &state) else {
        warn!("Rejected overlay WebSocket connection (origin/token mismatch)");
        return StatusCode::FORBIDDEN.into_response();
    };
    ws.on_upgrade(move |socket| handle_ws(socket, state, role))
        .into_response()
}

/// Manages the lifecycle of a single WebSocket client.
async fn handle_ws(mut socket: WebSocket, state: Arc<AppContext>, role: String) {
    state.hub.client_connected();
    info!(
        total = state.hub.client_count(),
        %role,
        "WebSocket client connected"
    );

    let connected = serde_json::json!({
        "type": "connected",
        "data": { "role": role, "delay": state.hub.delay_seconds() }
    });
    if let Ok(msg) = serde_json::to_string(&connected) {
        if socket.send(Message::Text(msg.into())).await.is_err() {
            state.hub.client_disconnected();
            return;
        }
    }

    // Late joiners get the current match immediately instead of waiting for
    // the next snapshot (OBS scenes re-load browser sources on every switch).
    if let Some(data) = state.hub.cached_state() {
        let event = serde_json::json!({
            "type": "state",
            "data": serde_json::from_str::<serde_json::Value>(&data).unwrap_or_default()
        });
        if let Ok(msg) = serde_json::to_string(&event) {
            if socket.send(Message::Text(msg.into())).await.is_err() {
                state.hub.client_disconnected();
                return;
            }
        }
    }

    let mut rx = state.hub.subscribe();

    loop {
        tokio::select! {
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

            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Ping(data))) if socket.send(Message::Pong(data.clone())).await.is_err() => {
                        break;
                    }
                    Some(Ok(Message::Text(text))) => {
                        // Overlay pages and the dock can dispatch operator
                        // actions over the socket they already have open.
                        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                            if value.get("type").and_then(|v| v.as_str()) == Some("action") {
                                let action = ActionRequest {
                                    action: value
                                        .get("action")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or_default()
                                        .to_string(),
                                    data: value.get("data").cloned().unwrap_or_default(),
                                };
                                if role_can_act(&role, &action.action) {
                                    state.hub.dispatch(action);
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }

    state.hub.client_disconnected();
    info!(
        total = state.hub.client_count(),
        "WebSocket client disconnected"
    );
}

/// Serves embedded overlay files from `overlays/` at `/overlays/{*path}`.
async fn serve_overlay(
    axum::extract::Path(path): axum::extract::Path<String>,
) -> impl IntoResponse {
    let path = path.trim_start_matches('/');

    if let Some(content) = OverlayAssets::get(path) {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        let response = (
            [(header::CONTENT_TYPE, mime.as_ref())],
            content.data.to_vec(),
        )
            .into_response();
        return with_security_headers(response, mime.as_ref());
    }

    let html_path = format!("{}.html", path);
    if let Some(content) = OverlayAssets::get(&html_path) {
        let response =
            ([(header::CONTENT_TYPE, "text/html")], content.data.to_vec()).into_response();
        return with_security_headers(response, "text/html");
    }

    (StatusCode::NOT_FOUND, "Overlay not found").into_response()
}

/// Serves the operator dock (`/dock`) — the same Control Room in a compact
/// page that fits an OBS Custom Browser Dock, a phone or a second monitor.
async fn serve_dock() -> impl IntoResponse {
    match OverlayAssets::get("dock.html") {
        Some(content) => {
            let response =
                ([(header::CONTENT_TYPE, "text/html")], content.data.to_vec()).into_response();
            with_security_headers(response, "text/html")
        }
        None => (StatusCode::NOT_FOUND, "Dock not found").into_response(),
    }
}

/// Serves uploaded assets (logos, fonts, images) from the app data directory.
async fn serve_asset(Path(path): Path<String>, State(state): State<Arc<AppContext>>) -> Response {
    let Some(store) = &state.assets else {
        return (StatusCode::NOT_FOUND, "Assets disabled").into_response();
    };
    match store.read(&path) {
        Some((bytes, mime)) => (
            [
                (header::CONTENT_TYPE, mime.as_str()),
                (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
                (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
            ],
            bytes,
        )
            .into_response(),
        None => (StatusCode::NOT_FOUND, "Asset not found").into_response(),
    }
}

/// Returns the latest cached match state as JSON at `GET /api/state`.
async fn get_state_handler(
    Query(query): Query<AuthQuery>,
    headers: HeaderMap,
    State(state): State<Arc<AppContext>>,
) -> impl IntoResponse {
    if authorize(&headers, &query, &state).is_none() {
        return StatusCode::FORBIDDEN.into_response();
    }
    let body = state.hub.cached_state().unwrap_or_else(|| "{}".to_string());
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

/// Health check for stream tooling and the Settings diagnostics card.
async fn health_handler(State(state): State<Arc<AppContext>>) -> impl IntoResponse {
    let body = serde_json::json!({
        "status": "ok",
        "port": state.port,
        "clients": state.hub.client_count(),
        "version": env!("CARGO_PKG_VERSION"),
        "delay": state.hub.delay_seconds(),
    });
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "no-store, max-age=0"),
        ],
        body.to_string(),
    )
        .into_response()
}

/// Optional filters for the read-only local API.
#[derive(Debug, Default, Deserialize)]
struct ApiQuery {
    #[serde(default)]
    token: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    playlist: Option<String>,
    match_type: Option<String>,
    result: Option<String>,
    search: Option<String>,
    days: Option<i32>,
    /// `/api/v2/scene`: explicit scene id.
    scene: Option<String>,
    /// `/api/v2/scene`: state to resolve when no scene id is given.
    state: Option<String>,
    /// `/api/v2/scene`: design-pack override.
    pack: Option<String>,
    /// `/api/v2/tournament`: explicit tournament id.
    tournament: Option<String>,
    /// `/api/v2/session`: how many days back to aggregate (default 1 = today).
    period_days: Option<i32>,
}

fn json_response(status: StatusCode, body: serde_json::Value) -> Response {
    (
        status,
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "no-store, max-age=0"),
        ],
        body.to_string(),
    )
        .into_response()
}

fn authorize_api(headers: &HeaderMap, query: &ApiQuery, state: &AppContext) -> Option<String> {
    authorize(
        headers,
        &AuthQuery {
            token: query.token.clone(),
        },
        state,
    )
}

/// `GET /api/v1/matches` — recent matches as JSON for scripts, bots and
/// Stream Deck integrations.
async fn v1_matches_handler(
    Query(query): Query<ApiQuery>,
    headers: HeaderMap,
    State(state): State<Arc<AppContext>>,
) -> Response {
    if authorize_api(&headers, &query, &state).is_none() {
        return json_response(
            StatusCode::FORBIDDEN,
            serde_json::json!({ "error": "forbidden" }),
        );
    }
    let Some(pool) = state.db_pool.clone() else {
        return json_response(
            StatusCode::SERVICE_UNAVAILABLE,
            serde_json::json!({ "error": "database unavailable" }),
        );
    };

    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let offset = query.offset.unwrap_or(0).max(0);
    let playlist = query.playlist.clone();
    let match_type = query.match_type.clone();
    let result = query.result.clone();
    let search = query.search.clone();

    let task = tauri::async_runtime::spawn_blocking(move || {
        let settings = crate::core::settings::get_settings(&pool).unwrap_or_default();
        let names = storage::identity_candidate_names(&settings);
        storage::get_matches(
            &pool,
            storage::MatchQuery {
                limit,
                offset,
                arena: None,
                match_type: match_type.as_deref(),
                playlist: playlist.as_deref(),
                result: result.as_deref(),
                date_from: None,
                date_to: None,
                search: search.as_deref(),
                local_primary_id: settings.local_primary_id.as_deref(),
                local_player_names: &names,
            },
        )
    });

    match task.await {
        Ok(Ok(matches)) => json_response(
            StatusCode::OK,
            serde_json::json!({ "matches": matches, "limit": limit, "offset": offset }),
        ),
        Ok(Err(error)) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!({ "error": error.to_string() }),
        ),
        Err(error) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!({ "error": error.to_string() }),
        ),
    }
}

/// `GET /api/v1/stats?days=N` — aggregated stats for the local player.
async fn v1_stats_handler(
    Query(query): Query<ApiQuery>,
    headers: HeaderMap,
    State(state): State<Arc<AppContext>>,
) -> Response {
    if authorize_api(&headers, &query, &state).is_none() {
        return json_response(
            StatusCode::FORBIDDEN,
            serde_json::json!({ "error": "forbidden" }),
        );
    }
    let Some(pool) = state.db_pool.clone() else {
        return json_response(
            StatusCode::SERVICE_UNAVAILABLE,
            serde_json::json!({ "error": "database unavailable" }),
        );
    };

    let days = query.days.unwrap_or(7).clamp(0, 3650);

    let task =
        tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
            let settings = crate::core::settings::get_settings(&pool).unwrap_or_default();
            let identity = settings.local_primary_id.clone().unwrap_or_default();
            if identity.trim().is_empty() {
                return Ok(serde_json::json!({ "available": false }));
            }
            if days == 0 {
                let records =
                    storage::get_career_records(&pool, &identity, settings.session_gap_minutes)
                        .map_err(|e| e.to_string())?;
                return Ok(serde_json::json!({
                    "available": true,
                    "career": serde_json::to_value(records).unwrap_or(serde_json::json!(null)),
                }));
            }

            let end = chrono::Local::now().format("%Y-%m-%d").to_string();
            let start = (chrono::Local::now() - chrono::Duration::days(days as i64 - 1))
                .format("%Y-%m-%d")
                .to_string();
            let summary = storage::get_analytics_summary_for_identity(
                &pool, &identity, &start, &end, None, None,
            )
            .map_err(|e| e.to_string())?;
            let streak =
                crate::core::metrics::calculate_streaks(&pool, &identity, &start, &end, None, None)
                    .map_err(|e| e.to_string())?;
            Ok(serde_json::json!({
                "available": true,
                "days": days,
                "startDate": start,
                "endDate": end,
                "summary": serde_json::to_value(summary).unwrap_or(serde_json::json!(null)),
                "streak": { "best": streak.best_streak, "current": streak.current_streak },
            }))
        });

    match task.await {
        Ok(Ok(value)) => json_response(StatusCode::OK, value),
        Ok(Err(error)) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!({ "error": error }),
        ),
        Err(error) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!({ "error": error.to_string() }),
        ),
    }
}

/// `GET /api/v2/packs` — built-in and custom design packs plus fonts.
async fn v2_packs_handler(
    Query(query): Query<ApiQuery>,
    headers: HeaderMap,
    State(state): State<Arc<AppContext>>,
) -> Response {
    if authorize_api(&headers, &query, &state).is_none() {
        return json_response(
            StatusCode::FORBIDDEN,
            serde_json::json!({ "error": "forbidden" }),
        );
    }

    let mut packs = builtin_packs();
    if let Some(pool) = state.db_pool.clone() {
        let user_packs =
            tauri::async_runtime::spawn_blocking(move || store::list_user_packs(&pool))
                .await
                .ok()
                .and_then(Result::ok)
                .unwrap_or_default();
        for pack in user_packs {
            packs.push(serde_json::json!({
                "id": pack.id,
                "name": pack.name,
                "baseId": pack.base_id,
                "builtIn": false,
                "description": "Pack personalizado",
                "tokens": pack.tokens,
            }));
        }
    }

    json_response(
        StatusCode::OK,
        serde_json::json!({ "packs": packs, "fonts": font_options() }),
    )
}

/// Builds the payload the overlay engine renders from.
pub fn scene_payload(
    pool: Option<&Arc<DbPool>>,
    scene_id: Option<&str>,
    state: &str,
    pack_override: Option<&str>,
) -> serde_json::Value {
    let mut scene_value = serde_json::json!(null);
    let mut pack_id = pack_override
        .filter(|value| !value.is_empty())
        .unwrap_or("prime-broadcast")
        .to_string();
    let mut layout = default_layout_for_state(state);

    if let Some(pool) = pool {
        if let Ok(Some(scene)) = scene_id
            .filter(|value| !value.is_empty())
            .map(|id| store::get_scene(pool, id))
            .unwrap_or_else(|| store::get_scene_for_state(pool, state))
        {
            pack_id = pack_override
                .filter(|value| !value.is_empty())
                .unwrap_or(&scene.pack_id)
                .to_string();
            if scene.layout.as_object().is_some_and(|map| !map.is_empty()) {
                layout = scene.layout.clone();
            }
            scene_value = serde_json::json!({
                "id": scene.id,
                "name": scene.name,
                "state": scene.state,
                "packId": pack_id,
            });
        }
    }

    // Resolve pack tokens: custom packs win over built-ins; unknown ids fall
    // back to the default pack so overlays never render unstyled.
    let tokens = pool
        .and_then(|pool| store::get_user_pack(pool, &pack_id).ok().flatten())
        .map(|pack| (pack.name, pack.tokens))
        .or_else(|| {
            builtin_packs()
                .into_iter()
                .find(|pack| pack["id"].as_str() == Some(pack_id.as_str()))
                .map(|pack| {
                    (
                        pack["name"].as_str().unwrap_or(&pack_id).to_string(),
                        pack["tokens"].clone(),
                    )
                })
        })
        .or_else(|| {
            builtin_packs().into_iter().next().map(|pack| {
                (
                    pack["name"]
                        .as_str()
                        .unwrap_or("Prime Broadcast")
                        .to_string(),
                    pack["tokens"].clone(),
                )
            })
        })
        .unwrap_or_else(|| ("Prime Broadcast".to_string(), serde_json::json!({})));

    let series = pool
        .and_then(|pool| store::series_snapshot(pool, None).ok())
        .unwrap_or_else(|| serde_json::json!({ "available": false }));
    let teams = pool
        .and_then(|pool| store::list_teams_with_logos(pool).ok())
        .unwrap_or_default();
    let tournament = pool
        .and_then(|pool| crate::core::broadcast::tournament::tournament_snapshot(pool, None).ok())
        .unwrap_or_else(|| serde_json::json!({ "available": false }));
    let custom_fonts: Vec<serde_json::Value> = pool
        .and_then(|pool| store::list_assets(pool, Some("font")).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|asset| serde_json::json!({ "name": asset.name, "url": asset.url }))
        .collect();

    serde_json::json!({
        "scene": scene_value,
        "state": state,
        "pack": { "id": pack_id, "name": tokens.0, "tokens": tokens.1 },
        "layout": layout,
        "series": series,
        "tournament": tournament,
        "teams": teams,
        "fonts": font_options(),
        "customFonts": custom_fonts,
    })
}

/// `GET /api/v2/scene` — scene + pack + layout + series for the engine.
async fn v2_scene_handler(
    Query(query): Query<ApiQuery>,
    headers: HeaderMap,
    State(state): State<Arc<AppContext>>,
) -> Response {
    if authorize_api(&headers, &query, &state).is_none() {
        return json_response(
            StatusCode::FORBIDDEN,
            serde_json::json!({ "error": "forbidden" }),
        );
    }

    let default_state = state
        .active_state
        .try_read()
        .map(|value| value.clone())
        .unwrap_or_else(|_| "waiting".to_string());
    let requested_state = query.state.clone().unwrap_or(default_state);
    let scene_id = query.scene.clone();
    let pack = query.pack.clone();
    let pool = state.db_pool.clone();

    let task = tauri::async_runtime::spawn_blocking(move || {
        scene_payload(
            pool.as_ref(),
            scene_id.as_deref(),
            &requested_state,
            pack.as_deref(),
        )
    });
    match task.await {
        Ok(value) => json_response(StatusCode::OK, value),
        Err(error) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!({ "error": error.to_string() }),
        ),
    }
}

/// `GET /api/v2/series` — active series snapshot.
async fn v2_series_handler(
    Query(query): Query<ApiQuery>,
    headers: HeaderMap,
    State(state): State<Arc<AppContext>>,
) -> Response {
    if authorize_api(&headers, &query, &state).is_none() {
        return json_response(
            StatusCode::FORBIDDEN,
            serde_json::json!({ "error": "forbidden" }),
        );
    }
    let Some(pool) = state.db_pool.clone() else {
        return json_response(
            StatusCode::SERVICE_UNAVAILABLE,
            serde_json::json!({ "error": "database unavailable" }),
        );
    };
    let task = tauri::async_runtime::spawn_blocking(move || store::series_snapshot(&pool, None));
    match task.await {
        Ok(Ok(value)) => json_response(StatusCode::OK, value),
        Ok(Err(error)) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!({ "error": error.to_string() }),
        ),
        Err(error) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!({ "error": error.to_string() }),
        ),
    }
}

/// `GET /api/v2/session` — today's live session record (played, W/L, win
/// rate, streak) for the local player, used by the `session` overlay widget.
async fn v2_session_handler(
    Query(query): Query<ApiQuery>,
    headers: HeaderMap,
    State(state): State<Arc<AppContext>>,
) -> Response {
    if authorize_api(&headers, &query, &state).is_none() {
        return json_response(
            StatusCode::FORBIDDEN,
            serde_json::json!({ "error": "forbidden" }),
        );
    }
    let Some(pool) = state.db_pool.clone() else {
        return json_response(
            StatusCode::SERVICE_UNAVAILABLE,
            serde_json::json!({ "error": "database unavailable" }),
        );
    };
    let days = query.period_days.unwrap_or(1).clamp(1, 365);

    let task =
        tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
            let settings = crate::core::settings::get_settings(&pool).unwrap_or_default();
            let identity = settings.local_primary_id.clone().unwrap_or_default();
            if identity.trim().is_empty() {
                return Ok(serde_json::json!({ "available": false }));
            }
            let end = chrono::Local::now().format("%Y-%m-%d").to_string();
            let start = (chrono::Local::now() - chrono::Duration::days(days as i64 - 1))
                .format("%Y-%m-%d")
                .to_string();
            let summary = storage::get_analytics_summary_for_identity(
                &pool, &identity, &start, &end, None, None,
            )
            .map_err(|error| error.to_string())?;
            let streak =
                crate::core::metrics::calculate_streaks(&pool, &identity, &start, &end, None, None)
                    .map_err(|error| error.to_string())?;
            Ok(serde_json::json!({
                "available": true,
                "startDate": start,
                "endDate": end,
                "summary": serde_json::to_value(summary).unwrap_or(serde_json::json!(null)),
                "streak": { "current": streak.current_streak, "best": streak.best_streak },
            }))
        });

    match task.await {
        Ok(Ok(value)) => json_response(StatusCode::OK, value),
        Ok(Err(error)) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!({ "error": error }),
        ),
        Err(error) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!({ "error": error.to_string() }),
        ),
    }
}

/// `GET /api/v2/tournament` — active (or requested) tournament snapshot.
async fn v2_tournament_handler(
    Query(query): Query<ApiQuery>,
    headers: HeaderMap,
    State(state): State<Arc<AppContext>>,
) -> Response {
    if authorize_api(&headers, &query, &state).is_none() {
        return json_response(
            StatusCode::FORBIDDEN,
            serde_json::json!({ "error": "forbidden" }),
        );
    }
    let Some(pool) = state.db_pool.clone() else {
        return json_response(
            StatusCode::SERVICE_UNAVAILABLE,
            serde_json::json!({ "error": "database unavailable" }),
        );
    };
    let tournament_id = query.tournament.clone();
    let task = tauri::async_runtime::spawn_blocking(move || {
        crate::core::broadcast::tournament::tournament_snapshot(&pool, tournament_id.as_deref())
    });
    match task.await {
        Ok(Ok(value)) => json_response(StatusCode::OK, value),
        Ok(Err(error)) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!({ "error": error.to_string() }),
        ),
        Err(error) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!({ "error": error.to_string() }),
        ),
    }
}

/// `GET /api/v2/teams` — team library with resolved logo URLs.
async fn v2_teams_handler(
    Query(query): Query<ApiQuery>,
    headers: HeaderMap,
    State(state): State<Arc<AppContext>>,
) -> Response {
    if authorize_api(&headers, &query, &state).is_none() {
        return json_response(
            StatusCode::FORBIDDEN,
            serde_json::json!({ "error": "forbidden" }),
        );
    }
    let Some(pool) = state.db_pool.clone() else {
        return json_response(
            StatusCode::SERVICE_UNAVAILABLE,
            serde_json::json!({ "error": "database unavailable" }),
        );
    };
    let task = tauri::async_runtime::spawn_blocking(move || store::list_teams_with_logos(&pool));
    match task.await {
        Ok(Ok(teams)) => json_response(StatusCode::OK, serde_json::json!({ "teams": teams })),
        Ok(Err(error)) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!({ "error": error.to_string() }),
        ),
        Err(error) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::json!({ "error": error.to_string() }),
        ),
    }
}

/// Payload for `POST /api/v2/action`.
#[derive(Debug, Deserialize)]
struct ActionBody {
    action: String,
    #[serde(default)]
    data: serde_json::Value,
}

/// `POST /api/v2/action` — operator actions from the dock or Stream Deck.
async fn v2_action_handler(
    Query(query): Query<AuthQuery>,
    headers: HeaderMap,
    State(state): State<Arc<AppContext>>,
    Json(body): Json<ActionBody>,
) -> Response {
    let Some(role) = authorize(&headers, &query, &state) else {
        return json_response(
            StatusCode::FORBIDDEN,
            serde_json::json!({ "error": "forbidden" }),
        );
    };
    if !role_can_act(&role, &body.action) {
        return json_response(
            StatusCode::FORBIDDEN,
            serde_json::json!({ "error": "role_not_allowed" }),
        );
    }
    state.hub.dispatch(ActionRequest {
        action: body.action,
        data: body.data,
    });
    json_response(StatusCode::OK, serde_json::json!({ "ok": true }))
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

    fn context(port: u16, tokens: &[(&str, &str)]) -> AppContext {
        AppContext {
            hub: BroadcastHub::new(),
            port,
            tokens: Arc::new(RwLock::new(
                tokens
                    .iter()
                    .map(|(token, role)| AuthToken {
                        token: token.to_string(),
                        role: role.to_string(),
                    })
                    .collect(),
            )),
            assets: None,
            db_pool: None,
            active_state: Arc::new(RwLock::new("waiting".to_string())),
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
    fn token_is_exposed_while_running_and_never_empty() {
        let mut server = OverlayServer::new(9528);
        server.set_tokens(vec![AuthToken {
            token: "admin-token".into(),
            role: "admin".into(),
        }]);
        server.running = true;
        let status = server.status();
        assert_eq!(status.token, "admin-token");
        assert_eq!(server.token(), "admin-token");
        assert_eq!(status.active_state, "waiting");
    }

    #[test]
    fn status_reports_connected_client_count() {
        let server = OverlayServer::new(0);
        server.hub().client_connected();
        server.hub().client_connected();
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
    fn authorize_allows_token_self_origin_and_bare_clients() {
        let ctx = context(9528, &[("secret", "admin"), ("ref", "referee")]);
        let token = AuthQuery {
            token: Some("secret".into()),
        };
        assert_eq!(
            authorize(&headers(Some("https://evil.com")), &token, &ctx).as_deref(),
            Some("admin")
        );

        let referee = AuthQuery {
            token: Some("ref".into()),
        };
        assert_eq!(
            authorize(&headers(None), &referee, &ctx).as_deref(),
            Some("referee")
        );

        let none = AuthQuery::default();
        assert_eq!(
            authorize(&headers(Some("http://127.0.0.1:9528")), &none, &ctx).as_deref(),
            Some("local")
        );
        assert_eq!(
            authorize(&headers(Some("http://localhost:9528")), &none, &ctx).as_deref(),
            Some("local")
        );
        assert_eq!(
            authorize(&headers(None), &none, &ctx).as_deref(),
            Some("local")
        );
    }

    #[test]
    fn authorize_rejects_foreign_origin_null_origin_and_bad_tokens() {
        let ctx = context(9528, &[("secret", "admin")]);
        let none = AuthQuery::default();
        assert!(authorize(&headers(Some("https://evil.com")), &none, &ctx).is_none());
        assert!(authorize(&headers(Some("http://127.0.0.1:9999")), &none, &ctx).is_none());
        assert!(authorize(&headers(Some("null")), &none, &ctx).is_none());

        let wrong = AuthQuery {
            token: Some("nope".into()),
        };
        assert!(authorize(&headers(None), &wrong, &ctx).is_none());
    }

    #[test]
    fn role_permissions_are_scoped() {
        assert!(role_can_act("admin", "anything"));
        assert!(role_can_act("local", "set_state"));
        assert!(role_can_act("referee", "series_score"));
        assert!(!role_can_act("referee", "delete_everything"));
        assert!(!role_can_act("viewer", "set_state"));
    }

    #[test]
    fn broadcast_goal_reaches_subscribers_with_payload() {
        let server = OverlayServer::new(0);
        let mut rx = server.hub().subscribe();
        server.broadcast_goal("Alice", 1);

        let message = rx
            .try_recv()
            .expect("broadcast should reach the subscriber");
        let value: serde_json::Value = serde_json::from_str(&message).unwrap();
        assert_eq!(value["type"], "goal");
        assert_eq!(value["data"]["scorerName"], "Alice");
        assert_eq!(value["data"]["teamNum"], 1);
        assert_eq!(value["v"], 2);
    }

    #[test]
    fn broadcast_statfeed_serializes_optional_secondary_target() {
        let server = OverlayServer::new(0);
        let mut rx = server.hub().subscribe();

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
        let mut rx = server.hub().subscribe();
        server.broadcast_ball_hit(1);
        let value: serde_json::Value = serde_json::from_str(&rx.try_recv().unwrap()).unwrap();
        assert_eq!(value["type"], "ball_hit");
        assert_eq!(value["data"]["teamNum"], 1);
    }

    #[test]
    fn broadcast_countdown_begin_emits_type() {
        let server = OverlayServer::new(0);
        let mut rx = server.hub().subscribe();
        server.broadcast_countdown_begin();
        let value: serde_json::Value = serde_json::from_str(&rx.try_recv().unwrap()).unwrap();
        assert_eq!(value["type"], "countdown_begin");
    }

    #[tokio::test]
    async fn broadcast_state_emits_camel_case_state_event() {
        let server = OverlayServer::new(0);
        let mut rx = server.hub().subscribe();
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
        let cached = server.hub().cached_state().unwrap();
        let cached: serde_json::Value = serde_json::from_str(&cached).unwrap();
        assert_eq!(cached["scoreBlue"], 2);
        assert!(cached.get("type").is_none());
    }

    #[tokio::test]
    async fn unrelated_event_does_not_touch_cached_state() {
        let server = OverlayServer::new(0);
        server.broadcast_ball_hit(0);
        assert!(server.hub().cached_state().is_none());
    }

    #[test]
    fn scene_payload_without_database_uses_defaults() {
        let payload = scene_payload(None, None, "waiting", None);
        assert_eq!(payload["state"], "waiting");
        assert_eq!(payload["pack"]["id"], "prime-broadcast");
        assert!(!payload["layout"].as_object().unwrap().is_empty());
        assert_eq!(payload["series"]["available"], false);
        assert_eq!(payload["tournament"]["available"], false);
    }

    #[test]
    fn scene_payload_honors_pack_override_and_unknown_state() {
        let payload = scene_payload(None, None, "unknown-state", Some("neon-circuit"));
        assert_eq!(payload["pack"]["id"], "neon-circuit");
        assert!(!payload["layout"].as_object().unwrap().is_empty());
    }
}
