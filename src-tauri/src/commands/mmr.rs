use crate::core::mmr::{resolve_lobby_mmr, set_local_mmr_manual, LiveMmrSnapshot};
use crate::core::settings::get_settings;
use crate::core::storage::{
    list_mmr_provider_health, record_mmr_provider_attempt, MatchMmrSnapshot, MmrProviderHealth,
};
use crate::AppState;
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub async fn fetch_live_mmr_snapshot(
    state: State<'_, AppState>,
    force_refresh: bool,
) -> Result<LiveMmrSnapshot, String> {
    let (live_players, exact_playlist) = {
        let session = state.session_manager.read().await;
        let live = session.live_state();
        let playlist = live
            .playlist_id
            .and_then(crate::core::mmr::playlists::playlist_id_to_key)
            .map(str::to_string);
        (live.players, playlist)
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
                for provider in &[
                    "rapidapi",
                    "tracker",
                    "parsebot",
                    "rlstats",
                    "rlstats-webview",
                ] {
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
        exact_playlist,
        settings
            .mmr_scraper_enabled
            .then(|| state.rlstats_scraper.clone()),
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

    if !(0..=3000).contains(&mmr) {
        return Err("El MMR debe estar entre 0 y 3000.".into());
    }

    set_local_mmr_manual(&state.db_pool, local_primary_id, &playlist, mmr)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_mmr_provider_health(
    state: State<'_, AppState>,
) -> Result<Vec<MmrProviderHealth>, String> {
    list_mmr_provider_health(&state.db_pool).map_err(|e| e.to_string())
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MmrProviderTestEntry {
    pub playlist: String,
    pub mmr: Option<i32>,
    pub rank_name: Option<String>,
    pub division: Option<String>,
    pub matches_played: Option<i64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MmrProviderTestResult {
    pub provider: String,
    pub ok: bool,
    pub message: String,
    pub latency_ms: i64,
    pub entries: Vec<MmrProviderTestEntry>,
}

/// Runs a live probe against an MMR provider using the configured local
/// profile, so the source can be verified before a match starts.
#[tauri::command]
pub async fn test_mmr_provider(
    state: State<'_, AppState>,
    provider: String,
) -> Result<MmrProviderTestResult, String> {
    if provider != crate::core::mmr::RLSTATS_WEBVIEW_PROVIDER {
        return Err(format!(
            "El test en vivo todavia no esta disponible para '{provider}'."
        ));
    }

    let settings = get_settings(&state.db_pool).map_err(|e| e.to_string())?;
    let (platform, identifier) =
        crate::core::mmr::resolve_rlstats_test_target(&settings).map_err(|e| e.to_string())?;

    let started = std::time::Instant::now();
    let scraper = state.rlstats_scraper.clone();
    let outcome = scraper.fetch_profile(&platform, &identifier).await;
    let latency_ms = i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX);

    match outcome {
        Ok(extracted) => {
            let _ = record_mmr_provider_attempt(
                &state.db_pool,
                &provider,
                "ok",
                None,
                Some(latency_ms),
            );
            let entries = extracted
                .playlists
                .iter()
                .map(|item| MmrProviderTestEntry {
                    playlist: item.label.clone(),
                    mmr: item.mmr.map(|value| value.round() as i32),
                    rank_name: item.rank.clone(),
                    division: item.division.clone(),
                    matches_played: item.matches,
                })
                .collect::<Vec<_>>();
            let message = if entries.is_empty() {
                format!("Perfil cargado pero sin playlists rankeadas ({platform}/{identifier}).")
            } else {
                format!(
                    "{} playlists leidas en {} ms ({platform}/{identifier}).",
                    entries.len(),
                    latency_ms
                )
            };
            Ok(MmrProviderTestResult {
                provider,
                ok: true,
                message,
                latency_ms,
                entries,
            })
        }
        Err(error) => {
            let message = error.to_string();
            let trimmed = message.chars().take(300).collect::<String>();
            let _ = record_mmr_provider_attempt(
                &state.db_pool,
                &provider,
                "error",
                Some(trimmed.as_str()),
                Some(latency_ms),
            );
            Ok(MmrProviderTestResult {
                provider,
                ok: false,
                message,
                latency_ms,
                entries: Vec::new(),
            })
        }
    }
}
