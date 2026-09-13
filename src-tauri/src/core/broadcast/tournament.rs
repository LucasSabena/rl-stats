//! Tournament management: teams, brackets, schedules and results.
//!
//! The bracket engine is deliberately pure Rust with unit tests: single
//! elimination generation (with byes) and round-robin schedules are computed
//! from the registered teams, and winners are propagated into the next round
//! as soon as a match is reported.
//!
//! A bracket match can start a live **series**: the series then appears in the
//! Control Room and on the overlays, so scores and the BO format carry over.

use crate::core::storage::DbPool;
use crate::error::{AppError, AppResult};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tracing::info;

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn new_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

pub const FORMATS: &[&str] = &["single_elim", "round_robin"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tournament {
    pub id: String,
    pub name: String,
    pub format: String,
    pub best_of: i64,
    pub status: String,
    pub settings: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TournamentTeam {
    pub tournament_id: String,
    pub team_id: String,
    pub seed: i64,
    pub checked_in: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TournamentMatch {
    pub id: String,
    pub tournament_id: String,
    pub round: i64,
    pub position: i64,
    pub bracket: String,
    pub team_a_id: Option<String>,
    pub team_b_id: Option<String>,
    pub score_a: i64,
    pub score_b: i64,
    pub winner_team_id: Option<String>,
    pub series_id: Option<String>,
    pub status: String,
    pub station: Option<String>,
    pub scheduled_at: Option<String>,
}

fn tournament_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Tournament> {
    let settings: String = row.get(5)?;
    Ok(Tournament {
        id: row.get(0)?,
        name: row.get(1)?,
        format: row.get(2)?,
        best_of: row.get(3)?,
        status: row.get(4)?,
        settings: serde_json::from_str(&settings).unwrap_or_else(|_| json!({})),
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn match_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TournamentMatch> {
    Ok(TournamentMatch {
        id: row.get(0)?,
        tournament_id: row.get(1)?,
        round: row.get(2)?,
        position: row.get(3)?,
        bracket: row.get(4)?,
        team_a_id: row.get(5)?,
        team_b_id: row.get(6)?,
        score_a: row.get(7)?,
        score_b: row.get(8)?,
        winner_team_id: row.get(9)?,
        series_id: row.get(10)?,
        status: row.get(11)?,
        station: row.get(12)?,
        scheduled_at: row.get(13)?,
    })
}

const MATCH_COLUMNS: &str = "id, tournament_id, round, position, bracket, team_a_id, team_b_id, score_a, score_b, winner_team_id, series_id, status, station, scheduled_at";

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

pub fn list_tournaments(pool: &DbPool) -> AppResult<Vec<Tournament>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let mut statement = conn
        .prepare("SELECT id, name, format, best_of, status, settings_json, created_at, updated_at FROM tournaments ORDER BY updated_at DESC")
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let rows = statement
        .query_map([], tournament_from_row)
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::StorageError(error.to_string()))
}

pub fn get_tournament(pool: &DbPool, id: &str) -> AppResult<Option<Tournament>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.query_row(
        "SELECT id, name, format, best_of, status, settings_json, created_at, updated_at FROM tournaments WHERE id = ?1",
        params![id],
        tournament_from_row,
    )
    .optional()
    .map_err(|error| AppError::StorageError(error.to_string()))
}

pub fn save_tournament(
    pool: &DbPool,
    id: Option<&str>,
    name: &str,
    format: &str,
    best_of: i64,
    status: Option<&str>,
) -> AppResult<Tournament> {
    if !FORMATS.contains(&format) {
        return Err(AppError::ConfigError(format!(
            "Formato de torneo no soportado: {format}"
        )));
    }
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let timestamp = now();
    let best_of = best_of.clamp(1, 99);

    if let Some(id) = id.filter(|value| !value.is_empty()) {
        let Some(existing) = get_tournament(pool, id)? else {
            return Err(AppError::StorageError(format!(
                "Tournament not found: {id}"
            )));
        };
        let status = status.unwrap_or(&existing.status);
        conn.execute(
            "UPDATE tournaments SET name = ?2, format = ?3, best_of = ?4, status = ?5, updated_at = ?6 WHERE id = ?1",
            params![id, name, format, best_of, status, timestamp],
        )
        .map_err(|error| AppError::StorageError(error.to_string()))?;
        return Ok(Tournament {
            id: id.to_string(),
            name: name.to_string(),
            format: format.to_string(),
            best_of,
            status: status.to_string(),
            settings: existing.settings,
            created_at: existing.created_at,
            updated_at: timestamp,
        });
    }

    let tournament = Tournament {
        id: new_id(),
        name: name.to_string(),
        format: format.to_string(),
        best_of,
        status: "draft".to_string(),
        settings: json!({}),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    conn.execute(
        "INSERT INTO tournaments (id, name, format, best_of, status, settings_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            tournament.id,
            tournament.name,
            tournament.format,
            tournament.best_of,
            tournament.status,
            tournament.settings.to_string(),
            tournament.created_at,
            tournament.updated_at
        ],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    info!(name, format, "Tournament created");
    Ok(tournament)
}

pub fn delete_tournament(pool: &DbPool, id: &str) -> AppResult<()> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute(
        "DELETE FROM tournament_matches WHERE tournament_id = ?1",
        params![id],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute(
        "DELETE FROM tournament_teams WHERE tournament_id = ?1",
        params![id],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute("DELETE FROM tournaments WHERE id = ?1", params![id])
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Registered teams
// ---------------------------------------------------------------------------

pub fn list_tournament_teams(pool: &DbPool, tournament_id: &str) -> AppResult<Vec<TournamentTeam>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let mut statement = conn
        .prepare("SELECT tournament_id, team_id, seed, checked_in FROM tournament_teams WHERE tournament_id = ?1 ORDER BY seed, team_id")
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let rows = statement
        .query_map(params![tournament_id], |row| {
            Ok(TournamentTeam {
                tournament_id: row.get(0)?,
                team_id: row.get(1)?,
                seed: row.get(2)?,
                checked_in: row.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::StorageError(error.to_string()))
}

/// Registers a team. `seed` 0 means "append at the end".
pub fn add_tournament_team(
    pool: &DbPool,
    tournament_id: &str,
    team_id: &str,
    seed: Option<i64>,
) -> AppResult<TournamentTeam> {
    if get_tournament(pool, tournament_id)?.is_none() {
        return Err(AppError::StorageError(format!(
            "Tournament not found: {tournament_id}"
        )));
    }
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let next_seed: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(seed), 0) + 1 FROM tournament_teams WHERE tournament_id = ?1",
            params![tournament_id],
            |row| row.get(0),
        )
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let seed = seed.filter(|value| *value > 0).unwrap_or(next_seed);
    conn.execute(
        "INSERT INTO tournament_teams (tournament_id, team_id, seed, checked_in) VALUES (?1, ?2, ?3, 0)
         ON CONFLICT(tournament_id, team_id) DO UPDATE SET seed = excluded.seed",
        params![tournament_id, team_id, seed],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(TournamentTeam {
        tournament_id: tournament_id.to_string(),
        team_id: team_id.to_string(),
        seed,
        checked_in: false,
    })
}

pub fn remove_tournament_team(pool: &DbPool, tournament_id: &str, team_id: &str) -> AppResult<()> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute(
        "DELETE FROM tournament_teams WHERE tournament_id = ?1 AND team_id = ?2",
        params![tournament_id, team_id],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(())
}

pub fn set_tournament_team_checked_in(
    pool: &DbPool,
    tournament_id: &str,
    team_id: &str,
    checked_in: bool,
) -> AppResult<()> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute(
        "UPDATE tournament_teams SET checked_in = ?3 WHERE tournament_id = ?1 AND team_id = ?2",
        params![tournament_id, team_id, if checked_in { 1 } else { 0 }],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Bracket generation (pure functions with tests)
// ---------------------------------------------------------------------------

/// Bracket order for `size` seeds (1-based): `[1, size, size/2+1, ...]`.
///
/// Standard single-elimination seeding, so seed 1 and seed 2 can only meet in
/// the final and byes always fall to the top seeds.
pub fn seeding_order(size: usize) -> Vec<usize> {
    if size <= 1 {
        return vec![1];
    }
    let previous = seeding_order(size / 2);
    let mut order = Vec::with_capacity(size);
    for seed in previous {
        order.push(seed);
        order.push(size + 1 - seed);
    }
    order
}

pub fn next_power_of_two(value: usize) -> usize {
    let mut size = 1;
    while size < value {
        size *= 2;
    }
    size
}

/// All pairings for a round robin (circle method). Returns rounds, each with
/// `(team_index_a, team_index_b)`.
pub fn round_robin_rounds(team_count: usize) -> Vec<Vec<(usize, usize)>> {
    if team_count < 2 {
        return Vec::new();
    }
    let mut participants: Vec<Option<usize>> = (0..team_count).map(Some).collect();
    if team_count % 2 == 1 {
        participants.push(None);
    }
    let count = participants.len();
    let mut rounds = Vec::new();
    for round in 0..count - 1 {
        let mut pairings = Vec::new();
        for index in 0..count / 2 {
            let left = participants[index];
            let right = participants[count - 1 - index];
            if let (Some(left), Some(right)) = (left, right) {
                // Alternate home/away so repeats read naturally.
                if round % 2 == 0 {
                    pairings.push((left, right));
                } else {
                    pairings.push((right, left));
                }
            }
        }
        rounds.push(pairings);
        // Rotate all but the first participant.
        participants[1..].rotate_right(1);
    }
    rounds
}

// ---------------------------------------------------------------------------
// Bracket persistence + advancement
// ---------------------------------------------------------------------------

pub fn get_tournament_match(pool: &DbPool, match_id: &str) -> AppResult<Option<TournamentMatch>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.query_row(
        &format!("SELECT {MATCH_COLUMNS} FROM tournament_matches WHERE id = ?1"),
        params![match_id],
        match_from_row,
    )
    .optional()
    .map_err(|error| AppError::StorageError(error.to_string()))
}

pub fn list_tournament_matches(
    pool: &DbPool,
    tournament_id: &str,
) -> AppResult<Vec<TournamentMatch>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let mut statement = conn
        .prepare(&format!(
            "SELECT {MATCH_COLUMNS} FROM tournament_matches WHERE tournament_id = ?1 ORDER BY round, position"
        ))
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let rows = statement
        .query_map(params![tournament_id], match_from_row)
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::StorageError(error.to_string()))
}

fn insert_match(
    conn: &rusqlite::Connection,
    tournament_id: &str,
    round: i64,
    position: i64,
    team_a: Option<&str>,
    team_b: Option<&str>,
) -> AppResult<()> {
    let timestamp = now();
    conn.execute(
        "INSERT INTO tournament_matches (id, tournament_id, round, position, bracket, team_a_id, team_b_id, score_a, score_b, winner_team_id, series_id, status, station, scheduled_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'winners', ?5, ?6, 0, 0, NULL, NULL, 'pending', NULL, NULL, ?7, ?7)",
        params![new_id(), tournament_id, round, position, team_a, team_b, timestamp],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(())
}

/// Generates the full single-elimination bracket from the registered teams.
/// Existing matches for the tournament are replaced.
pub fn generate_single_elim(pool: &DbPool, tournament_id: &str) -> AppResult<Vec<TournamentMatch>> {
    let teams = list_tournament_teams(pool, tournament_id)?;
    if teams.len() < 2 {
        return Err(AppError::ConfigError(
            "El torneo necesita al menos 2 equipos".into(),
        ));
    }
    let team_ids: Vec<String> = teams.into_iter().map(|team| team.team_id).collect();
    let size = next_power_of_two(team_ids.len());
    let order = seeding_order(size);
    let rounds = (size as f64).log2() as i64;

    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute(
        "DELETE FROM tournament_matches WHERE tournament_id = ?1",
        params![tournament_id],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;

    // Round 1 from the seeding order; missing seeds become byes.
    for (position, pair) in order.chunks(2).enumerate() {
        let position = position as i64;
        let team_a = pair
            .first()
            .and_then(|seed| team_ids.get(seed.saturating_sub(1)))
            .map(String::as_str);
        let team_b = pair
            .get(1)
            .and_then(|seed| team_ids.get(seed.saturating_sub(1)))
            .map(String::as_str);
        match (team_a, team_b) {
            (Some(team_a), Some(team_b)) => {
                insert_match(
                    &conn,
                    tournament_id,
                    1,
                    position,
                    Some(team_a),
                    Some(team_b),
                )?;
            }
            (Some(team_a), None) => {
                // Bye: the top seed advances without playing.
                insert_match(&conn, tournament_id, 1, position, Some(team_a), None)?;
                conn.execute(
                    "UPDATE tournament_matches SET status = 'finished', winner_team_id = team_a_id WHERE tournament_id = ?1 AND round = 1 AND position = ?2",
                    params![tournament_id, position],
                )
                .map_err(|error| AppError::StorageError(error.to_string()))?;
            }
            (None, Some(team_b)) => {
                insert_match(&conn, tournament_id, 1, position, None, Some(team_b))?;
                conn.execute(
                    "UPDATE tournament_matches SET status = 'finished', winner_team_id = team_b_id WHERE tournament_id = ?1 AND round = 1 AND position = ?2",
                    params![tournament_id, position],
                )
                .map_err(|error| AppError::StorageError(error.to_string()))?;
            }
            (None, None) => {
                insert_match(&conn, tournament_id, 1, position, None, None)?;
                conn.execute(
                    "UPDATE tournament_matches SET status = 'finished' WHERE tournament_id = ?1 AND round = 1 AND position = ?2",
                    params![tournament_id, position],
                )
                .map_err(|error| AppError::StorageError(error.to_string()))?;
            }
        }
    }

    // Empty shells for the following rounds so the UI can draw the whole tree.
    let mut matches_in_round = size / 2;
    for round in 2..=rounds {
        matches_in_round /= 2;
        for position in 0..matches_in_round {
            insert_match(&conn, tournament_id, round, position as i64, None, None)?;
        }
    }

    // Propagate every already-decided match (byes and empty shells).
    advance_all_winners(pool, tournament_id)?;

    info!(teams = team_ids.len(), size, rounds, "Bracket generated");
    list_tournament_matches(pool, tournament_id)
}

/// Generates a round-robin schedule (one match per pairing).
pub fn generate_round_robin(pool: &DbPool, tournament_id: &str) -> AppResult<Vec<TournamentMatch>> {
    let teams = list_tournament_teams(pool, tournament_id)?;
    if teams.len() < 2 {
        return Err(AppError::ConfigError(
            "El torneo necesita al menos 2 equipos".into(),
        ));
    }
    let team_ids: Vec<String> = teams.into_iter().map(|team| team.team_id).collect();
    let rounds = round_robin_rounds(team_ids.len());

    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute(
        "DELETE FROM tournament_matches WHERE tournament_id = ?1",
        params![tournament_id],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;

    for (round_index, pairings) in rounds.iter().enumerate() {
        for (position, (left, right)) in pairings.iter().enumerate() {
            insert_match(
                &conn,
                tournament_id,
                round_index as i64 + 1,
                position as i64,
                team_ids.get(*left).map(String::as_str),
                team_ids.get(*right).map(String::as_str),
            )?;
        }
    }
    info!(teams = team_ids.len(), "Round robin generated");
    list_tournament_matches(pool, tournament_id)
}

/// Moves the winner of every finished match into its next-round slot.
///
/// Idempotent: safe to call after every result (and after generation, for
/// byes). A finished final marks the tournament as finished.
pub fn advance_all_winners(pool: &DbPool, tournament_id: &str) -> AppResult<()> {
    let connection = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let matches = list_tournament_matches(pool, tournament_id)?;
    let Some(tournament) = get_tournament(pool, tournament_id)? else {
        return Ok(());
    };
    if tournament.format != "single_elim" {
        return Ok(());
    }

    let total_rounds = matches.iter().map(|m| m.round).max().unwrap_or(0);
    for current in matches
        .iter()
        .filter(|m| m.status == "finished" && m.winner_team_id.is_some())
    {
        let Some(winner) = current.winner_team_id.clone() else {
            continue;
        };
        if current.round >= total_rounds {
            if tournament.status != "finished" {
                connection
                    .execute(
                        "UPDATE tournaments SET status = 'finished', updated_at = ?2 WHERE id = ?1",
                        params![tournament_id, now()],
                    )
                    .map_err(|error| AppError::StorageError(error.to_string()))?;
            }
            continue;
        }

        let next_round = current.round + 1;
        let next_position = current.position / 2;
        let slot = if current.position % 2 == 0 {
            "team_a_id"
        } else {
            "team_b_id"
        };
        let updated = connection
            .execute(
                &format!(
                    "UPDATE tournament_matches SET {slot} = ?3, updated_at = ?4 WHERE tournament_id = ?1 AND round = ?2 AND position = ?5 AND ({slot} IS NULL OR {slot} != ?3)"
                ),
                params![tournament_id, next_round, winner, now(), next_position],
            )
            .map_err(|error| AppError::StorageError(error.to_string()))?;
        if updated > 0 {
            info!(
                round = next_round,
                position = next_position,
                "Bracket advanced"
            );
        }
    }

    // Settle byes: a match with a single team is only a walkover when the
    // missing side can never arrive. In round 1 that is structural (the team
    // list is shorter than the bracket); in later rounds both feeder matches
    // must already be finished.
    let matches = list_tournament_matches(pool, tournament_id)?;
    for candidate in &matches {
        if candidate.status != "pending"
            || !(candidate.team_a_id.is_some() ^ candidate.team_b_id.is_some())
        {
            continue;
        }
        let bye_is_permanent = if candidate.round <= 1 {
            true
        } else {
            matches
                .iter()
                .filter(|feeder| {
                    feeder.round == candidate.round - 1
                        && (feeder.position == candidate.position * 2
                            || feeder.position == candidate.position * 2 + 1)
                })
                .all(|feeder| feeder.status == "finished")
        };
        if !bye_is_permanent {
            continue;
        }
        let winner = candidate
            .team_a_id
            .clone()
            .or_else(|| candidate.team_b_id.clone());
        connection
            .execute(
                "UPDATE tournament_matches SET status = 'finished', winner_team_id = ?2, updated_at = ?3 WHERE id = ?1",
                params![candidate.id, winner, now()],
            )
            .map_err(|error| AppError::StorageError(error.to_string()))?;
    }
    Ok(())
}

/// Reports a result, decides the winner and advances the bracket.
pub fn report_tournament_match(
    pool: &DbPool,
    match_id: &str,
    score_a: i64,
    score_b: i64,
    winner_team_id: Option<&str>,
) -> AppResult<TournamentMatch> {
    let connection = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let current = connection
        .query_row(
            &format!("SELECT {MATCH_COLUMNS} FROM tournament_matches WHERE id = ?1"),
            params![match_id],
            match_from_row,
        )
        .optional()
        .map_err(|error| AppError::StorageError(error.to_string()))?
        .ok_or_else(|| AppError::StorageError(format!("Match not found: {match_id}")))?;

    let winner = match winner_team_id {
        Some(winner) => winner.to_string(),
        None => {
            if score_a > score_b {
                current.team_a_id.clone().unwrap_or_default()
            } else if score_b > score_a {
                current.team_b_id.clone().unwrap_or_default()
            } else {
                String::new()
            }
        }
    };
    let finished = !winner.is_empty();

    connection
        .execute(
            "UPDATE tournament_matches SET score_a = ?2, score_b = ?3, winner_team_id = ?4, status = ?5, updated_at = ?6 WHERE id = ?1",
            params![
                match_id,
                score_a.max(0),
                score_b.max(0),
                if finished { Some(winner.as_str()) } else { None },
                if finished { "finished" } else { "live" },
                now()
            ],
        )
        .map_err(|error| AppError::StorageError(error.to_string()))?;

    advance_all_winners(pool, &current.tournament_id)?;

    connection
        .query_row(
            &format!("SELECT {MATCH_COLUMNS} FROM tournament_matches WHERE id = ?1"),
            params![match_id],
            match_from_row,
        )
        .map_err(|error| AppError::StorageError(error.to_string()))
}

/// Links a live series to a bracket match so the Control Room shows it.
pub fn attach_series(pool: &DbPool, match_id: &str, series_id: &str) -> AppResult<()> {
    let connection = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    connection
        .execute(
            "UPDATE tournament_matches SET series_id = ?2, status = 'live', updated_at = ?3 WHERE id = ?1",
            params![match_id, series_id, now()],
        )
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(())
}

/// Full snapshot for the Control Room and the overlay bracket widget.
pub fn tournament_snapshot(pool: &DbPool, tournament_id: Option<&str>) -> AppResult<Value> {
    let tournament = match tournament_id {
        Some(id) => get_tournament(pool, id)?,
        None => {
            let conn = pool
                .get()
                .map_err(|error| AppError::StorageError(error.to_string()))?;
            conn.query_row(
                "SELECT id, name, format, best_of, status, settings_json, created_at, updated_at FROM tournaments ORDER BY CASE status WHEN 'live' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, updated_at DESC LIMIT 1",
                [],
                tournament_from_row,
            )
            .optional()
            .map_err(|error| AppError::StorageError(error.to_string()))?
        }
    };
    let Some(tournament) = tournament else {
        return Ok(json!({ "available": false }));
    };

    let teams = crate::core::broadcast::store::list_teams_with_logos(pool)?;
    let registered = list_tournament_teams(pool, &tournament.id)?;
    let matches = list_tournament_matches(pool, &tournament.id)?;

    let registered_values: Vec<Value> = registered
        .iter()
        .map(|entry| {
            let team = teams
                .iter()
                .find(|team| team["id"].as_str() == Some(entry.team_id.as_str()))
                .cloned()
                .unwrap_or_else(|| json!({ "id": entry.team_id, "name": "Equipo" }));
            json!({
                "teamId": entry.team_id,
                "seed": entry.seed,
                "checkedIn": entry.checked_in,
                "team": team,
            })
        })
        .collect();

    let match_values: Vec<Value> = matches
        .iter()
        .map(|entry| {
            json!({
                "id": entry.id,
                "round": entry.round,
                "position": entry.position,
                "bracket": entry.bracket,
                "teamAId": entry.team_a_id,
                "teamBId": entry.team_b_id,
                "scoreA": entry.score_a,
                "scoreB": entry.score_b,
                "winnerTeamId": entry.winner_team_id,
                "seriesId": entry.series_id,
                "status": entry.status,
                "station": entry.station,
            })
        })
        .collect();

    Ok(json!({
        "available": true,
        "id": tournament.id,
        "name": tournament.name,
        "format": tournament.format,
        "bestOf": tournament.best_of,
        "status": tournament.status,
        "teams": registered_values,
        "matches": match_values,
        "rounds": matches.iter().map(|m| m.round).max().unwrap_or(0),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_pool(name: &str) -> DbPool {
        let dir = std::env::temp_dir().join(format!(
            "rl-stats-tournament-{}-{}-{}",
            name,
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        crate::core::storage::init_storage(dir.join("test.db")).expect("init storage")
    }

    #[test]
    fn seeding_order_pairs_top_seeds_with_byes() {
        assert_eq!(seeding_order(2), vec![1, 2]);
        assert_eq!(seeding_order(4), vec![1, 4, 2, 3]);
        assert_eq!(seeding_order(8), vec![1, 8, 4, 5, 2, 7, 3, 6]);
    }

    #[test]
    fn round_robin_covers_every_pairing_once() {
        let rounds = round_robin_rounds(4);
        assert_eq!(rounds.len(), 3);
        let mut pairs: Vec<(usize, usize)> = rounds
            .iter()
            .flat_map(|round| round.iter().copied())
            .map(|(a, b)| (a.min(b), a.max(b)))
            .collect();
        pairs.sort();
        assert_eq!(pairs, vec![(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]);

        // Odd team counts get a bye each round without a fake pairing.
        let odd = round_robin_rounds(3);
        assert_eq!(odd.len(), 3);
    }

    #[test]
    fn single_elim_generates_byes_and_advances_them() {
        let pool = temp_pool("bracket");
        let tournament = save_tournament(&pool, None, "Copa", "single_elim", 3, None).unwrap();
        for index in 0..3 {
            let team = crate::core::broadcast::store::upsert_team(
                &pool,
                None,
                &format!("Equipo {index}"),
                &format!("E{index}"),
                "#111111",
                "#222222",
                None,
            )
            .unwrap();
            add_tournament_team(&pool, &tournament.id, &team.id, None).unwrap();
        }

        let matches = generate_single_elim(&pool, &tournament.id).unwrap();
        // 3 teams -> size 4 -> round 1 has 2 matches, round 2 (final) has 1.
        assert_eq!(matches.len(), 3);
        let round_one: Vec<&TournamentMatch> = matches.iter().filter(|m| m.round == 1).collect();
        assert_eq!(round_one.len(), 2);
        let bye = round_one
            .iter()
            .find(|m| m.team_a_id.is_some() ^ m.team_b_id.is_some())
            .expect("one bye in round 1");
        assert_eq!(bye.status, "finished");
        assert!(bye.winner_team_id.is_some());

        let final_match = matches.iter().find(|m| m.round == 2).unwrap();
        assert!(
            final_match.team_a_id.is_some() || final_match.team_b_id.is_some(),
            "the bye must have been propagated into the final"
        );
    }

    #[test]
    fn reporting_results_advances_until_the_final() {
        let pool = temp_pool("advance");
        let tournament = save_tournament(&pool, None, "Liga", "single_elim", 1, None).unwrap();
        let mut team_ids = Vec::new();
        for index in 0..4 {
            let team = crate::core::broadcast::store::upsert_team(
                &pool,
                None,
                &format!("T{index}"),
                &format!("T{index}"),
                "#111111",
                "#222222",
                None,
            )
            .unwrap();
            add_tournament_team(&pool, &tournament.id, &team.id, None).unwrap();
            team_ids.push(team.id);
        }
        generate_single_elim(&pool, &tournament.id).unwrap();

        // Report both semifinals; winners meet in the final.
        let matches = list_tournament_matches(&pool, &tournament.id).unwrap();
        let semis: Vec<TournamentMatch> =
            matches.iter().filter(|m| m.round == 1).cloned().collect();
        for semi in &semis {
            let winner = semi.team_a_id.clone().unwrap();
            report_tournament_match(&pool, &semi.id, 3, 1, Some(&winner)).unwrap();
        }

        let matches = list_tournament_matches(&pool, &tournament.id).unwrap();
        let final_match = matches.iter().find(|m| m.round == 2).unwrap();
        assert_eq!(final_match.status, "pending");
        assert!(final_match.team_a_id.is_some());
        assert!(final_match.team_b_id.is_some());

        let champion = final_match.team_a_id.clone().unwrap();
        report_tournament_match(&pool, &final_match.id, 2, 0, None).unwrap();

        let snapshot = tournament_snapshot(&pool, Some(&tournament.id)).unwrap();
        assert_eq!(snapshot["status"], "finished");
        assert_eq!(snapshot["matches"].as_array().unwrap().len(), 3);
        assert!(snapshot["matches"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["winnerTeamId"] == champion));
    }

    #[test]
    fn round_robin_generates_one_match_per_pairing() {
        let pool = temp_pool("rr");
        let tournament = save_tournament(&pool, None, "RR", "round_robin", 3, None).unwrap();
        for index in 0..4 {
            let team = crate::core::broadcast::store::upsert_team(
                &pool,
                None,
                &format!("R{index}"),
                &format!("R{index}"),
                "#111111",
                "#222222",
                None,
            )
            .unwrap();
            add_tournament_team(&pool, &tournament.id, &team.id, None).unwrap();
        }
        let matches = generate_round_robin(&pool, &tournament.id).unwrap();
        assert_eq!(matches.len(), 6);
    }

    #[test]
    fn tournament_requires_two_teams_and_known_format() {
        let pool = temp_pool("validation");
        let tournament = save_tournament(&pool, None, "X", "single_elim", 3, None).unwrap();
        assert!(generate_single_elim(&pool, &tournament.id).is_err());
        assert!(save_tournament(&pool, None, "Y", "battle_royale", 3, None).is_err());
    }
}
