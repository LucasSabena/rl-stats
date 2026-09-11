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

/// Typed shape of a match row in list and detail responses.
///
/// Keeps the exact snake_case keys the frontend maps in `src/lib/api.ts`; a
/// serialization test pins them so a rename cannot silently break the UI.
#[derive(serde::Serialize)]
struct MatchEntry {
    id: i64,
    guid: String,
    start_time: chrono::DateTime<chrono::Utc>,
    end_time: Option<chrono::DateTime<chrono::Utc>>,
    arena: Option<String>,
    score_blue: i32,
    score_orange: i32,
    winner: Option<i32>,
    local_team_num: Option<i32>,
    is_online: bool,
    is_overtime: bool,
    duration_seconds: i32,
    match_type: Option<String>,
    playlist: Option<String>,
    mood: Option<String>,
}

impl MatchEntry {
    fn from_match(m: crate::core::models::Match, local_team_num: Option<i32>) -> Self {
        Self {
            id: m.id,
            guid: m.guid,
            start_time: m.start_time,
            end_time: m.end_time,
            arena: m.arena,
            score_blue: m.score_blue,
            score_orange: m.score_orange,
            winner: m.winner,
            local_team_num,
            is_online: m.is_online,
            is_overtime: m.is_overtime,
            duration_seconds: m.duration_seconds,
            match_type: m.match_type,
            playlist: m.playlist,
            mood: m.mood,
        }
    }
}

#[derive(serde::Serialize)]
struct MatchListResponse {
    matches: Vec<MatchEntry>,
}

#[derive(serde::Serialize)]
struct MatchDetailResponse {
    #[serde(rename = "match")]
    match_entry: MatchEntry,
    players: Vec<crate::core::models::Player>,
    events: Vec<Value>,
    goals: Vec<Value>,
}

#[tauri::command]
pub async fn get_matches(
    state: State<'_, AppState>,
    filters: MatchFilters,
) -> Result<serde_json::Value, String> {
    let pool = state.db_pool.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let limit = filters.limit.unwrap_or(50);
        let offset = filters.offset.unwrap_or(0);
        let arena = filters.arena.as_deref();
        let match_type = filters.match_type.as_deref();
        let playlist = filters.playlist.as_deref();
        let result_filter = filters.result.as_deref();
        let date_from = filters.date_from.as_deref();
        let date_to = filters.date_to.as_deref();
        let search = filters.search.as_deref();

        let settings = load_identity_settings(&pool);
        let player_names = resolve_local_player_names(&settings);
        let local_primary_id = settings.local_primary_id.as_deref();

        match storage::get_matches(
            &pool,
            MatchQuery {
                limit,
                offset,
                arena,
                match_type,
                playlist,
                result: result_filter,
                date_from,
                date_to,
                search,
                local_primary_id,
                local_player_names: &player_names,
            },
        ) {
            Ok(matches) => {
                let match_ids: Vec<i64> = matches.iter().map(|m| m.id).collect();
                let local_stats_by_match = storage::get_local_match_stats(
                    &pool,
                    &match_ids,
                    local_primary_id,
                    &player_names,
                )
                .unwrap_or_default();
                let result: Vec<MatchEntry> = matches
                    .into_iter()
                    .map(|m| {
                        let local_team = local_stats_by_match
                            .get(&m.id)
                            .and_then(|stats| stats.local_team_num);
                        MatchEntry::from_match(m, local_team)
                    })
                    .collect();
                serde_json::to_value(MatchListResponse { matches: result })
                    .map_err(|e| e.to_string())
            }
            Err(e) => {
                error!(error = %e, "Failed to get matches");
                Err(e.to_string())
            }
        }
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

/// Build a CSV of the filtered match history for spreadsheets.
///
/// Returns the file contents (with a UTF-8 BOM so Excel detects the encoding)
/// instead of writing a path: the frontend triggers the actual download, which
/// is how the existing JSON export works too.
#[tauri::command]
pub async fn export_history_csv(
    state: State<'_, AppState>,
    filters: Option<MatchFilters>,
) -> Result<String, String> {
    let pool = state.db_pool.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let f = filters.unwrap_or(MatchFilters {
            limit: None,
            offset: None,
            arena: None,
            match_type: None,
            playlist: None,
            result: None,
            date_from: None,
            date_to: None,
            search: None,
        });

        let settings = load_identity_settings(&pool);
        let player_names = resolve_local_player_names(&settings);
        let local_primary_id = settings.local_primary_id.as_deref();

        let matches = storage::get_matches(
            &pool,
            MatchQuery {
                limit: f.limit.unwrap_or(10_000).clamp(1, 50_000),
                offset: f.offset.unwrap_or(0),
                arena: f.arena.as_deref(),
                match_type: f.match_type.as_deref(),
                playlist: f.playlist.as_deref(),
                result: f.result.as_deref(),
                date_from: f.date_from.as_deref(),
                date_to: f.date_to.as_deref(),
                search: f.search.as_deref(),
                local_primary_id,
                local_player_names: &player_names,
            },
        )
        .map_err(|e| e.to_string())?;

        let match_ids: Vec<i64> = matches.iter().map(|m| m.id).collect();
        let stats_by_match =
            storage::get_local_match_stats(&pool, &match_ids, local_primary_id, &player_names)
                .map_err(|e| e.to_string())?;

        fn csv_field(value: &str) -> String {
            if value.contains([',', '"', '\n', '\r']) {
                format!("\"{}\"", value.replace('"', "\"\""))
            } else {
                value.to_string()
            }
        }

        let mut out = String::from("\u{FEFF}");
        out.push_str(
            "Fecha,Arena,Playlist,Tipo,Resultado,Goles a favor,Goles en contra,Tiempo extra,Duración (s),Goles,Asistencias,Paradas,Tiros,Demos,Puntos,Goles de saque\r\n",
        );

        for m in &matches {
            let stats = stats_by_match.get(&m.id);
            let local_team = stats.and_then(|s| s.local_team_num);
            let (gf, gc) = match local_team {
                Some(0) => (m.score_blue, m.score_orange),
                Some(1) => (m.score_orange, m.score_blue),
                _ => (0, 0),
            };
            let result = match (m.winner, local_team) {
                (Some(w), Some(team)) if w == team => "Victoria",
                (Some(_), Some(_)) => "Derrota",
                (None, Some(_)) => "Empate",
                _ => "Desconocido",
            };
            let duration = m.duration_seconds.max(0);
            let (goals, assists, saves, shots, demos, score, kickoffs) = match stats {
                Some(s) => (
                    s.goals,
                    s.assists,
                    s.saves,
                    s.shots,
                    s.demos,
                    s.score,
                    if local_team.is_some() {
                        s.kickoff_goals
                    } else {
                        0
                    },
                ),
                None => (0, 0, 0, 0, 0, 0, 0),
            };

            out.push_str(&format!(
                "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}\r\n",
                csv_field(&m.start_time.to_rfc3339()),
                csv_field(m.arena.as_deref().unwrap_or("")),
                csv_field(m.playlist.as_deref().unwrap_or("")),
                csv_field(m.match_type.as_deref().unwrap_or("")),
                csv_field(result),
                gf,
                gc,
                if m.is_overtime { "Sí" } else { "No" },
                duration,
                goals,
                assists,
                saves,
                shots,
                demos,
                score,
                kickoffs,
            ));
        }

        Ok(out)
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

#[tauri::command]
pub async fn get_match_detail(
    state: State<'_, AppState>,
    match_id: i64,
) -> Result<serde_json::Value, String> {
    let pool = state.db_pool.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let settings = load_identity_settings(&pool);
        let player_names = resolve_local_player_names(&settings);
        let local_primary_id = settings.local_primary_id.as_deref();
        match storage::get_match_detail(&pool, match_id) {
            Ok((m, players)) => {
                let events = storage::get_match_events(&pool, match_id)
                    .map(|events| map_match_events(events, m.start_time))
                    .unwrap_or_default();
                let goals = build_goals_from_events(&events);
                let local_team_num =
                    storage::get_local_team_num(&pool, m.id, local_primary_id, &player_names)
                        .ok()
                        .flatten();

                let response = MatchDetailResponse {
                    match_entry: MatchEntry::from_match(m, local_team_num),
                    players,
                    events,
                    goals,
                };
                serde_json::to_value(response).map_err(|e| e.to_string())
            }
            Err(e) => {
                error!(error = %e, match_id, "Failed to get match detail");
                Err(e.to_string())
            }
        }
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
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
    let pool = state.db_pool.clone();
    tauri::async_runtime::spawn_blocking(move || match storage::delete_match(&pool, match_id) {
        Ok(()) => Ok(()),
        Err(e) => {
            error!(error = %e, match_id, "Failed to delete match");
            Err(e.to_string())
        }
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

#[tauri::command]
pub async fn update_match_cmd(
    state: State<'_, AppState>,
    match_id: i64,
    match_type: Option<String>,
    playlist: Option<String>,
) -> Result<(), String> {
    let pool = state.db_pool.clone();
    tauri::async_runtime::spawn_blocking(move || {
        match storage::update_match(&pool, match_id, match_type.as_deref(), playlist.as_deref()) {
            Ok(()) => {
                // The pre-aggregated daily rollups exclude training and are keyed
                // by the stored match_type/playlist; an edit without a rebuild left
                // the analytics table stale until the next settings save.
                let settings = get_settings(&pool).unwrap_or_default();
                let names = storage::identity_candidate_names(&settings);
                if let Err(error) = storage::rebuild_daily_rollups_for_identity(
                    &pool,
                    settings.local_primary_id.as_deref(),
                    &names,
                ) {
                    error!(error = %error, match_id, "Rollup rebuild after match update failed");
                }
                Ok(())
            }
            Err(e) => {
                error!(error = %e, match_id, "Failed to update match");
                Err(e.to_string())
            }
        }
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

/// Set (or clear, passing null/empty) the self-reported post-match mood.
#[tauri::command]
pub async fn set_match_mood_cmd(
    state: State<'_, AppState>,
    match_id: i64,
    mood: Option<String>,
) -> Result<(), String> {
    let pool = state.db_pool.clone();
    tauri::async_runtime::spawn_blocking(move || {
        match storage::set_match_mood(&pool, match_id, mood.as_deref()) {
            Ok(()) => Ok(()),
            Err(e) => {
                error!(error = %e, match_id, "Failed to set match mood");
                Err(e.to_string())
            }
        }
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

#[cfg(test)]
mod serialization_tests {
    use super::*;

    fn entry() -> MatchEntry {
        MatchEntry {
            id: 1,
            guid: "guid-1".to_string(),
            start_time: chrono::Utc::now(),
            end_time: None,
            arena: Some("DFH Stadium".to_string()),
            score_blue: 1,
            score_orange: 2,
            winner: Some(1),
            local_team_num: Some(1),
            is_online: true,
            is_overtime: false,
            duration_seconds: 300,
            match_type: Some("ranked".to_string()),
            playlist: Some("Doubles".to_string()),
            mood: None,
        }
    }

    fn keys(value: &serde_json::Value) -> Vec<String> {
        let mut keys: Vec<String> = value.as_object().expect("object").keys().cloned().collect();
        keys.sort();
        keys
    }

    #[test]
    fn match_entry_keeps_the_frontend_contract() {
        let value = serde_json::to_value(entry()).unwrap();
        assert_eq!(
            keys(&value),
            vec![
                "arena",
                "duration_seconds",
                "end_time",
                "guid",
                "id",
                "is_online",
                "is_overtime",
                "local_team_num",
                "match_type",
                "mood",
                "playlist",
                "score_blue",
                "score_orange",
                "start_time",
                "winner",
            ]
        );
        assert!(
            value["start_time"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .is_some(),
            "start_time must stay RFC3339-compatible for Date.parse()"
        );
    }

    #[test]
    fn list_response_wraps_matches() {
        let value = serde_json::to_value(MatchListResponse {
            matches: vec![entry()],
        })
        .unwrap();
        assert_eq!(keys(&value), vec!["matches"]);
    }

    #[test]
    fn detail_response_uses_the_match_key() {
        let value = serde_json::to_value(MatchDetailResponse {
            match_entry: entry(),
            players: Vec::new(),
            events: Vec::new(),
            goals: Vec::new(),
        })
        .unwrap();
        assert_eq!(keys(&value), vec!["events", "goals", "match", "players"]);
    }
}
