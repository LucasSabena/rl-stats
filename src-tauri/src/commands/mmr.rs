use crate::core::mmr::{resolve_lobby_mmr, set_local_mmr_manual, LiveMmrSnapshot};
use crate::core::settings::get_settings;
use crate::core::storage::MatchMmrSnapshot;
use crate::AppState;
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub async fn fetch_live_mmr_snapshot(
    state: State<'_, AppState>,
    force_refresh: bool,
) -> Result<LiveMmrSnapshot, String> {
    let live_players = {
        let session = state.session_manager.read().await;
        session.live_state().players
    };

    if live_players.is_empty() {
        return Err("No hay una partida activa para consultar MMR del lobby.".into());
    }

    let settings = get_settings(&state.db_pool).map_err(|e| e.to_string())?;

    if force_refresh {
        // Clear relevant cache entries so fresh data is fetched
        for player in &live_players {
            if let Some(parts) = player.id.split('|').nth(1) {
                let platform = player.id.split('|').next().unwrap_or("");
                let normalized_platform = platform.to_ascii_lowercase();
                for provider in &["rapidapi", "tracker", "parsebot", "rlstats"] {
                    let _ = crate::core::storage::delete_mmr_cache(
                        &state.db_pool,
                        provider,
                        &normalized_platform,
                        parts,
                    );
                }
            }
        }
    }

    resolve_lobby_mmr(
        state.db_pool.clone(),
        settings.rapidapi_key.clone(),
        settings.rapidapi_enabled,
        settings.tracker_api_key.clone(),
        settings.parsebot_api_key.clone(),
        settings.parsebot_scraper_id.clone(),
        settings.parsebot_endpoint.clone(),
        settings.parsebot_enabled,
        settings.local_primary_id.clone(),
        !force_refresh,
        live_players,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_session_mmr_snapshot(
    state: State<'_, AppState>,
    mmr_by_primary_id: HashMap<String, Option<i32>>,
) -> Result<(), String> {
    let mut session = state.session_manager.write().await;
    session.set_mmr_snapshot(MatchMmrSnapshot { mmr_by_primary_id });
    Ok(())
}

/// Persist a manually-entered MMR for the local player on a given playlist.
/// The playlist key is one of "duel", "doubles", "standard", "hoops",
/// "rumble", "dropshot", "snowday", "quads".
#[tauri::command]
pub async fn set_local_mmr(
    state: State<'_, AppState>,
    playlist: String,
    mmr: i32,
) -> Result<(), String> {
    let settings = get_settings(&state.db_pool).map_err(|e| e.to_string())?;
    let local_primary_id = settings
        .local_primary_id
        .as_deref()
        .filter(|id| !id.is_empty())
        .ok_or_else(|| "No hay un perfil local configurado para guardar MMR.".to_string())?;

    if mmr < 0 || mmr > 3000 {
        return Err("El MMR debe estar entre 0 y 3000.".into());
    }

    set_local_mmr_manual(&state.db_pool, local_primary_id, &playlist, mmr)
        .map_err(|e| e.to_string())
}
