use crate::core::metrics::{self, StreakData};
use crate::core::settings::get_settings;
use crate::core::storage::{self, get_conn, MatchSession};
use crate::AppState;
use serde::Deserialize;
use std::collections::HashMap;
use tauri::State;
use tracing::error;

/// Local calendar window `(start, end)` in `YYYY-MM-DD`, ending today.
/// Rollup buckets and every match-window query are local-time based, so the
/// window boundaries must be local dates too; computing them in UTC shifted
/// evening sessions across the day boundary (UTC-3 lost everything played
/// after 21:00).
pub(crate) fn local_window(days: i64) -> (String, String) {
    let end = chrono::Local::now().date_naive();
    let start = end - chrono::Duration::days(days.max(0));
    (
        start.format("%Y-%m-%d").to_string(),
        end.format("%Y-%m-%d").to_string(),
    )
}

fn is_local_identity(
    local_primary_id: Option<&str>,
    player_names: &[String],
    primary_id: &str,
    name: &str,
) -> bool {
    if local_primary_id == Some(primary_id) {
        return true;
    }

    let normalized_name = name.trim();
    player_names
        .iter()
        .any(|candidate| candidate.trim().eq_ignore_ascii_case(normalized_name))
}

#[allow(clippy::too_many_arguments)]
fn get_session_scope_stats(
    pool: &crate::core::storage::DbPool,
    start_time: &str,
    end_time: &str,
    local_primary_id: Option<&str>,
    player_names: &[String],
    playlist: Option<&str>,
    match_type: Option<&str>,
    scope: &str,
) -> Result<(f64, f64), String> {
    let conn = get_conn(pool).map_err(|e| e.to_string())?;

    let mut sql =
        String::from("SELECT id FROM matches WHERE start_time >= ?1 AND start_time <= ?2");
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(start_time.to_string()),
        Box::new(end_time.to_string()),
    ];

    if let Some(mt) = match_type {
        sql.push_str(" AND LOWER(match_type) = LOWER(?)");
        args.push(Box::new(mt.to_string()));
    } else {
        sql.push_str(" AND LOWER(COALESCE(match_type, '')) != 'training'");
    }
    if let Some(pl) = playlist {
        sql.push_str(" AND LOWER(playlist) = LOWER(?)");
        args.push(Box::new(pl.to_string()));
    }

    let arg_refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|arg| arg.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let match_ids: Vec<i64> = stmt
        .query_map(&*arg_refs, |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if match_ids.is_empty() {
        return Ok((0.0, 0.0));
    }

    let local_stats_by_match =
        storage::get_local_match_stats(pool, &match_ids, local_primary_id, player_names)
            .map_err(|e| e.to_string())?;

    let mut total_score = 0i32;
    let mut scored_matches = 0i32;
    for match_id in &match_ids {
        if let Some(stats) = local_stats_by_match.get(match_id) {
            total_score += if scope == "me" {
                stats.score
            } else {
                stats.team_score
            };
            scored_matches += 1;
        }
    }

    let placeholders = vec!["?"; match_ids.len()].join(", ");
    let speed_sql = format!(
        "SELECT mp.match_id, mp.team_num, mp.speed, p.primary_id, p.name
         FROM match_players mp
         JOIN players p ON mp.player_id = p.id
         WHERE mp.match_id IN ({})",
        placeholders
    );
    let speed_params: Vec<&dyn rusqlite::ToSql> = match_ids
        .iter()
        .map(|match_id| match_id as &dyn rusqlite::ToSql)
        .collect();
    let mut speed_stmt = conn.prepare(&speed_sql).map_err(|e| e.to_string())?;
    let rows = speed_stmt
        .query_map(&*speed_params, |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i32>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut peak_speed = 0.0f64;
    for row in rows {
        let (match_id, team_num, speed, primary_id, name) = row.map_err(|e| e.to_string())?;
        let Some(local_stats) = local_stats_by_match.get(&match_id) else {
            continue;
        };

        let include = if scope == "me" {
            is_local_identity(local_primary_id, player_names, &primary_id, &name)
        } else {
            local_stats.local_team_num == Some(team_num)
        };

        if include && speed > peak_speed {
            peak_speed = speed;
        }
    }

    let avg_score = if scored_matches > 0 {
        total_score as f64 / scored_matches as f64
    } else {
        0.0
    };

    Ok((avg_score, peak_speed))
}

#[derive(Deserialize)]
pub struct AnalyticsPeriod {
    pub days: i32,
}

#[derive(Deserialize)]
pub struct SessionMatchesQuery {
    pub start_time: String,
    pub end_time: String,
}

/// Per-profile analytics summary: the same shape as the `summary` object of
/// `get_analytics`, but computed for an arbitrary recorded player (friends,
/// teammates, opponents) instead of the local identity.
#[tauri::command]
pub async fn get_player_analytics_summary(
    state: State<'_, AppState>,
    player_id: String,
    period: AnalyticsPeriod,
    playlist: Option<String>,
    match_type: Option<String>,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;
    let days = if period.days == 0 {
        365
    } else {
        period.days as i64
    };
    let (start_str, end_str) = local_window(days);

    let summary = storage::get_analytics_summary_for_identity(
        pool,
        &player_id,
        &start_str,
        &end_str,
        playlist.as_deref(),
        match_type.as_deref(),
    )
    .map_err(|e| e.to_string())?;

    let streak = metrics::calculate_streaks(
        pool,
        &player_id,
        &start_str,
        &end_str,
        playlist.as_deref(),
        match_type.as_deref(),
    )
    .unwrap_or(StreakData {
        best_streak: 0,
        current_streak: 0,
    });

    let total_matches = summary.total_matches;
    let wins = summary.wins;
    let losses = summary.losses;

    Ok(serde_json::json!({
        "period": if period.days == 1 { "day" } else if period.days == 7 { "week" } else { "month" },
        "totalMatches": total_matches,
        "wins": wins,
        "losses": losses,
        "winRate": if total_matches > 0 { ((wins as f64 / total_matches as f64) * 100.0).round() as i32 } else { 0 },
        "avgScore": summary.avg_score,
        "avgGoals": if total_matches > 0 { summary.total_goals as f64 / total_matches as f64 } else { 0.0 },
        "avgAssists": if total_matches > 0 { summary.total_assists as f64 / total_matches as f64 } else { 0.0 },
        "avgSaves": if total_matches > 0 { summary.total_saves as f64 / total_matches as f64 } else { 0.0 },
        "avgShots": if total_matches > 0 { summary.total_shots as f64 / total_matches as f64 } else { 0.0 },
        "avgBoost": 0.0,
        "totalGoals": summary.total_goals,
        "totalAssists": summary.total_assists,
        "totalSaves": summary.total_saves,
        "totalShots": summary.total_shots,
        "totalDemos": summary.total_demos,
        "totalConceded": summary.total_conceded,
        "totalKickoffGoalsScored": summary.total_kickoff_goals,
        "totalKickoffGoalsConceded": summary.total_kickoff_conceded,
        "avgKickoffGoalsScored": if total_matches > 0 { summary.total_kickoff_goals as f64 / total_matches as f64 } else { 0.0 },
        "avgKickoffGoalsConceded": if total_matches > 0 { summary.total_kickoff_conceded as f64 / total_matches as f64 } else { 0.0 },
        "bestStreak": streak.best_streak,
        "currentStreak": streak.current_streak,
        "peakSpeed": summary.peak_speed,
        "avgDuration": summary.avg_duration,
    }))
}

/// Local calendar window ending `end_days_ago` days ago and starting
/// `start_days_ago` days before today (both inclusive).
fn local_window_ago(start_days_ago: i64, end_days_ago: i64) -> (String, String) {
    let today = chrono::Local::now().date_naive();
    let start = today - chrono::Duration::days(start_days_ago);
    let end = today - chrono::Duration::days(end_days_ago);
    (
        start.format("%Y-%m-%d").to_string(),
        end.format("%Y-%m-%d").to_string(),
    )
}

/// Side-by-side analytics comparison.
///
/// `mode = "players"`: the selected identity vs `rival_id` over the current
/// window. `mode = "periods"`: the selected identity over the current window
/// vs the immediately preceding window of the same length.
#[tauri::command]
pub async fn get_analytics_comparison(
    state: State<'_, AppState>,
    mode: String,
    player_id: Option<String>,
    rival_id: Option<String>,
    period: AnalyticsPeriod,
    playlist: Option<String>,
    match_type: Option<String>,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;
    let settings = get_settings(pool).unwrap_or_default();
    let identity = match player_id {
        Some(pid) if !pid.trim().is_empty() => pid,
        _ => settings.local_primary_id.clone().unwrap_or_default(),
    };
    if identity.trim().is_empty() {
        return Ok(serde_json::json!({ "available": false }));
    }

    let days = if period.days == 0 {
        365
    } else {
        i64::from(period.days)
    }
    .max(1);
    let (cur_start, cur_end) = local_window(days);
    // Previous window ends the day before the current one starts, so the two
    // windows never double-count a day.
    let (prev_start, prev_end) = local_window_ago(days * 2, days + 1);

    let summarize = |who: &str, start: &str, end: &str| {
        storage::get_analytics_summary_for_identity(
            pool,
            who,
            start,
            end,
            playlist.as_deref(),
            match_type.as_deref(),
        )
    };

    let (a, b, window_a, window_b) = match mode.as_str() {
        "periods" => {
            let a = summarize(&identity, &cur_start, &cur_end).map_err(|e| e.to_string())?;
            let b = summarize(&identity, &prev_start, &prev_end).map_err(|e| e.to_string())?;
            (a, b, (cur_start, cur_end), (prev_start, prev_end))
        }
        _ => {
            let rival = match rival_id {
                Some(rid) if !rid.trim().is_empty() => rid,
                _ => return Ok(serde_json::json!({ "available": false })),
            };
            let a = summarize(&identity, &cur_start, &cur_end).map_err(|e| e.to_string())?;
            let b = summarize(&rival, &cur_start, &cur_end).map_err(|e| e.to_string())?;
            (
                a,
                b,
                (cur_start.clone(), cur_end.clone()),
                (cur_start, cur_end),
            )
        }
    };

    Ok(serde_json::json!({
        "available": a.total_matches > 0 || b.total_matches > 0,
        "mode": mode,
        "a": a,
        "b": b,
        "windowA": { "start": window_a.0, "end": window_a.1 },
        "windowB": { "start": window_b.0, "end": window_b.1 },
    }))
}

#[tauri::command]
pub async fn get_analytics(
    state: State<'_, AppState>,
    period: AnalyticsPeriod,
    playlist: Option<String>,
    match_type: Option<String>,
    scope: Option<String>,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;
    let scope_str = scope.as_deref().unwrap_or("team");

    if period.days == 0 {
        return get_session_analytics_inner(state, playlist, match_type, scope).await;
    }

    let (start_str, end_str) = local_window(period.days as i64);

    let settings = get_settings(pool).unwrap_or_default();
    let player_names = storage::identity_candidate_names(&settings);

    let is_individual = scope_str == "me";
    let local_id = settings.local_primary_id.as_deref();

    let has_filters = playlist.is_some() || match_type.is_some();
    let rollups = if has_filters || is_individual {
        storage::get_daily_rollups_filtered(
            pool,
            &start_str,
            &end_str,
            local_id,
            &player_names,
            playlist.as_deref(),
            match_type.as_deref(),
            Some(scope_str),
        )
        .map_err(|e| e.to_string())?
    } else {
        storage::get_daily_rollups(pool, &start_str, &end_str).map_err(|e| e.to_string())?
    };

    let (
        total_matches,
        wins,
        losses,
        total_goals,
        total_conceded,
        total_shots,
        total_saves,
        total_demos,
        total_assists,
        avg_duration,
        avg_score,
        peak_speed,
        streak,
    ) = if is_individual {
        if let Some(local_id_str) = local_id {
            let summary = storage::get_analytics_summary_for_identity(
                pool,
                local_id_str,
                &start_str,
                &end_str,
                playlist.as_deref(),
                match_type.as_deref(),
            )
            .map_err(|e| e.to_string())?;
            let streak_data = metrics::calculate_streaks(
                pool,
                local_id_str,
                &start_str,
                &end_str,
                playlist.as_deref(),
                match_type.as_deref(),
            )
            .unwrap_or(StreakData {
                best_streak: 0,
                current_streak: 0,
            });
            (
                summary.total_matches,
                summary.wins,
                summary.losses,
                summary.total_goals,
                summary.total_conceded,
                summary.total_shots,
                summary.total_saves,
                summary.total_demos,
                summary.total_assists,
                summary.avg_duration,
                summary.avg_score,
                summary.peak_speed,
                streak_data,
            )
        } else {
            // Individual scope without local_primary_id: compute from individual rollups
            let total_matches: i32 = rollups.iter().map(|r| r.matches_played).sum();
            let wins: i32 = rollups.iter().map(|r| r.wins).sum();
            let losses: i32 = rollups.iter().map(|r| r.losses).sum();
            let total_goals: i32 = rollups.iter().map(|r| r.goals_scored).sum();
            let total_conceded: i32 = rollups.iter().map(|r| r.goals_conceded).sum();
            let total_shots: i32 = rollups.iter().map(|r| r.total_shots).sum();
            let total_saves: i32 = rollups.iter().map(|r| r.total_saves).sum();
            let total_demos: i32 = rollups.iter().map(|r| r.total_demos).sum();
            let total_assists: i32 = rollups.iter().map(|r| r.total_assists).sum();

            let avg_duration: f64 = if total_matches > 0 {
                rollups
                    .iter()
                    .map(|r| r.avg_duration_seconds as f64 * r.matches_played as f64)
                    .sum::<f64>()
                    / total_matches as f64
            } else {
                0.0
            };

            let avg_score: f64 = if total_matches > 0 {
                rollups
                    .iter()
                    .map(|r| r.avg_score as f64 * r.matches_played as f64)
                    .sum::<f64>()
                    / total_matches as f64
            } else {
                0.0
            };

            (
                total_matches,
                wins,
                losses,
                total_goals,
                total_conceded,
                total_shots,
                total_saves,
                total_demos,
                total_assists,
                avg_duration,
                avg_score,
                0.0,
                StreakData {
                    best_streak: 0,
                    current_streak: 0,
                },
            )
        }
    } else {
        let total_matches: i32 = rollups.iter().map(|r| r.matches_played).sum();
        let wins: i32 = rollups.iter().map(|r| r.wins).sum();
        let losses: i32 = rollups.iter().map(|r| r.losses).sum();
        let total_goals: i32 = rollups.iter().map(|r| r.goals_scored).sum();
        let total_conceded: i32 = rollups.iter().map(|r| r.goals_conceded).sum();
        let total_shots: i32 = rollups.iter().map(|r| r.total_shots).sum();
        let total_saves: i32 = rollups.iter().map(|r| r.total_saves).sum();
        let total_demos: i32 = rollups.iter().map(|r| r.total_demos).sum();
        let total_assists: i32 = rollups.iter().map(|r| r.total_assists).sum();

        let avg_duration: f64 = if total_matches > 0 {
            rollups
                .iter()
                .map(|r| r.avg_duration_seconds as f64 * r.matches_played as f64)
                .sum::<f64>()
                / total_matches as f64
        } else {
            0.0
        };

        let avg_score: f64 = if total_matches > 0 {
            rollups
                .iter()
                .map(|r| r.avg_score as f64 * r.matches_played as f64)
                .sum::<f64>()
                / total_matches as f64
        } else {
            0.0
        };

        let (peak_speed, streak) = if let Some(ref local_id_str) = settings.local_primary_id {
            let speed = get_team_period_peak_speed(
                pool,
                local_id_str,
                &start_str,
                &end_str,
                playlist.as_deref(),
                match_type.as_deref(),
            )
            .unwrap_or(0.0);
            let streak_data = metrics::calculate_streaks(
                pool,
                local_id_str,
                &start_str,
                &end_str,
                playlist.as_deref(),
                match_type.as_deref(),
            )
            .unwrap_or(StreakData {
                best_streak: 0,
                current_streak: 0,
            });
            (speed, streak_data)
        } else {
            (
                0.0,
                StreakData {
                    best_streak: 0,
                    current_streak: 0,
                },
            )
        };

        (
            total_matches,
            wins,
            losses,
            total_goals,
            total_conceded,
            total_shots,
            total_saves,
            total_demos,
            total_assists,
            avg_duration,
            avg_score,
            peak_speed,
            streak,
        )
    };

    let avg_goals = if total_matches > 0 {
        total_goals as f64 / total_matches as f64
    } else {
        0.0
    };
    let avg_assists = if total_matches > 0 {
        total_assists as f64 / total_matches as f64
    } else {
        0.0
    };
    let avg_saves = if total_matches > 0 {
        total_saves as f64 / total_matches as f64
    } else {
        0.0
    };
    let avg_shots = if total_matches > 0 {
        total_shots as f64 / total_matches as f64
    } else {
        0.0
    };

    let total_kickoff_goals_scored: i32 = rollups.iter().map(|r| r.kickoff_goals_scored).sum();
    let total_kickoff_goals_conceded: i32 = rollups.iter().map(|r| r.kickoff_goals_conceded).sum();
    let avg_kickoff_goals_scored = if total_matches > 0 {
        total_kickoff_goals_scored as f64 / total_matches as f64
    } else {
        0.0
    };
    let avg_kickoff_goals_conceded = if total_matches > 0 {
        total_kickoff_goals_conceded as f64 / total_matches as f64
    } else {
        0.0
    };

    Ok(serde_json::json!({
        "rollups": rollups,
        "summary": {
            "period": if period.days == 1 { "day" } else if period.days == 7 { "week" } else { "month" },
            "totalMatches": total_matches,
            "wins": wins,
            "losses": losses,
            "winRate": if total_matches > 0 { ((wins as f64 / total_matches as f64) * 100.0).round() as i32 } else { 0 },
            "avgScore": avg_score,
            "avgGoals": avg_goals,
            "avgAssists": avg_assists,
            "avgSaves": avg_saves,
            "avgShots": avg_shots,
            "avgBoost": 0.0,
            "totalGoals": total_goals,
            "totalAssists": total_assists,
            "totalSaves": total_saves,
            "totalShots": total_shots,
            "totalDemos": total_demos,
            "totalConceded": total_conceded,
            "totalKickoffGoalsScored": total_kickoff_goals_scored,
            "totalKickoffGoalsConceded": total_kickoff_goals_conceded,
            "avgKickoffGoalsScored": avg_kickoff_goals_scored,
            "avgKickoffGoalsConceded": avg_kickoff_goals_conceded,
            "bestStreak": streak.best_streak,
            "currentStreak": streak.current_streak,
            "peakSpeed": peak_speed,
            "avgDuration": avg_duration,
        }
    }))
}

#[tauri::command]
pub async fn get_sessions(
    state: State<'_, AppState>,
    gap_minutes: Option<u32>,
    playlist: Option<String>,
    match_type: Option<String>,
    scope: Option<String>,
) -> Result<Vec<MatchSession>, String> {
    let pool = &state.db_pool;
    let settings = get_settings(pool).unwrap_or_default();
    let minutes = gap_minutes.unwrap_or(settings.session_gap_minutes);
    let scope_str = scope.as_deref().unwrap_or("team");

    storage::get_match_sessions(
        pool,
        minutes,
        playlist.as_deref(),
        match_type.as_deref(),
        Some(scope_str),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_daily_rollups(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
    playlist: Option<String>,
    match_type: Option<String>,
    scope: Option<String>,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;
    let scope_str = scope.as_deref().unwrap_or("team");
    let has_filters = playlist.is_some() || match_type.is_some();
    let rollups = if has_filters || scope_str == "me" {
        let settings = get_settings(pool).unwrap_or_default();
        let player_names = storage::identity_candidate_names(&settings);
        storage::get_daily_rollups_filtered(
            pool,
            &start_date,
            &end_date,
            settings.local_primary_id.as_deref(),
            &player_names,
            playlist.as_deref(),
            match_type.as_deref(),
            Some(scope_str),
        )
    } else {
        storage::get_daily_rollups(pool, &start_date, &end_date)
    };
    match rollups {
        Ok(rollups) => Ok(serde_json::json!({ "rollups": rollups })),
        Err(e) => {
            error!(error = %e, "Failed to get daily rollups");
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn get_session_matches(
    state: State<'_, AppState>,
    query: SessionMatchesQuery,
) -> Result<Vec<serde_json::Value>, String> {
    let pool = &state.db_pool;
    let conn = get_conn(pool).map_err(|e| e.to_string())?;
    let settings = get_settings(pool).unwrap_or_default();
    let player_names = storage::identity_candidate_names(&settings);

    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.guid, m.start_time, m.end_time, m.arena,
                m.score_blue, m.score_orange, m.winner,
                m.is_online, m.is_overtime, m.duration_seconds,
                m.match_type, m.playlist, m.mood
         FROM matches m
         WHERE m.start_time >= ?1 AND m.start_time <= ?2
           AND LOWER(COALESCE(m.match_type, '')) != 'training'
         ORDER BY m.start_time ASC",
        )
        .map_err(|e| e.to_string())?;

    let matches: Vec<serde_json::Value> = stmt
        .query_map(
            rusqlite::params![&query.start_time, &query.end_time],
            |row| {
                let match_id: i64 = row.get(0)?;
                let guid: String = row.get(1)?;
                let start_time: String = row.get(2)?;
                let end_time: Option<String> = row.get(3)?;
                let arena: Option<String> = row.get(4)?;
                let score_blue: i32 = row.get(5)?;
                let score_orange: i32 = row.get(6)?;
                let winner: Option<i32> = row.get(7)?;
                let is_online: i32 = row.get(8)?;
                let is_overtime: i32 = row.get(9)?;
                let duration_seconds: i32 = row.get(10)?;
                let match_type: Option<String> = row.get(11)?;
                let playlist: Option<String> = row.get(12)?;
                let mood: Option<String> = row.get(13).unwrap_or(None);

                Ok(serde_json::json!({
                    "id": match_id,
                    "guid": guid,
                    "start_time": start_time,
                    "end_time": end_time,
                    "arena": arena,
                    "score_blue": score_blue,
                    "score_orange": score_orange,
                    "winner": winner,
                    "is_online": is_online != 0,
                    "is_overtime": is_overtime != 0,
                    "duration_seconds": duration_seconds,
                    "match_type": match_type,
                    "playlist": playlist,
                    "mood": mood,
                }))
            },
        )
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let match_ids: Vec<i64> = matches
        .iter()
        .filter_map(|m| m.get("id").and_then(|value| value.as_i64()))
        .collect();

    // Chunk the IN list: a long session can reference thousands of matches and
    // SQLite caps bound variables per statement (~32k), plus the prepare cost
    // grows with the placeholder count.
    const MATCH_ID_CHUNK: usize = 500;
    let mut players_by_match: HashMap<i64, Vec<serde_json::Value>> = HashMap::new();
    for chunk in match_ids.chunks(MATCH_ID_CHUNK) {
        let placeholders = vec!["?"; chunk.len()].join(", ");
        let sql = format!(
            "SELECT mp.match_id, mp.team_num, mp.score, mp.goals, mp.shots, mp.assists,
                    mp.saves, mp.demos, mp.speed, mp.boost,
                    mp.touches, mp.kickoff_goals, p.name, p.primary_id
             FROM match_players mp
             JOIN players p ON mp.player_id = p.id
             WHERE mp.match_id IN ({})",
            placeholders
        );
        let mut player_stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = player_stmt
            .query_map(rusqlite::params_from_iter(chunk.iter().copied()), |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    serde_json::json!({
                        "team_num": row.get::<_, i32>(1)?,
                        "score": row.get::<_, i32>(2)?,
                        "goals": row.get::<_, i32>(3)?,
                        "shots": row.get::<_, i32>(4)?,
                        "assists": row.get::<_, i32>(5)?,
                        "saves": row.get::<_, i32>(6)?,
                        "demos": row.get::<_, i32>(7)?,
                        "speed": row.get::<_, f64>(8)?,
                        "boost": row.get::<_, i32>(9)?,
                        "touches": row.get::<_, i32>(10)?,
                        "kickoff_goals": row.get::<_, i32>(11)?,
                        "name": row.get::<_, String>(12)?,
                        "primary_id": row.get::<_, String>(13)?,
                    }),
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (match_id, player) = row.map_err(|e| e.to_string())?;
            players_by_match.entry(match_id).or_default().push(player);
        }
    }

    let mut result = Vec::new();
    for m in matches {
        let Some(match_id) = m["id"].as_i64() else {
            continue;
        };
        let players = players_by_match.remove(&match_id).unwrap_or_default();

        // Prefer the primary id; fall back to the configured player names so a
        // match recorded before the id was learned still resolves the local
        // team (the same fallback get_local_match_stats uses).
        let local_team = if let Some(ref lid) = settings.local_primary_id {
            players
                .iter()
                .find(|p| p["primary_id"].as_str() == Some(lid.as_str()))
                .or_else(|| {
                    player_names.iter().find_map(|name| {
                        players.iter().find(|p| {
                            p["name"]
                                .as_str()
                                .is_some_and(|n| n.eq_ignore_ascii_case(name.trim()))
                        })
                    })
                })
                .and_then(|p| p["team_num"].as_i64())
                .map(|t| t as i32)
        } else {
            player_names
                .iter()
                .find_map(|name| {
                    players
                        .iter()
                        .find(|p| {
                            p["name"]
                                .as_str()
                                .is_some_and(|n| n.eq_ignore_ascii_case(name.trim()))
                        })
                        .and_then(|p| p["team_num"].as_i64())
                })
                .map(|t| t as i32)
        };

        let is_win = matches!(
            (m["winner"].as_i64(), local_team),
            (Some(w), Some(lt)) if w == lt as i64
        );

        let my_diffs = local_team.map(|lt| {
            let scored = m[if lt == 0 {
                "score_blue"
            } else {
                "score_orange"
            }]
            .as_i64()
            .unwrap_or(0);
            let conceded = m[if lt == 0 {
                "score_orange"
            } else {
                "score_blue"
            }]
            .as_i64()
            .unwrap_or(0);
            scored - conceded
        });

        let my_kickoff_goals = local_team.map(|lt| {
            players
                .iter()
                .filter(|p| p["team_num"].as_i64() == Some(lt as i64))
                .map(|p| p["kickoff_goals"].as_i64().unwrap_or(0) as i32)
                .sum::<i32>()
        });

        let their_kickoff_goals = local_team.map(|lt| {
            players
                .iter()
                .filter(|p| p["team_num"].as_i64() != Some(lt as i64))
                .map(|p| p["kickoff_goals"].as_i64().unwrap_or(0) as i32)
                .sum::<i32>()
        });

        result.push(serde_json::json!({
            "id": match_id,
            "guid": m["guid"],
            "start_time": m["start_time"],
            "end_time": m["end_time"],
            "arena": m["arena"],
            "score_blue": m["score_blue"],
            "score_orange": m["score_orange"],
            "winner": m["winner"],
            "is_online": m["is_online"],
            "is_overtime": m["is_overtime"],
            "duration_seconds": m["duration_seconds"],
            "match_type": m["match_type"],
            "playlist": m["playlist"],
            "mood": m["mood"],
            "players": players,
            "local_team": local_team,
            "is_win": is_win,
            "goal_diff": my_diffs,
            "my_kickoff_goals": my_kickoff_goals,
            "their_kickoff_goals": their_kickoff_goals,
        }));
    }

    Ok(result)
}

#[tauri::command]
pub async fn get_insights(
    state: State<'_, AppState>,
    period: AnalyticsPeriod,
    playlist: Option<String>,
    match_type: Option<String>,
    scope: Option<String>,
    player_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;
    let settings = get_settings(pool).unwrap_or_default();

    // Per-profile analytics: when a player_id (primary id of a friend or any
    // recorded player) is given, insights are computed for that player instead
    // of the local identity.
    let local_id = match player_id {
        Some(pid) if !pid.trim().is_empty() => pid,
        _ => match settings.local_primary_id {
            Some(ref id) => id.clone(),
            None => return Ok(serde_json::json!({ "available": false })),
        },
    };

    let days = if period.days == 0 {
        365
    } else {
        period.days as i64
    };
    let (start_str, end_str) = local_window(days);

    let scope_str = scope.as_deref().unwrap_or("team");

    let insights = storage::get_insights(
        pool,
        &local_id,
        &start_str,
        &end_str,
        playlist.as_deref(),
        match_type.as_deref(),
        Some(scope_str),
    )
    .map_err(|e| e.to_string())?;

    Ok(insights)
}

#[tauri::command]
pub async fn get_player_analytics_matches(
    state: State<'_, AppState>,
    player_id: String,
    period: AnalyticsPeriod,
    playlist: Option<String>,
    match_type: Option<String>,
    limit: Option<i64>,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;
    let days = if period.days == 0 {
        365
    } else {
        period.days as i64
    };
    let (start_str, end_str) = local_window(days);

    let matches = storage::get_player_analytics_matches(
        pool,
        &player_id,
        &start_str,
        &end_str,
        playlist.as_deref(),
        match_type.as_deref(),
        limit.unwrap_or(50),
    )
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "matches": matches }))
}

async fn get_session_analytics_inner(
    state: State<'_, AppState>,
    playlist: Option<String>,
    match_type: Option<String>,
    scope: Option<String>,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;
    let settings = get_settings(pool).unwrap_or_default();
    let scope_str = scope.as_deref().unwrap_or("team");
    let sessions = storage::get_match_sessions(
        pool,
        settings.session_gap_minutes,
        playlist.as_deref(),
        match_type.as_deref(),
        Some(scope_str),
    )
    .map_err(|e| e.to_string())?;

    // Use only the most recent session for summary stats
    let recent = sessions.first();

    let total_matches = recent.map(|s| s.match_count).unwrap_or(0);
    let wins = recent.map(|s| s.wins).unwrap_or(0);
    let losses = recent.map(|s| s.losses).unwrap_or(0);
    let total_goals = recent.map(|s| s.goals_scored).unwrap_or(0);
    let total_conceded = recent.map(|s| s.goals_conceded).unwrap_or(0);
    let total_shots = recent.map(|s| s.total_shots).unwrap_or(0);
    let total_saves = recent.map(|s| s.total_saves).unwrap_or(0);
    let total_assists = recent.map(|s| s.total_assists).unwrap_or(0);
    let total_demos = recent.map(|s| s.total_demos).unwrap_or(0);

    let (start_str, end_str) = if let Some(s) = recent {
        let start = chrono::DateTime::parse_from_rfc3339(&s.start_time).ok();
        let end = chrono::DateTime::parse_from_rfc3339(&s.end_time).ok();
        // Local dates: every date-window query filters on
        // `date(start_time, 'localtime')`.
        (
            start
                .map(|d| {
                    d.with_timezone(&chrono::Local)
                        .format("%Y-%m-%d")
                        .to_string()
                })
                .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string()),
            end.map(|d| {
                d.with_timezone(&chrono::Local)
                    .format("%Y-%m-%d")
                    .to_string()
            })
            .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string()),
        )
    } else {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        (today.clone(), today)
    };

    let player_names = storage::identity_candidate_names(&settings);
    let (avg_score, peak_speed) = if let Some(recent_session) = recent {
        get_session_scope_stats(
            pool,
            &recent_session.start_time,
            &recent_session.end_time,
            settings.local_primary_id.as_deref(),
            &player_names,
            playlist.as_deref(),
            match_type.as_deref(),
            scope_str,
        )
        .unwrap_or((0.0, 0.0))
    } else {
        (0.0, 0.0)
    };

    let avg_duration: f64 = if total_matches > 0 {
        recent
            .map(|s| s.duration_seconds as f64 / total_matches as f64)
            .unwrap_or(0.0)
    } else {
        0.0
    };

    let streak = if let Some(ref local_id) = settings.local_primary_id {
        metrics::calculate_streaks(
            pool,
            local_id,
            &start_str,
            &end_str,
            playlist.as_deref(),
            match_type.as_deref(),
        )
        .unwrap_or(StreakData {
            best_streak: 0,
            current_streak: 0,
        })
    } else {
        StreakData {
            best_streak: 0,
            current_streak: 0,
        }
    };

    let avg_goals = if total_matches > 0 {
        total_goals as f64 / total_matches as f64
    } else {
        0.0
    };
    let avg_assists = if total_matches > 0 {
        total_assists as f64 / total_matches as f64
    } else {
        0.0
    };
    let avg_saves = if total_matches > 0 {
        total_saves as f64 / total_matches as f64
    } else {
        0.0
    };
    let avg_shots = if total_matches > 0 {
        total_shots as f64 / total_matches as f64
    } else {
        0.0
    };

    let total_kickoff_goals_scored = recent.map(|s| s.kickoff_goals_scored).unwrap_or(0);
    let total_kickoff_goals_conceded = recent.map(|s| s.kickoff_goals_conceded).unwrap_or(0);
    let avg_kickoff_goals_scored = if total_matches > 0 {
        total_kickoff_goals_scored as f64 / total_matches as f64
    } else {
        0.0
    };
    let avg_kickoff_goals_conceded = if total_matches > 0 {
        total_kickoff_goals_conceded as f64 / total_matches as f64
    } else {
        0.0
    };

    Ok(serde_json::json!({
        "sessions": sessions,
        "summary": {
            "totalMatches": total_matches,
            "wins": wins,
            "losses": losses,
            "avgScore": avg_score,
            "avgGoals": avg_goals,
            "avgAssists": avg_assists,
            "avgSaves": avg_saves,
            "avgShots": avg_shots,
            "avgBoost": 0.0,
            "totalGoals": total_goals,
            "totalAssists": total_assists,
            "totalSaves": total_saves,
            "totalShots": total_shots,
            "totalDemos": total_demos,
            "totalConceded": total_conceded,
            "totalKickoffGoalsScored": total_kickoff_goals_scored,
            "totalKickoffGoalsConceded": total_kickoff_goals_conceded,
            "avgKickoffGoalsScored": avg_kickoff_goals_scored,
            "avgKickoffGoalsConceded": avg_kickoff_goals_conceded,
            "bestStreak": streak.best_streak,
            "currentStreak": streak.current_streak,
            "peakSpeed": peak_speed,
            "avgDuration": avg_duration,
        }
    }))
}

/// Peak speed of the local player's *team* across the window.
///
/// Team scope must agree with the session-detail numbers, which take the max
/// over every teammate. Before this, team scope reported the local player's
/// personal max while the session view reported the team's, so the same
/// session showed two different peaks.
fn get_team_period_peak_speed(
    pool: &crate::core::storage::DbPool,
    local_primary_id: &str,
    start_date: &str,
    end_date: &str,
    playlist: Option<&str>,
    match_type: Option<&str>,
) -> Result<f64, String> {
    let conn = get_conn(pool).map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT COALESCE(MAX(mp.speed), 0.0)
         FROM match_players mp
         JOIN matches m ON mp.match_id = m.id
         WHERE date(m.start_time, 'localtime') >= ?2
           AND date(m.start_time, 'localtime') <= ?3
           AND mp.team_num = (
                SELECT mp2.team_num
                FROM match_players mp2
                JOIN players p2 ON p2.id = mp2.player_id
                WHERE mp2.match_id = m.id AND p2.primary_id = ?1
                LIMIT 1
           )",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    args.push(Box::new(local_primary_id.to_string()));
    args.push(Box::new(start_date.to_string()));
    args.push(Box::new(end_date.to_string()));

    if let Some(mt) = match_type {
        sql.push_str(" AND LOWER(m.match_type) = LOWER(?)");
        args.push(Box::new(mt.to_string()));
    } else {
        sql.push_str(" AND LOWER(COALESCE(m.match_type, '')) != 'training'");
    }

    if let Some(pl) = playlist {
        sql.push_str(" AND LOWER(m.playlist) = LOWER(?)");
        args.push(Box::new(pl.to_string()));
    }

    let params_refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();

    conn.query_row(&sql, &*params_refs, |row| row.get(0))
        .map_err(|e| e.to_string())
}

// ─── Session-pattern analytics (fatigue, chemistry, custom builder) ─────────

/// Shared date window + identity resolution for the pattern endpoints.
/// `period.days == 0` (the "session" view) falls back to a year of history,
/// mirroring `get_insights`.
fn pattern_window(
    pool: &crate::core::storage::DbPool,
    period_days: i32,
    player_id: Option<String>,
) -> Result<(String, String, String), String> {
    let settings = get_settings(pool).unwrap_or_default();
    let identity = match player_id {
        Some(pid) if !pid.trim().is_empty() => pid,
        _ => settings.local_primary_id.clone().unwrap_or_default(),
    };
    if identity.trim().is_empty() {
        return Err("no identity".into());
    }
    let days = if period_days == 0 {
        365
    } else {
        period_days as i64
    };
    let (start_str, end_str) = local_window(days);
    Ok((identity, start_str, end_str))
}

fn unavailable() -> serde_json::Value {
    serde_json::json!({ "available": false })
}

/// Fatigue curve: win rate by game number inside the session, by 15-minute
/// buckets, momentum splits and the detected drop-off points.
#[tauri::command]
pub async fn get_session_curve(
    state: State<'_, AppState>,
    period: AnalyticsPeriod,
    playlist: Option<String>,
    match_type: Option<String>,
    player_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;
    let (identity, start_str, end_str) = match pattern_window(pool, period.days, player_id) {
        Ok(window) => window,
        Err(_) => return Ok(unavailable()),
    };
    let settings = get_settings(pool).unwrap_or_default();
    crate::core::patterns::get_session_curve(
        pool,
        &identity,
        &start_str,
        &end_str,
        playlist.as_deref(),
        match_type.as_deref(),
        settings.session_gap_minutes,
    )
    .map_err(|e| e.to_string())
}

/// Teammate chemistry: win rate with every player who shared the local
/// player's team, plus results by team size.
#[tauri::command]
pub async fn get_teammate_stats(
    state: State<'_, AppState>,
    period: AnalyticsPeriod,
    playlist: Option<String>,
    match_type: Option<String>,
    player_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;
    let (identity, start_str, end_str) = match pattern_window(pool, period.days, player_id) {
        Ok(window) => window,
        Err(_) => return Ok(unavailable()),
    };
    crate::core::patterns::get_teammate_stats(
        pool,
        &identity,
        &start_str,
        &end_str,
        playlist.as_deref(),
        match_type.as_deref(),
    )
    .map_err(|e| e.to_string())
}

/// Generic breakdown for the custom-analysis builder: bucket matches by
/// `dimension` (`hour`, `weekday`, `playlist`, `arena`, `match_type`, `mood`,
/// `game_number`, `minute_bucket`, `prev_result`).
#[tauri::command]
pub async fn get_custom_breakdown(
    state: State<'_, AppState>,
    period: AnalyticsPeriod,
    dimension: String,
    playlist: Option<String>,
    match_type: Option<String>,
    player_id: Option<String>,
) -> Result<serde_json::Value, String> {
    const DIMENSIONS: &[&str] = &[
        "hour",
        "weekday",
        "playlist",
        "arena",
        "match_type",
        "mood",
        "game_number",
        "minute_bucket",
        "prev_result",
    ];
    if !DIMENSIONS.contains(&dimension.as_str()) {
        return Err(format!("Unknown dimension: {dimension}"));
    }
    let pool = &state.db_pool;
    let (identity, start_str, end_str) = match pattern_window(pool, period.days, player_id) {
        Ok(window) => window,
        Err(_) => return Ok(unavailable()),
    };
    let settings = get_settings(pool).unwrap_or_default();
    crate::core::patterns::get_custom_breakdown(
        pool,
        &identity,
        &start_str,
        &end_str,
        playlist.as_deref(),
        match_type.as_deref(),
        settings.session_gap_minutes,
        &dimension,
    )
    .map_err(|e| e.to_string())
}

/// One-shot kickoff-goal recount from the persisted goal timeline.
/// Refreshes the daily rollups afterwards so the summary cards pick up the
/// corrected totals.
#[tauri::command]
pub async fn recompute_kickoff_goals(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;
    let settings = get_settings(pool).unwrap_or_default();
    let mut report = crate::core::patterns::recompute_kickoff_goals(
        pool,
        settings.kickoff_goal_threshold_seconds,
    )
    .map_err(|e| e.to_string())?;

    let player_names = storage::identity_candidate_names(&settings);
    match storage::rebuild_daily_rollups_for_identity(
        pool,
        settings.local_primary_id.as_deref(),
        &player_names,
    ) {
        Ok(()) => report["rollupsRebuilt"] = serde_json::json!(true),
        Err(e) => report["rollupsRebuilt"] = serde_json::json!(format!("failed: {e}")),
    }
    Ok(report)
}

/// Training-time analytics for the selected period: total tracked time,
/// session count, average session length, a per-local-day series and an
/// hour-of-day distribution. Complements the match analytics on the
/// Analytics page.
#[tauri::command]
pub async fn get_training_analytics(
    state: State<'_, AppState>,
    period: AnalyticsPeriod,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;

    if period.days == 0 {
        // "Session" view has no meaning for training; report an empty window
        // so the UI can hide the panel instead of guessing a range.
        return Ok(serde_json::json!({
            "totalSessions": 0,
            "totalSeconds": 0,
            "avgSessionSeconds": 0,
            "days": [],
            "byHour": [],
            "enabled": false,
        }));
    }

    let enabled = get_settings(pool)
        .map(|s| s.training_tracking_enabled)
        .unwrap_or(true);
    if !enabled {
        return Ok(serde_json::json!({
            "totalSessions": 0,
            "totalSeconds": 0,
            "avgSessionSeconds": 0,
            "days": [],
            "byHour": [],
            "enabled": false,
        }));
    }

    let (start_str, end_str) = local_window(period.days.max(1) as i64);

    let mut stats =
        storage::get_training_stats(pool, &start_str, &end_str).map_err(|e| e.to_string())?;
    stats["enabled"] = serde_json::json!(true);
    stats["period"] = serde_json::json!(period.days);
    Ok(stats)
}
