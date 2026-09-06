use crate::core::settings::{get_settings, AppSettings};
use crate::core::storage::{self, MatchQuery};
use crate::AppState;
use serde::Deserialize;
use serde_json::Value;
use tauri::State;
use tracing::error;

#[derive(Deserialize)]
pub struct MatchFilters {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub arena: Option<String>,
    pub match_type: Option<String>,
    pub playlist: Option<String>,
    pub result: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub search: Option<String>,
}

#[tauri::command]
pub async fn get_matches(
    state: State<'_, AppState>,
    filters: MatchFilters,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;
    let limit = filters.limit.unwrap_or(50);
    let offset = filters.offset.unwrap_or(0);
    let arena = filters.arena.as_deref();
    let match_type = filters.match_type.as_deref();
    let playlist = filters.playlist.as_deref();
    let result_filter = filters.result.as_deref();
    let date_from = filters.date_from.as_deref();
    let date_to = filters.date_to.as_deref();
    let search = filters.search.as_deref();

    let settings = load_identity_settings(pool);
    let player_names = resolve_local_player_names(&settings);
    let local_primary_id = settings.local_primary_id.as_deref();

    match storage::get_matches(
        pool,
        MatchQuery {
            limit,
            offset,
            arena,
            match_type,
            playlist,
            result: None,
            date_from,
            date_to,
            search,
        },
    ) {
        Ok(matches) => {
            let match_ids: Vec<i64> = matches.iter().map(|m| m.id).collect();
            let local_stats_by_match =
                storage::get_local_match_stats(pool, &match_ids, local_primary_id, &player_names)
                    .unwrap_or_default();
            let mut result: Vec<serde_json::Value> = Vec::new();
            for m in matches {
                let local_team = local_stats_by_match
                    .get(&m.id)
                    .and_then(|stats| stats.local_team_num);

                if let Some(rf) = result_filter {
                    match rf {
                        "win"
                            if m.winner.is_none()
                                || local_team.is_none()
                                || m.winner != local_team =>
                        {
                            continue;
                        }
                        "loss"
                            if m.winner.is_none()
                                || local_team.is_none()
                                || m.winner == local_team =>
                        {
                            continue;
                        }
                        _ => {}
                    }
                }

                result.push(serde_json::json!({
                    "id": m.id,
                    "guid": m.guid,
                    "start_time": m.start_time,
                    "end_time": m.end_time,
                    "arena": m.arena,
                    "score_blue": m.score_blue,
                    "score_orange": m.score_orange,
                    "winner": m.winner,
                    "local_team_num": local_team,
                    "is_online": m.is_online,
                    "is_overtime": m.is_overtime,
                    "duration_seconds": m.duration_seconds,
                    "match_type": m.match_type,
                    "playlist": m.playlist,
                    "mood": m.mood,
                }));
            }
            Ok(serde_json::json!({ "matches": result }))
        }
        Err(e) => {
            error!(error = %e, "Failed to get matches");
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn get_match_detail(
    state: State<'_, AppState>,
    match_id: i64,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;
    let settings = load_identity_settings(pool);
    let player_names = resolve_local_player_names(&settings);
    let local_primary_id = settings.local_primary_id.as_deref();
    match storage::get_match_detail(pool, match_id) {
        Ok((m, players)) => {
            let events = storage::get_match_events(pool, match_id)
                .map(|events| map_match_events(events, m.start_time))
                .unwrap_or_default();
            let goals = build_goals_from_events(&events);

            Ok(serde_json::json!({
                "match": {
                "id": m.id,
                "guid": m.guid,
                "start_time": m.start_time,
                "end_time": m.end_time,
                "arena": m.arena,
                "score_blue": m.score_blue,
                "score_orange": m.score_orange,
                "winner": m.winner,
                "local_team_num": storage::get_local_team_num(pool, m.id, local_primary_id, &player_names).ok().flatten(),
                "is_online": m.is_online,
                "is_overtime": m.is_overtime,
                "duration_seconds": m.duration_seconds,
                "match_type": m.match_type,
                "playlist": m.playlist,
                "mood": m.mood,
            },
                "players": players,
                "events": events,
                "goals": goals,
            }))
        }
        Err(e) => {
            error!(error = %e, match_id, "Failed to get match detail");
            Err(e.to_string())
        }
    }
}

fn map_match_events(
    events: Vec<crate::core::models::MatchEvent>,
    start_time: chrono::DateTime<chrono::Utc>,
) -> Vec<Value> {
    events
        .into_iter()
        .map(|event| {
            let parsed = serde_json::from_str::<Value>(&event.event_data).unwrap_or_else(|_| serde_json::json!({}));
            let relative_seconds = (event.occurred_at - start_time).num_seconds().max(0);

            let data = match event.event_type.as_str() {
                "GoalScored" => {
                    let scorer = parsed.get("scorer").cloned().unwrap_or_else(|| serde_json::json!({}));
                    let assister = parsed.get("assister").cloned();
                    serde_json::json!({
                        "team": scorer.get("teamNum").and_then(|v| v.as_i64()).unwrap_or(0),
                        "scorer_id": scorer.get("id").and_then(|v| v.as_str()).unwrap_or_default(),
                        "scorer_name": scorer.get("name").and_then(|v| v.as_str()).unwrap_or("Desconocido"),
                        "assister_id": assister
                            .as_ref()
                            .and_then(|value| value.get("id"))
                            .and_then(|v| v.as_str()),
                        "assister_name": assister
                            .as_ref()
                            .and_then(|value| value.get("name"))
                            .and_then(|v| v.as_str()),
                    })
                }
                "StatfeedEvent" => serde_json::json!({
                    "event_type": parsed.get("eventName").and_then(|v| v.as_str()).unwrap_or("Unknown"),
                    "team": parsed
                        .get("mainTarget")
                        .and_then(|value| value.get("teamNum"))
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0),
                    "player_name": parsed
                        .get("mainTarget")
                        .and_then(|value| value.get("name"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("Jugador"),
                }),
                _ => parsed,
            };

            serde_json::json!({
                "id": event.id.to_string(),
                "type": event.event_type,
                "timestamp": relative_seconds,
                "data": data,
            })
        })
        .collect()
}

fn build_goals_from_events(events: &[Value]) -> Vec<Value> {
    events
        .iter()
        .enumerate()
        .filter_map(|(idx, event)| {
            if event.get("type").and_then(|v| v.as_str()) != Some("GoalScored") {
                return None;
            }

            let data = event.get("data")?;
            let ball_speed = data
                .get("ball_speed")
                .and_then(|v| v.as_f64())
                .or_else(|| data.get("ballSpeed").and_then(|v| v.as_f64()))
                .unwrap_or(0.0);

            Some(serde_json::json!({
                "id": event.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()).unwrap_or_else(|| idx.to_string()),
                "scorerId": data.get("scorer_id").and_then(|v| v.as_str()).unwrap_or_default(),
                "scorerName": data.get("scorer_name").and_then(|v| v.as_str()).unwrap_or("Desconocido"),
                "scorerTeam": data.get("team").and_then(|v| v.as_i64()).unwrap_or(0),
                "assisterId": data.get("assister_id").and_then(|v| v.as_str()),
                "assisterName": data.get("assister_name").and_then(|v| v.as_str()),
                "time": event.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0),
                "ballSpeed": ball_speed,
            }))
        })
        .collect()
}

fn load_identity_settings(pool: &storage::DbPool) -> AppSettings {
    get_settings(pool).unwrap_or_default()
}

fn resolve_local_player_names(settings: &AppSettings) -> Vec<String> {
    let mut names = Vec::new();

    if !settings.player_name.trim().is_empty() {
        names.push(settings.player_name.trim().to_string());
    }

    if let Some(username) = &settings.tracker_username {
        let username = username.trim();
        if !username.is_empty() && !names.iter().any(|name| name.eq_ignore_ascii_case(username)) {
            names.push(username.to_string());
        }
    }

    names
}

#[tauri::command]
pub async fn delete_match_cmd(state: State<'_, AppState>, match_id: i64) -> Result<(), String> {
    let pool = &state.db_pool;
    match storage::delete_match(pool, match_id) {
        Ok(()) => Ok(()),
        Err(e) => {
            error!(error = %e, match_id, "Failed to delete match");
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn update_match_cmd(
    state: State<'_, AppState>,
    match_id: i64,
    match_type: Option<String>,
    playlist: Option<String>,
) -> Result<(), String> {
    let pool = &state.db_pool;
    match storage::update_match(pool, match_id, match_type.as_deref(), playlist.as_deref()) {
        Ok(()) => Ok(()),
        Err(e) => {
            error!(error = %e, match_id, "Failed to update match");
            Err(e.to_string())
        }
    }
}

/// Set (or clear, passing null/empty) the self-reported post-match mood.
#[tauri::command]
pub async fn set_match_mood_cmd(
    state: State<'_, AppState>,
    match_id: i64,
    mood: Option<String>,
) -> Result<(), String> {
    let pool = &state.db_pool;
    match storage::set_match_mood(pool, match_id, mood.as_deref()) {
        Ok(()) => Ok(()),
        Err(e) => {
            error!(error = %e, match_id, "Failed to set match mood");
            Err(e.to_string())
        }
    }
}
