//! Operator action orchestrator.
//!
//! Actions arrive from the Control Room (Tauri commands), the OBS dock and
//! Stream Deck (`POST /api/v2/action`) into a broadcast channel. This module
//! listens on that channel, updates SQLite when needed and publishes the
//! resulting scene/series/timer/delay events to every overlay.

use super::game_commands::{self, to_wire};
use super::{is_broadcast_state, ActionRequest, BroadcastHub};
use crate::core::ingestor::CommandSender;
use crate::core::overlay::scene_payload;
use crate::core::settings::{get_settings, set_settings};
use crate::core::storage::DbPool;
use serde_json::{json, Value};
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{info, warn};

/// Spawns the action listener. Runs for the lifetime of the app.
pub fn spawn_action_listener(
    hub: BroadcastHub,
    pool: Arc<DbPool>,
    commands: Arc<Mutex<Option<CommandSender>>>,
) {
    let mut rx = hub.subscribe_actions();
    tauri::async_runtime::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(action) => {
                    handle_action(&hub, &pool, &commands, action).await;
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    warn!(skipped, "Action listener lagging");
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });
    info!("Broadcast action listener started");
}

async fn handle_action(
    hub: &BroadcastHub,
    pool: &Arc<DbPool>,
    commands: &Arc<Mutex<Option<CommandSender>>>,
    action: ActionRequest,
) {
    match action.action.as_str() {
        "set_state" => {
            let Some(state) = action.str_field("state") else {
                return;
            };
            if !is_broadcast_state(state) {
                warn!(state, "Ignoring unknown broadcast state");
                return;
            }
            if let Ok(mut settings) = get_settings(pool) {
                settings.broadcast_active_state = state.to_string();
                if let Err(error) = set_settings(pool, &settings) {
                    warn!(error = %error, "Could not persist broadcast state");
                }
            }
            let payload = scene_for_state(pool, state, action.str_field("pack")).await;
            hub.publish_typed("scene", Some(payload));
            info!(state, "Broadcast state changed");
        }
        "take_graphic" | "out_graphic" => {
            let Some(id) = action.str_field("id") else {
                return;
            };
            let visible = action.action == "take_graphic";
            hub.publish_typed("graphic", Some(json!({ "id": id, "visible": visible })));
        }
        "series_score" => {
            let Some(series_id) = current_series_id(pool).await else {
                return;
            };
            let score_a = action.i64_field("scoreA").unwrap_or(0);
            let score_b = action.i64_field("scoreB").unwrap_or(0);
            let pool_task = Arc::clone(pool);
            let _ = tauri::async_runtime::spawn_blocking(move || {
                crate::core::broadcast::store::update_series_score(
                    &pool_task, &series_id, score_a, score_b,
                )
            })
            .await;
            publish_series(hub, pool).await;
        }
        "series_game" => {
            let Some(series_id) = current_series_id(pool).await else {
                return;
            };
            let winner = action.str_field("winnerTeamId").map(str::to_string);
            let score_a = action.i64_field("scoreA").unwrap_or(0);
            let score_b = action.i64_field("scoreB").unwrap_or(0);
            let arena = action.str_field("arena").map(str::to_string);
            let duration = action.i64_field("durationSeconds").unwrap_or(0);
            let match_id = action.i64_field("matchId");
            let pool_task = Arc::clone(pool);
            let _ = tauri::async_runtime::spawn_blocking(move || {
                crate::core::broadcast::store::record_series_game(
                    &pool_task,
                    &series_id,
                    winner.as_deref(),
                    score_a,
                    score_b,
                    arena.as_deref(),
                    duration,
                    match_id,
                )
            })
            .await;
            publish_series(hub, pool).await;
        }
        "series_reset" => {
            let Some(series_id) = current_series_id(pool).await else {
                return;
            };
            let pool_task = Arc::clone(pool);
            let _ = tauri::async_runtime::spawn_blocking(move || {
                crate::core::broadcast::store::update_series_score(&pool_task, &series_id, 0, 0)
            })
            .await;
            publish_series(hub, pool).await;
        }
        "set_delay" => {
            let Some(seconds) = action.u64_field("seconds") else {
                return;
            };
            let seconds = seconds.min(600);
            hub.set_delay_seconds(seconds);
            if let Ok(mut settings) = get_settings(pool) {
                settings.overlay_delay_seconds = seconds as u32;
                if let Err(error) = set_settings(pool, &settings) {
                    warn!(error = %error, "Could not persist broadcast delay");
                }
            }
            hub.publish_typed("delay", Some(json!({ "seconds": seconds })));
            info!(seconds, "Broadcast delay changed");
        }
        "timer" => {
            let action_name = action.str_field("op").unwrap_or("start");
            let label = action.str_field("label").unwrap_or("");
            let seconds = action.u64_field("seconds").unwrap_or(0);
            if action_name == "stop" {
                hub.publish_typed("timer", Some(json!({ "running": false })));
            } else {
                hub.publish_typed(
                    "timer",
                    Some(json!({
                        "running": true,
                        "label": label,
                        "seconds": seconds,
                        "endsAt": chrono::Utc::now().timestamp_millis() + (seconds as i64 * 1000),
                    })),
                );
            }
        }
        "game_command" => {
            let Some(command) = action.str_field("command") else {
                return;
            };
            let built = match command {
                "SetMatchPaused" => action
                    .bool_field("paused")
                    .map(game_commands::set_match_paused),
                "SetHUDVisibility" => action
                    .bool_field("visible")
                    .map(game_commands::set_hud_visibility),
                "ChangePOV" => game_commands::change_pov(
                    action.str_field("focus"),
                    action.str_field("perspective"),
                )
                .ok(),
                "LoadReplay" => game_commands::load_replay(
                    action.str_field("fileName"),
                    action.str_field("path"),
                )
                .ok(),
                "SeekReplay" => game_commands::seek_replay(
                    action.i64_field("frame"),
                    action.data.get("timeSeconds").and_then(Value::as_f64),
                )
                .ok(),
                "SetGameSpeed" => action
                    .data
                    .get("speed")
                    .and_then(Value::as_f64)
                    .and_then(|speed| game_commands::set_game_speed(speed).ok()),
                other => {
                    warn!(command = other, "Unknown game command");
                    None
                }
            };
            let Some(built) = built else {
                return;
            };
            let sent = commands
                .lock()
                .ok()
                .and_then(|guard| guard.as_ref().cloned())
                .map(|sender| sender.send(to_wire(&built)))
                .unwrap_or(false);
            hub.publish_typed(
                "game_command",
                Some(json!({ "command": command, "sent": sent })),
            );
        }
        "refresh" => {
            // Re-publish the current scene + series so late clients sync up.
            let state = get_settings(pool)
                .map(|settings| settings.broadcast_active_state)
                .unwrap_or_else(|_| "waiting".to_string());
            let scene = scene_for_state(pool, &state, None).await;
            hub.publish_typed("scene", Some(scene));
            publish_series(hub, pool).await;
        }
        other => {
            warn!(action = other, "Unhandled broadcast action");
        }
    }
}

async fn scene_for_state(pool: &Arc<DbPool>, state: &str, pack: Option<&str>) -> Value {
    let pool = Arc::clone(pool);
    let state_value = state.to_string();
    let fallback = state_value.clone();
    let pack = pack.map(str::to_string);
    tauri::async_runtime::spawn_blocking(move || {
        scene_payload(Some(&pool), None, &state_value, pack.as_deref())
    })
    .await
    .unwrap_or_else(|_| json!({ "state": fallback }))
}

async fn current_series_id(pool: &Arc<DbPool>) -> Option<String> {
    let pool = Arc::clone(pool);
    tauri::async_runtime::spawn_blocking(move || {
        crate::core::broadcast::store::get_active_series(&pool)
            .ok()
            .flatten()
            .map(|series| series.id)
    })
    .await
    .ok()
    .flatten()
}

async fn publish_series(hub: &BroadcastHub, pool: &Arc<DbPool>) {
    let pool = Arc::clone(pool);
    let snapshot = tauri::async_runtime::spawn_blocking(move || {
        crate::core::broadcast::store::series_snapshot(&pool, None)
    })
    .await
    .ok()
    .and_then(Result::ok)
    .unwrap_or_else(|| json!({ "available": false }));
    hub.publish_typed("series", Some(snapshot));
}
