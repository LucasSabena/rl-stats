//! Tauri commands for the tournament module.
//!
//! Delegates to `core::broadcast::tournament` (CRUD, bracket generation,
//! results) and publishes a `tournament` event on the broadcast hub after
//! every mutation so overlays and the Control Room stay in sync.

use crate::core::broadcast::tournament::{self, Tournament, TournamentMatch, TournamentTeam};
use crate::core::broadcast::{store, ActionRequest};
use crate::AppState;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::State;

fn storage_error(error: crate::error::AppError) -> String {
    error.to_string()
}

fn publish_tournament(state: &State<'_, AppState>, tournament_id: Option<&str>) {
    let pool = state.db_pool.clone();
    let hub = state.broadcast_hub.clone();
    let tournament_id = tournament_id.map(str::to_string);
    tauri::async_runtime::spawn(async move {
        let snapshot = tauri::async_runtime::spawn_blocking(move || {
            tournament::tournament_snapshot(&pool, tournament_id.as_deref())
        })
        .await
        .ok()
        .and_then(Result::ok)
        .unwrap_or_else(|| json!({ "available": false }));
        hub.publish_typed("tournament", Some(snapshot));
    });
}

#[tauri::command]
pub async fn list_tournaments(state: State<'_, AppState>) -> Result<Vec<Tournament>, String> {
    tournament::list_tournaments(&state.db_pool).map_err(storage_error)
}

#[tauri::command]
pub async fn save_tournament(
    state: State<'_, AppState>,
    id: Option<String>,
    name: String,
    format: String,
    best_of: i64,
    status: Option<String>,
) -> Result<Tournament, String> {
    let saved = tournament::save_tournament(
        &state.db_pool,
        id.as_deref(),
        &name,
        &format,
        best_of,
        status.as_deref(),
    )
    .map_err(storage_error)?;
    publish_tournament(&state, Some(&saved.id));
    Ok(saved)
}

#[tauri::command]
pub async fn delete_tournament(state: State<'_, AppState>, id: String) -> Result<(), String> {
    tournament::delete_tournament(&state.db_pool, &id).map_err(storage_error)?;
    publish_tournament(&state, None);
    Ok(())
}

#[tauri::command]
pub async fn list_tournament_teams(
    state: State<'_, AppState>,
    tournament_id: String,
) -> Result<Vec<TournamentTeam>, String> {
    tournament::list_tournament_teams(&state.db_pool, &tournament_id).map_err(storage_error)
}

#[tauri::command]
pub async fn add_tournament_team(
    state: State<'_, AppState>,
    tournament_id: String,
    team_id: String,
    seed: Option<i64>,
) -> Result<TournamentTeam, String> {
    let entry = tournament::add_tournament_team(&state.db_pool, &tournament_id, &team_id, seed)
        .map_err(storage_error)?;
    publish_tournament(&state, Some(&tournament_id));
    Ok(entry)
}

#[tauri::command]
pub async fn remove_tournament_team(
    state: State<'_, AppState>,
    tournament_id: String,
    team_id: String,
) -> Result<(), String> {
    tournament::remove_tournament_team(&state.db_pool, &tournament_id, &team_id)
        .map_err(storage_error)?;
    publish_tournament(&state, Some(&tournament_id));
    Ok(())
}

#[tauri::command]
pub async fn set_tournament_team_checked_in(
    state: State<'_, AppState>,
    tournament_id: String,
    team_id: String,
    checked_in: bool,
) -> Result<(), String> {
    tournament::set_tournament_team_checked_in(
        &state.db_pool,
        &tournament_id,
        &team_id,
        checked_in,
    )
    .map_err(storage_error)?;
    publish_tournament(&state, Some(&tournament_id));
    Ok(())
}

#[tauri::command]
pub async fn generate_tournament_bracket(
    state: State<'_, AppState>,
    tournament_id: String,
) -> Result<Vec<TournamentMatch>, String> {
    let pool = state.db_pool.clone();
    let id = tournament_id.clone();
    let format = tournament::get_tournament(&pool, &id)
        .map_err(storage_error)?
        .map(|item| item.format)
        .unwrap_or_else(|| "single_elim".to_string());
    let matches = tauri::async_runtime::spawn_blocking(move || {
        if format == "round_robin" {
            tournament::generate_round_robin(&pool, &id)
        } else {
            tournament::generate_single_elim(&pool, &id)
        }
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(storage_error)?;
    publish_tournament(&state, Some(&tournament_id));
    Ok(matches)
}

#[tauri::command]
pub async fn list_tournament_matches(
    state: State<'_, AppState>,
    tournament_id: String,
) -> Result<Vec<TournamentMatch>, String> {
    tournament::list_tournament_matches(&state.db_pool, &tournament_id).map_err(storage_error)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchResultInput {
    pub match_id: String,
    pub score_a: i64,
    pub score_b: i64,
    pub winner_team_id: Option<String>,
}

#[tauri::command]
pub async fn report_tournament_match(
    state: State<'_, AppState>,
    input: MatchResultInput,
) -> Result<TournamentMatch, String> {
    let result = tournament::report_tournament_match(
        &state.db_pool,
        &input.match_id,
        input.score_a,
        input.score_b,
        input.winner_team_id.as_deref(),
    )
    .map_err(storage_error)?;
    publish_tournament(&state, Some(&result.tournament_id));
    Ok(result)
}

/// Starts (or resumes) the live series for a bracket match: the series is
/// what the Control Room and the overlays then follow.
#[tauri::command]
pub async fn start_tournament_match_series(
    state: State<'_, AppState>,
    match_id: String,
) -> Result<Value, String> {
    let entry = tournament::get_tournament_match(&state.db_pool, &match_id)
        .map_err(storage_error)?
        .ok_or_else(|| "Partida de torneo no encontrada".to_string())?;
    let tournament_id = entry.tournament_id.clone();

    let (Some(team_a), Some(team_b)) = (entry.team_a_id.clone(), entry.team_b_id.clone()) else {
        return Err("La partida todavía no tiene ambos equipos".into());
    };

    // Reuse a live series when one is already linked.
    if let Some(series_id) = entry.series_id.as_deref() {
        if let Ok(Some(existing)) = store::get_series(&state.db_pool, series_id) {
            if existing.status == "live" {
                state
                    .broadcast_hub
                    .dispatch(ActionRequest::new("refresh", json!({})));
                return store::series_snapshot(&state.db_pool, Some(series_id))
                    .map_err(storage_error);
            }
        }
    }

    let tournament = tournament::get_tournament(&state.db_pool, &tournament_id)
        .map_err(storage_error)?
        .ok_or_else(|| "Torneo no encontrado".to_string())?;
    let series = store::create_series(
        &state.db_pool,
        &tournament.name,
        tournament.best_of,
        Some(&team_a),
        Some(&team_b),
    )
    .map_err(storage_error)?;
    tournament::attach_series(&state.db_pool, &match_id, &series.id).map_err(storage_error)?;

    publish_tournament(&state, Some(&tournament_id));
    state
        .broadcast_hub
        .dispatch(ActionRequest::new("refresh", json!({})));
    store::series_snapshot(&state.db_pool, Some(&series.id)).map_err(storage_error)
}

#[tauri::command]
pub async fn schedule_tournament_match(
    state: State<'_, AppState>,
    match_id: String,
    station: Option<String>,
    scheduled_at: Option<String>,
) -> Result<TournamentMatch, String> {
    let updated = tournament::schedule_tournament_match(
        &state.db_pool,
        &match_id,
        station.as_deref(),
        scheduled_at.as_deref(),
    )
    .map_err(storage_error)?;
    publish_tournament(&state, Some(&updated.tournament_id));
    Ok(updated)
}

#[tauri::command]
pub async fn get_tournament_snapshot(
    state: State<'_, AppState>,
    tournament_id: Option<String>,
) -> Result<Value, String> {
    tournament::tournament_snapshot(&state.db_pool, tournament_id.as_deref()).map_err(storage_error)
}
