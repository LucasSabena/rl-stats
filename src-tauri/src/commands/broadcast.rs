//! Tauri commands for the Broadcast Studio (Control Room).
//!
//! All commands delegate to `core::broadcast`: storage CRUD, asset uploads,
//! chat lifecycle, role tokens, delay and the action orchestrator. The
//! frontend never talks to SQLite or the filesystem directly.

use crate::core::broadcast::packs::{builtin_packs, font_options};
use crate::core::broadcast::store::{
    self, BroadcastAsset, BroadcastPack, BroadcastScene, BroadcastToken, Series, Team, TeamPlayer,
};
use crate::core::broadcast::{is_broadcast_state, ActionRequest};
use crate::core::settings::{get_settings, set_settings};
use crate::AppState;
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::State;
use tracing::info;

fn storage_error(error: crate::error::AppError) -> String {
    error.to_string()
}

fn broadcast_hub(state: &State<'_, AppState>) -> crate::core::broadcast::BroadcastHub {
    state.broadcast_hub.clone()
}

// ---------------------------------------------------------------------------
// State machine, delay, timers
// ---------------------------------------------------------------------------

/// Changes the active broadcast state (`waiting`, `live`, `replay`, `post`,
/// `brb`). Persists it and makes the orchestrator publish the scene.
#[tauri::command]
pub async fn set_broadcast_state(
    state: State<'_, AppState>,
    state_name: String,
) -> Result<(), String> {
    if !is_broadcast_state(&state_name) {
        return Err(format!("Estado de transmisión inválido: {state_name}"));
    }
    broadcast_hub(&state).dispatch(ActionRequest::new(
        "set_state",
        json!({ "state": state_name }),
    ));
    Ok(())
}

/// Sets the overlay feed delay in seconds (0-600).
#[tauri::command]
pub async fn set_broadcast_delay(state: State<'_, AppState>, seconds: u64) -> Result<(), String> {
    let hub = broadcast_hub(&state);
    hub.dispatch(ActionRequest::new(
        "set_delay",
        json!({ "seconds": seconds }),
    ));
    Ok(())
}

/// Starts or stops the on-stream countdown timer.
#[tauri::command]
pub async fn control_broadcast_timer(
    state: State<'_, AppState>,
    op: String,
    seconds: Option<u64>,
    label: Option<String>,
) -> Result<(), String> {
    let hub = broadcast_hub(&state);
    hub.dispatch(ActionRequest::new(
        "timer",
        json!({
            "op": op,
            "seconds": seconds.unwrap_or(0),
            "label": label.unwrap_or_default(),
        }),
    ));
    Ok(())
}

/// Takes a graphic in or out on the overlay (TAKE/OUT from the rundown).
#[tauri::command]
pub async fn set_graphic_visibility(
    state: State<'_, AppState>,
    id: String,
    visible: bool,
) -> Result<(), String> {
    let hub = broadcast_hub(&state);
    hub.dispatch(ActionRequest::new(
        if visible {
            "take_graphic"
        } else {
            "out_graphic"
        },
        json!({ "id": id }),
    ));
    Ok(())
}

/// Sends a Stats API command to the game (`SetMatchPaused`, `ChangePOV`, …).
#[tauri::command]
pub async fn send_game_command(
    state: State<'_, AppState>,
    command: String,
    data: Option<Value>,
) -> Result<(), String> {
    let mut payload = data.unwrap_or_else(|| json!({}));
    payload["command"] = json!(command);
    broadcast_hub(&state).dispatch(ActionRequest::new("game_command", payload));
    Ok(())
}

/// Re-publishes the current scene and series (used after edits so overlays
/// refresh without a reconnect).
#[tauri::command]
pub async fn refresh_broadcast(state: State<'_, AppState>) -> Result<(), String> {
    broadcast_hub(&state).dispatch(ActionRequest::new("refresh", json!({})));
    Ok(())
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_broadcast_tokens(
    state: State<'_, AppState>,
) -> Result<Vec<BroadcastToken>, String> {
    store::list_tokens(&state.db_pool).map_err(storage_error)
}

#[tauri::command]
pub async fn create_broadcast_token(
    state: State<'_, AppState>,
    role: String,
    label: String,
) -> Result<BroadcastToken, String> {
    store::create_token(&state.db_pool, &role, &label).map_err(storage_error)
}

#[tauri::command]
pub async fn revoke_broadcast_token(state: State<'_, AppState>, id: String) -> Result<(), String> {
    store::revoke_token(&state.db_pool, &id).map_err(storage_error)
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_broadcast_assets(
    state: State<'_, AppState>,
    kind: Option<String>,
) -> Result<Vec<BroadcastAsset>, String> {
    store::list_assets(&state.db_pool, kind.as_deref()).map_err(storage_error)
}

/// Uploads an asset from a `data:` URL or raw base64 plus MIME type.
///
/// The frontend reads the user's file with `FileReader`, so the app never
/// needs filesystem permissions.
#[tauri::command]
pub async fn upload_broadcast_asset(
    state: State<'_, AppState>,
    kind: String,
    name: String,
    mime: String,
    data_base64: String,
) -> Result<BroadcastAsset, String> {
    let (mime, base64) = split_data_url(&mime, &data_base64);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64.as_bytes())
        .map_err(|error| format!("Base64 inválido: {error}"))?;

    let store = crate::core::overlay::assets::AssetStore::new(state.broadcast_assets_dir.clone());
    let (file_name, mime) = store.save(&kind, &mime, &bytes)?;
    store::create_asset(
        &state.db_pool,
        &kind,
        &name,
        &file_name,
        &mime,
        bytes.len() as i64,
    )
    .map_err(storage_error)
}

/// Splits `data:<mime>;base64,<payload>` when present.
fn split_data_url(mime: &str, data: &str) -> (String, String) {
    if let Some(rest) = data.strip_prefix("data:") {
        if let Some((meta, payload)) = rest.split_once(',') {
            let mime = meta.split(';').next().unwrap_or(mime).to_string();
            return (mime, payload.to_string());
        }
    }
    (mime.to_string(), data.to_string())
}

#[tauri::command]
pub async fn delete_broadcast_asset(state: State<'_, AppState>, id: String) -> Result<(), String> {
    if let Some(asset) = store::get_asset(&state.db_pool, &id).map_err(storage_error)? {
        let store =
            crate::core::overlay::assets::AssetStore::new(state.broadcast_assets_dir.clone());
        let _ = store.delete(&asset.file_name);
    }
    store::delete_asset(&state.db_pool, &id).map_err(storage_error)
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

/// Built-in packs plus the custom ones. The engine consumes the same shape
/// from `GET /api/v2/packs`.
#[tauri::command]
pub async fn list_broadcast_packs(state: State<'_, AppState>) -> Result<Value, String> {
    let mut packs = builtin_packs();
    let user_packs = store::list_user_packs(&state.db_pool).map_err(storage_error)?;
    for pack in user_packs {
        packs.push(json!({
            "id": pack.id,
            "name": pack.name,
            "baseId": pack.base_id,
            "builtIn": false,
            "description": "Pack personalizado",
            "tokens": pack.tokens,
        }));
    }
    Ok(json!({ "packs": packs, "fonts": font_options() }))
}

#[tauri::command]
pub async fn save_broadcast_pack(
    state: State<'_, AppState>,
    id: Option<String>,
    name: String,
    base_id: Option<String>,
    tokens: Value,
    layouts: Option<Value>,
) -> Result<BroadcastPack, String> {
    store::upsert_user_pack(
        &state.db_pool,
        id.as_deref(),
        &name,
        base_id.as_deref(),
        &tokens,
        &layouts.unwrap_or_else(|| json!({})),
    )
    .map_err(storage_error)
}

#[tauri::command]
pub async fn delete_broadcast_pack(state: State<'_, AppState>, id: String) -> Result<(), String> {
    store::delete_user_pack(&state.db_pool, &id).map_err(storage_error)
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_broadcast_scenes(
    state: State<'_, AppState>,
) -> Result<Vec<BroadcastScene>, String> {
    store::list_scenes(&state.db_pool).map_err(storage_error)
}

#[tauri::command]
pub async fn save_broadcast_scene(
    state: State<'_, AppState>,
    id: Option<String>,
    name: String,
    pack_id: String,
    scene_state: String,
    layout: Value,
) -> Result<BroadcastScene, String> {
    let scene = store::upsert_scene(
        &state.db_pool,
        id.as_deref(),
        &name,
        &pack_id,
        &scene_state,
        &layout,
    )
    .map_err(storage_error)?;
    broadcast_hub(&state).dispatch(ActionRequest::new("refresh", json!({})));
    Ok(scene)
}

#[tauri::command]
pub async fn delete_broadcast_scene(state: State<'_, AppState>, id: String) -> Result<(), String> {
    store::delete_scene(&state.db_pool, &id).map_err(storage_error)
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_teams(state: State<'_, AppState>) -> Result<Vec<Team>, String> {
    store::list_teams(&state.db_pool).map_err(storage_error)
}

#[tauri::command]
pub async fn save_team(
    state: State<'_, AppState>,
    id: Option<String>,
    name: String,
    tag: String,
    color_primary: String,
    color_secondary: String,
    logo_asset_id: Option<String>,
) -> Result<Team, String> {
    store::upsert_team(
        &state.db_pool,
        id.as_deref(),
        &name,
        &tag,
        &color_primary,
        &color_secondary,
        logo_asset_id.as_deref(),
    )
    .map_err(storage_error)
}

#[tauri::command]
pub async fn delete_team(state: State<'_, AppState>, id: String) -> Result<(), String> {
    store::delete_team(&state.db_pool, &id).map_err(storage_error)
}

// ---------------------------------------------------------------------------
// Team roster
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_team_roster(
    state: State<'_, AppState>,
    team_id: String,
) -> Result<Vec<TeamPlayer>, String> {
    store::list_team_roster(&state.db_pool, &team_id).map_err(storage_error)
}

#[tauri::command]
pub async fn add_team_roster_player(
    state: State<'_, AppState>,
    team_id: String,
    name: String,
    primary_id: Option<String>,
) -> Result<TeamPlayer, String> {
    if name.trim().is_empty() {
        return Err("El nombre del jugador no puede estar vacío".into());
    }
    store::add_team_player(&state.db_pool, &team_id, &name, primary_id.as_deref())
        .map_err(storage_error)
}

#[tauri::command]
pub async fn remove_team_roster_player(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    store::remove_team_player(&state.db_pool, &id).map_err(storage_error)
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_series_state(state: State<'_, AppState>) -> Result<Value, String> {
    store::series_snapshot(&state.db_pool, None).map_err(storage_error)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSeriesInput {
    pub name: String,
    pub format: i64,
    pub team_a_id: Option<String>,
    pub team_b_id: Option<String>,
}

#[tauri::command]
pub async fn create_series(
    state: State<'_, AppState>,
    input: NewSeriesInput,
) -> Result<Series, String> {
    let series = store::create_series(
        &state.db_pool,
        &input.name,
        input.format,
        input.team_a_id.as_deref(),
        input.team_b_id.as_deref(),
    )
    .map_err(storage_error)?;
    broadcast_hub(&state).dispatch(ActionRequest::new("refresh", json!({})));
    Ok(series)
}

#[tauri::command]
pub async fn update_series_score(
    state: State<'_, AppState>,
    score_a: i64,
    score_b: i64,
) -> Result<(), String> {
    broadcast_hub(&state).dispatch(ActionRequest::new(
        "series_score",
        json!({ "scoreA": score_a, "scoreB": score_b }),
    ));
    Ok(())
}

#[tauri::command]
pub async fn record_series_game(
    state: State<'_, AppState>,
    winner_team_id: Option<String>,
    score_a: i64,
    score_b: i64,
    arena: Option<String>,
    duration_seconds: Option<i64>,
    match_id: Option<i64>,
) -> Result<(), String> {
    broadcast_hub(&state).dispatch(ActionRequest::new(
        "series_game",
        json!({
            "winnerTeamId": winner_team_id,
            "scoreA": score_a,
            "scoreB": score_b,
            "arena": arena,
            "durationSeconds": duration_seconds.unwrap_or(0),
            "matchId": match_id,
        }),
    ));
    Ok(())
}

#[tauri::command]
pub async fn reset_series(state: State<'_, AppState>) -> Result<(), String> {
    broadcast_hub(&state).dispatch(ActionRequest::new("series_reset", json!({})));
    Ok(())
}

#[tauri::command]
pub async fn delete_series_cmd(state: State<'_, AppState>, id: String) -> Result<(), String> {
    store::delete_series(&state.db_pool, &id).map_err(storage_error)
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatConfigInput {
    pub enabled: bool,
    pub twitch_channel: String,
    pub kick_channel: String,
}

/// Persists the chat configuration and (re)starts the readers.
#[tauri::command]
pub async fn configure_chat(
    state: State<'_, AppState>,
    config: ChatConfigInput,
) -> Result<Value, String> {
    let mut settings = get_settings(&state.db_pool).map_err(storage_error)?;
    settings.chat_enabled = config.enabled;
    settings.chat_twitch_channel = config.twitch_channel.clone();
    settings.chat_kick_channel = config.kick_channel.clone();
    set_settings(&state.db_pool, &settings).map_err(storage_error)?;

    state.chat.stop_all();
    if config.enabled {
        if !config.twitch_channel.trim().is_empty() {
            state.chat.start_twitch(&config.twitch_channel);
        }
        if !config.kick_channel.trim().is_empty() {
            state.chat.start_kick(&config.kick_channel);
        }
    }
    info!("Chat configuration applied");
    Ok(json!({
        "running": state.chat.running_platforms(),
        "enabled": config.enabled,
    }))
}

/// Pack used by the in-game overlay window: the user-selected pack when set,
/// otherwise the active broadcast scene's pack.
#[tauri::command]
pub async fn get_overlay_pack_tokens(state: State<'_, AppState>) -> Result<Value, String> {
    let settings = get_settings(&state.db_pool).map_err(storage_error)?;
    let mut pack_id = settings.overlay_pack_id.trim().to_string();
    if pack_id.is_empty() {
        pack_id = store::get_scene_for_state(&state.db_pool, &settings.broadcast_active_state)
            .ok()
            .flatten()
            .map(|scene| scene.pack_id)
            .unwrap_or_else(|| "prime-broadcast".to_string());
    }
    let (name, tokens) =
        crate::core::broadcast::packs::resolve_pack_tokens(Some(&state.db_pool), &pack_id);
    Ok(json!({
        "id": pack_id,
        "name": name,
        "tokens": tokens,
        "fonts": font_options(),
    }))
}

#[tauri::command]
pub async fn set_discord_webhook(state: State<'_, AppState>, url: String) -> Result<(), String> {
    let mut settings = get_settings(&state.db_pool).map_err(storage_error)?;
    let url = url.trim().to_string();
    if !url.is_empty() && !crate::core::broadcast::discord::is_valid_webhook(&url) {
        return Err("La URL debe ser un webhook de Discord".into());
    }
    settings.discord_webhook = url;
    set_settings(&state.db_pool, &settings).map_err(storage_error)
}

#[tauri::command]
pub async fn test_discord_webhook(state: State<'_, AppState>) -> Result<(), String> {
    let settings = get_settings(&state.db_pool).map_err(storage_error)?;
    let webhook = settings.discord_webhook;
    if webhook.is_empty() {
        return Err("Configurá un webhook primero".into());
    }
    crate::core::broadcast::discord::send(
        &webhook,
        "RL Stats: notificaciones de torneo activadas ✅",
    )
    .await
}

#[tauri::command]
pub async fn get_chat_status(state: State<'_, AppState>) -> Result<Value, String> {
    Ok(json!({
        "running": state.chat.running_platforms(),
    }))
}
