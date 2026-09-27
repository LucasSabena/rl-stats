use crate::core::models::{ConnectionStatus, HeadToHeadRecord, LiveMatchState};
use crate::core::session::MatchPhase;
use crate::core::storage;
use crate::AppState;
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use tauri::State;

#[tauri::command]
pub async fn get_live_state(state: State<'_, AppState>) -> Result<Option<LiveMatchState>, String> {
    let session = state.session_manager.read().await;
    let live = session.live_state();
    if session.phase() == &MatchPhase::Waiting && live.players.is_empty() {
        Ok(None)
    } else {
        Ok(Some(live))
    }
}

#[tauri::command]
pub async fn get_live_head_to_head(
    state: State<'_, AppState>,
    opponent_ids: Vec<String>,
) -> Result<HashMap<String, HeadToHeadRecord>, String> {
    let settings = crate::core::settings::get_settings(&state.db_pool).unwrap_or_default();
    let local_pids = settings.local_identity_ids();
    if local_pids.is_empty() {
        return Ok(HashMap::new());
    }
    storage::get_head_to_head_records(&state.db_pool, &local_pids, &opponent_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_connection_status(state: State<'_, AppState>) -> Result<ConnectionStatus, String> {
    let mut status = state.ingestor_status.read().await.clone();
    status.game_running = state.game_running.load(Ordering::SeqCst);
    Ok(status)
}
