use crate::core::models::{
    CameraSettings, ControlSettings, DailyRollup, DeadzoneSettings, HardwareSettings,
    HeadToHeadRecord, Match, MatchEvent, Player, SessionSummary, UserPreset,
};
use crate::error::{AppError, AppResult};
use chrono::{DateTime, Datelike, Local, Timelike, Utc};
use r2d2::{Pool, PooledConnection};
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use tracing::{debug, info};

pub mod migrations;
pub mod sync;

pub type DbPool = Pool<SqliteConnectionManager>;

pub struct FinishMatchUpdate {
    pub end_time: DateTime<Utc>,
    pub score_blue: i32,
    pub score_orange: i32,
    pub winner: Option<i32>,
    pub is_overtime: bool,
    pub duration_seconds: i32,
}

pub struct MatchPlayerRow {
    pub player_id: i64,
    pub team_num: i32,
    pub stats: crate::core::models::PlayerStats,
    pub head_to_head_json: Option<String>,
}

/// MMR snapshot received from the frontend to associate with match players.
#[derive(Clone, Debug, Default, Serialize)]
pub struct MatchMmrSnapshot {
    pub mmr_by_primary_id: HashMap<String, Option<i32>>,
}

#[derive(Clone, Debug, Default)]
pub struct LocalMatchStats {
    pub local_team_num: Option<i32>,
    pub shots: i32,
    pub saves: i32,
    pub assists: i32,
    pub demos: i32,
    pub goals: i32,
    pub score: i32,
    pub kickoff_goals: i32,
    pub team_shots: i32,
    pub team_saves: i32,
    pub team_assists: i32,
    pub team_demos: i32,
    pub team_goals: i32,
    pub team_score: i32,
    pub team_kickoff_goals: i32,
    pub opponent_kickoff_goals: i32,
}

pub struct MatchQuery<'a> {
    pub limit: i64,
    pub offset: i64,
    pub arena: Option<&'a str>,
    pub match_type: Option<&'a str>,
    pub playlist: Option<&'a str>,
    pub result: Option<&'a str>,
    pub date_from: Option<&'a str>,
    pub date_to: Option<&'a str>,
    pub search: Option<&'a str>,
}

pub struct MatchUpsert<'a> {
    pub guid: &'a str,
    pub start_time: &'a str,
    pub end_time: Option<&'a str>,
    pub arena: Option<&'a str>,
    pub score_blue: i32,
    pub score_orange: i32,
    pub winner: Option<i32>,
    pub is_online: bool,
    pub is_overtime: bool,
    pub duration_seconds: i32,
    pub match_type: Option<&'a str>,
    pub playlist: Option<&'a str>,
    pub mood: Option<&'a str>,
}

/// Initialize the SQLite database pool and run versioned migrations.
pub fn init_storage<P: AsRef<Path>>(db_path: P) -> AppResult<DbPool> {
    let manager = SqliteConnectionManager::file(db_path).with_init(|connection| {
        connection.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;
             PRAGMA synchronous = NORMAL;
             PRAGMA wal_autocheckpoint = 1000;",
        )
    });
    let pool = Pool::builder()
        .max_size(5)
        .build(manager)
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    let conn = pool
        .get()
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    // Enable WAL mode for better concurrency.
    conn.execute_batch("PRAGMA journal_mode = WAL;")
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    // A passive checkpoint never blocks active readers/writers during startup.
    conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);")
        .map_err(|e| AppError::StorageError(format!("WAL checkpoint failed: {e}")))?;

    // Run versioned migrations instead of ad-hoc CREATE TABLE IF NOT EXISTS.
    migrations::run_migrations(&conn)?;
    sync::ensure_local_sync_identity_conn(&conn)?;
    info!("Storage initialized successfully");
    Ok(pool)
}

pub fn get_conn(pool: &DbPool) -> AppResult<PooledConnection<SqliteConnectionManager>> {
    pool.get()
        .map_err(|e| AppError::StorageError(e.to_string()))
}

fn normalize_player_name(name: &str) -> String {
    name.trim().to_ascii_lowercase()
}

// ─── Local-time analytics helpers ────────────────────────────────────────────
// Match timestamps are persisted in UTC (`Utc::now().to_rfc3339()`), but every
// user-facing time bucket (best hour, heatmaps, daily rollups) must be
// computed in the machine's local timezone. Bucketing on the raw UTC hour is
// what made "best hour" show apparently random hours (e.g. a 21:00 session in
// UTC-3 showed up as 00:00).

/// Minimum matches in a bucket before it can be highlighted as "best".
/// Backend and frontend share this value; hours/days below it are still
/// listed, just never picked as the headline.
pub const MIN_INSIGHT_SAMPLE: i32 = 3;

/// Hour of day (0-23) of an RFC3339 timestamp in local time.
pub fn local_hour(start_time: &str) -> Option<u32> {
    DateTime::parse_from_rfc3339(start_time)
        .ok()
        .map(|dt| dt.with_timezone(&Local).hour())
}

/// Local weekday of an RFC3339 timestamp, Monday = 0 … Sunday = 6.
pub fn local_weekday(start_time: &str) -> Option<u32> {
    DateTime::parse_from_rfc3339(start_time)
        .ok()
        .map(|dt| dt.with_timezone(&Local).weekday().num_days_from_monday())
}

/// Calendar date (`YYYY-MM-DD`) of an RFC3339 timestamp in local time.
/// Falls back to today's local date when the timestamp cannot be parsed.
pub fn local_date_string(start_time: &str) -> String {
    DateTime::parse_from_rfc3339(start_time)
        .map(|dt| dt.with_timezone(&Local).format("%Y-%m-%d").to_string())
        .unwrap_or_else(|_| Local::now().format("%Y-%m-%d").to_string())
}

fn weighted_avg_duration_sql() -> &'static str {
    "avg_duration_seconds = ((daily_rollups.avg_duration_seconds * daily_rollups.matches_played) + (excluded.avg_duration_seconds * excluded.matches_played)) / (daily_rollups.matches_played + excluded.matches_played)"
}

fn weighted_avg_score_sql() -> &'static str {
    "avg_score = ((daily_rollups.avg_score * daily_rollups.matches_played) + (excluded.avg_score * excluded.matches_played)) / (daily_rollups.matches_played + excluded.matches_played)"
}

fn match_guid_for_id_conn(conn: &rusqlite::Connection, match_id: i64) -> AppResult<Option<String>> {
    conn.query_row(
        "SELECT guid FROM matches WHERE id = ?1",
        params![match_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| AppError::StorageError(e.to_string()))
}

fn player_primary_id_for_id_conn(
    conn: &rusqlite::Connection,
    player_id: i64,
) -> AppResult<Option<String>> {
    conn.query_row(
        "SELECT primary_id FROM players WHERE id = ?1",
        params![player_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| AppError::StorageError(e.to_string()))
}

fn enqueue_match_upsert_conn(conn: &rusqlite::Connection, match_id: i64) -> AppResult<()> {
    if let Some(guid) = match_guid_for_id_conn(conn, match_id)? {
        sync::enqueue_upsert_conn(
            conn,
            "match",
            &guid,
            serde_json::json!({ "local_id": match_id, "guid": guid }),
        )?;
    }
    Ok(())
}

fn enqueue_player_upsert_conn(conn: &rusqlite::Connection, player_id: i64) -> AppResult<()> {
    if let Some(primary_id) = player_primary_id_for_id_conn(conn, player_id)? {
        sync::enqueue_upsert_conn(
            conn,
            "player",
            &primary_id,
            serde_json::json!({ "local_id": player_id, "primary_id": primary_id }),
        )?;
    }
    Ok(())
}

fn enqueue_match_player_upsert_conn(
    conn: &rusqlite::Connection,
    match_id: i64,
    player_id: i64,
) -> AppResult<()> {
    let match_guid = match_guid_for_id_conn(conn, match_id)?;
    let player_primary_id = player_primary_id_for_id_conn(conn, player_id)?;
    if let (Some(match_guid), Some(player_primary_id)) = (match_guid, player_primary_id) {
        let entity_key = format!("{}:{}", match_guid, player_primary_id);
        sync::enqueue_upsert_conn(
            conn,
            "match_player",
            &entity_key,
            serde_json::json!({
                "match_id": match_id,
                "player_id": player_id,
                "match_guid": match_guid,
                "player_primary_id": player_primary_id,
            }),
        )?;
    }
    Ok(())
}

pub(crate) fn insert_match_conn(
    conn: &rusqlite::Connection,
    guid: &str,
    start_time: DateTime<Utc>,
    arena: Option<&str>,
    is_online: bool,
    match_type: Option<&str>,
    playlist: Option<&str>,
) -> AppResult<i64> {
    let arena = arena.unwrap_or("Unknown");
    conn.execute(
        "INSERT INTO matches (guid, start_time, arena, is_online, match_type, playlist) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![guid, start_time.to_rfc3339(), arena, is_online as i32, match_type, playlist],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;

    let id = conn.last_insert_rowid();
    sync::enqueue_upsert_conn(
        conn,
        "match",
        guid,
        serde_json::json!({ "local_id": id, "guid": guid }),
    )?;
    debug!(match_id = id, "Inserted match");
    Ok(id)
}

pub(crate) fn finish_match_conn(
    conn: &rusqlite::Connection,
    match_id: i64,
    update: FinishMatchUpdate,
) -> AppResult<()> {
    conn.execute(
        "UPDATE matches SET end_time = ?1, score_blue = ?2, score_orange = ?3, winner = ?4, is_overtime = ?5, duration_seconds = ?6 WHERE id = ?7",
        params![
            update.end_time.to_rfc3339(),
            update.score_blue,
            update.score_orange,
            update.winner,
            update.is_overtime as i32,
            update.duration_seconds,
            match_id
        ],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    enqueue_match_upsert_conn(conn, match_id)?;
    Ok(())
}

/// Resolve a player's local row id from their Rocket League PrimaryId.
/// Returns None when the player has never been recorded.
pub fn find_player_id_by_primary_id(pool: &DbPool, primary_id: &str) -> AppResult<Option<i64>> {
    let conn = get_conn(pool)?;
    conn.query_row(
        "SELECT id FROM players WHERE primary_id = ?1",
        params![primary_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| AppError::StorageError(e.to_string()))
}

pub(crate) fn get_or_create_player_conn(
    conn: &rusqlite::Connection,
    primary_id: &str,
    name: &str,
) -> AppResult<i64> {
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM players WHERE primary_id = ?1",
            params![primary_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    if let Some(id) = existing {
        return Ok(id);
    }

    conn.execute(
        "INSERT INTO players (primary_id, name) VALUES (?1, ?2)",
        params![primary_id, name],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;

    let id = conn.last_insert_rowid();
    enqueue_player_upsert_conn(conn, id)?;
    debug!(player_id = id, "Inserted player");
    Ok(id)
}

pub(crate) fn insert_match_player_conn(
    conn: &rusqlite::Connection,
    match_id: i64,
    player: MatchPlayerRow,
) -> AppResult<()> {
    let player_id = player.player_id;
    conn.execute(
        "INSERT INTO match_players (match_id, player_id, team_num, score, goals, shots, assists, saves, touches, car_touches, demos, speed, boost, mmr, head_to_head_json, kickoff_goals)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
         ON CONFLICT(match_id, player_id) DO UPDATE SET
         score = excluded.score,
         goals = excluded.goals,
         shots = excluded.shots,
         assists = excluded.assists,
         saves = excluded.saves,
         touches = excluded.touches,
         car_touches = excluded.car_touches,
         demos = excluded.demos,
         speed = excluded.speed,
         boost = excluded.boost,
         mmr = excluded.mmr,
         head_to_head_json = excluded.head_to_head_json,
         kickoff_goals = excluded.kickoff_goals",
        params![
            match_id,
            player_id,
            player.team_num,
            player.stats.score,
            player.stats.goals,
            player.stats.shots,
            player.stats.assists,
            player.stats.saves,
            player.stats.touches,
            player.stats.car_touches,
            player.stats.demos,
            player.stats.speed,
            player.stats.boost,
            player.stats.mmr,
            player.head_to_head_json,
            player.stats.kickoff_goals,
        ],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    enqueue_match_player_upsert_conn(conn, match_id, player_id)?;
    Ok(())
}

pub(crate) fn insert_match_event_conn(
    conn: &rusqlite::Connection,
    match_id: i64,
    event_type: &str,
    event_data: &str,
    occurred_at: DateTime<Utc>,
    game_time_remaining: Option<i32>,
) -> AppResult<()> {
    // `game_time_remaining` was added in migration v21; older databases (or a
    // partially applied migration state in tests) may not have the column yet.
    let has_clock_col = conn
        .prepare("SELECT game_time_remaining FROM match_events LIMIT 0")
        .is_ok();
    if has_clock_col {
        conn.execute(
            "INSERT INTO match_events (match_id, event_type, event_data, occurred_at, game_time_remaining) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![match_id, event_type, event_data, occurred_at.to_rfc3339(), game_time_remaining],
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    } else {
        conn.execute(
            "INSERT INTO match_events (match_id, event_type, event_data, occurred_at) VALUES (?1, ?2, ?3, ?4)",
            params![match_id, event_type, event_data, occurred_at.to_rfc3339()],
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    }

    let id = conn.last_insert_rowid();
    sync::enqueue_upsert_conn(
        conn,
        "match_event",
        &id.to_string(),
        serde_json::json!({
            "local_id": id,
            "match_id": match_id,
            "match_guid": match_guid_for_id_conn(conn, match_id)?,
            "event_type": event_type,
            "occurred_at": occurred_at.to_rfc3339(),
        }),
    )?;
    Ok(())
}

pub(crate) fn insert_session_conn(
    conn: &rusqlite::Connection,
    match_id: i64,
    summary: &SessionSummary,
) -> AppResult<()> {
    let summary_json =
        serde_json::to_string(summary).map_err(|e| AppError::ParseError(e.to_string()))?;
    let created_at = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO sessions (match_id, summary_json, created_at) VALUES (?1, ?2, ?3)",
        params![match_id, summary_json, created_at],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;

    let id = conn.last_insert_rowid();
    sync::enqueue_upsert_conn(
        conn,
        "session",
        &id.to_string(),
        serde_json::json!({
            "local_id": id,
            "match_id": match_id,
            "match_guid": match_guid_for_id_conn(conn, match_id)?,
            "created_at": created_at,
        }),
    )?;
    Ok(())
}

pub(crate) fn upsert_daily_rollup_conn(
    conn: &rusqlite::Connection,
    rollup: &DailyRollup,
) -> AppResult<()> {
    conn.execute(
        &format!(
            "INSERT INTO daily_rollups (date, matches_played, wins, losses, goals_scored, goals_conceded, total_shots, total_saves, avg_duration_seconds, total_demos, total_assists, avg_score, kickoff_goals_scored, kickoff_goals_conceded)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
             ON CONFLICT(date) DO UPDATE SET
             matches_played = matches_played + excluded.matches_played,
             wins = wins + excluded.wins,
             losses = losses + excluded.losses,
             goals_scored = goals_scored + excluded.goals_scored,
             goals_conceded = goals_conceded + excluded.goals_conceded,
             total_shots = total_shots + excluded.total_shots,
             total_saves = total_saves + excluded.total_saves,
             total_demos = total_demos + excluded.total_demos,
             total_assists = total_assists + excluded.total_assists,
             kickoff_goals_scored = kickoff_goals_scored + excluded.kickoff_goals_scored,
             kickoff_goals_conceded = kickoff_goals_conceded + excluded.kickoff_goals_conceded,
              {},
              {}",
            weighted_avg_duration_sql(),
            weighted_avg_score_sql()
        ),
        params![
            rollup.date,
            rollup.matches_played,
            rollup.wins,
            rollup.losses,
            rollup.goals_scored,
            rollup.goals_conceded,
            rollup.total_shots,
            rollup.total_saves,
            rollup.avg_duration_seconds,
            rollup.total_demos,
            rollup.total_assists,
            rollup.avg_score,
            rollup.kickoff_goals_scored,
            rollup.kickoff_goals_conceded,
        ],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(())
}

/// Insert a new match and return its ID.
pub fn insert_match(
    pool: &DbPool,
    guid: &str,
    start_time: DateTime<Utc>,
    arena: Option<&str>,
    is_online: bool,
    match_type: Option<&str>,
    playlist: Option<&str>,
) -> AppResult<i64> {
    let conn = get_conn(pool)?;
    insert_match_conn(
        &conn, guid, start_time, arena, is_online, match_type, playlist,
    )
}

/// Update match with end-of-game data.
pub fn finish_match(pool: &DbPool, match_id: i64, update: FinishMatchUpdate) -> AppResult<()> {
    let conn = get_conn(pool)?;
    finish_match_conn(&conn, match_id, update)
}

/// Get or create a player by primary_id.
pub fn get_or_create_player(pool: &DbPool, primary_id: &str, name: &str) -> AppResult<i64> {
    let conn = get_conn(pool)?;
    get_or_create_player_conn(&conn, primary_id, name)
}

/// Link a player to a match with stats.
pub fn insert_match_player(pool: &DbPool, match_id: i64, player: MatchPlayerRow) -> AppResult<()> {
    let conn = get_conn(pool)?;
    insert_match_player_conn(&conn, match_id, player)
}

/// Insert a match event.
pub fn insert_match_event(
    pool: &DbPool,
    match_id: i64,
    event_type: &str,
    event_data: &str,
    occurred_at: DateTime<Utc>,
) -> AppResult<()> {
    let conn = get_conn(pool)?;
    insert_match_event_conn(&conn, match_id, event_type, event_data, occurred_at, None)
}

/// Tiny key/value flag store on top of `app_settings` for one-off data
/// repairs (migration side-effects that need Rust code, not just SQL).
pub fn get_kv_flag(pool: &DbPool, key: &str) -> bool {
    let conn = match get_conn(pool) {
        Ok(conn) => conn,
        Err(_) => return false,
    };
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .map(|value| value == "1")
    .unwrap_or(false)
}

/// Mark a one-off repair flag as done.
pub fn set_kv_flag(pool: &DbPool, key: &str) -> AppResult<()> {
    let conn = get_conn(pool)?;
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, '1')
         ON CONFLICT(key) DO UPDATE SET value = '1'",
        params![key],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(())
}

/// Insert a session summary.
pub fn insert_session(pool: &DbPool, match_id: i64, summary: &SessionSummary) -> AppResult<()> {
    let conn = get_conn(pool)?;
    insert_session_conn(&conn, match_id, summary)
}

/// Upsert a daily rollup row.
pub fn upsert_daily_rollup(pool: &DbPool, rollup: &DailyRollup) -> AppResult<()> {
    let conn = get_conn(pool)?;
    upsert_daily_rollup_conn(&conn, rollup)
}

fn map_match_row(row: &rusqlite::Row) -> rusqlite::Result<Match> {
    Ok(Match {
        id: row.get(0)?,
        guid: row.get(1)?,
        start_time: row
            .get::<_, String>(2)?
            .parse::<DateTime<Utc>>()
            .unwrap_or_else(|_| Utc::now()),
        end_time: row
            .get::<_, Option<String>>(3)?
            .and_then(|s| s.parse::<DateTime<Utc>>().ok()),
        arena: row.get(4)?,
        score_blue: row.get(5)?,
        score_orange: row.get(6)?,
        winner: row.get(7)?,
        is_online: row.get::<_, i32>(8)? != 0,
        is_overtime: row.get::<_, i32>(9)? != 0,
        duration_seconds: row.get(10)?,
        match_type: row.get(11)?,
        playlist: row.get(12)?,
        // `mood` (v22) may be missing on very old snapshots; fall back to None.
        mood: row.get::<_, Option<String>>(13).unwrap_or(None),
    })
}

/// Query matches with optional filters.
pub fn get_matches(pool: &DbPool, filters: MatchQuery<'_>) -> AppResult<Vec<Match>> {
    let conn = get_conn(pool)?;
    let mut matches = Vec::new();

    let mut sql = String::from(
        "SELECT id, guid, start_time, end_time, arena, score_blue, score_orange, winner, is_online, is_overtime, duration_seconds, match_type, playlist, mood FROM matches WHERE 1=1"
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(arena) = filters.arena {
        sql.push_str(" AND arena = ?");
        args.push(Box::new(arena.to_string()));
    }

    if let Some(mt) = filters.match_type {
        sql.push_str(" AND LOWER(match_type) = LOWER(?)");
        args.push(Box::new(mt.to_string()));
    }

    if let Some(playlist) = filters.playlist {
        sql.push_str(" AND LOWER(playlist) = LOWER(?)");
        args.push(Box::new(playlist.to_string()));
    }

    if let Some(result) = filters.result {
        match result {
            "win" => sql.push_str(" AND winner = 0"),
            "loss" => sql.push_str(" AND winner = 1"),
            _ => {}
        }
    }

    if let Some(from) = filters.date_from {
        sql.push_str(" AND start_time >= ?");
        args.push(Box::new(from.to_string()));
    }

    if let Some(to) = filters.date_to {
        sql.push_str(" AND start_time <= ?");
        args.push(Box::new(to.to_string()));
    }

    if let Some(search) = filters.search {
        sql.push_str(
            " AND id IN (SELECT match_id FROM match_players mp JOIN players p ON mp.player_id = p.id WHERE p.name LIKE ?)"
        );
        let pattern = format!("%{}%", search);
        args.push(Box::new(pattern));
    }

    sql.push_str(" ORDER BY start_time DESC LIMIT ? OFFSET ?");
    args.push(Box::new(filters.limit));
    args.push(Box::new(filters.offset));

    let params_refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let iter = stmt.query_map(&*params_refs, map_match_row)?;
    for m in iter {
        matches.push(m.map_err(|e| AppError::StorageError(e.to_string()))?);
    }

    Ok(matches)
}

/// Get full match detail including players.
pub fn get_match_detail(pool: &DbPool, match_id: i64) -> AppResult<(Match, Vec<Player>)> {
    let conn = get_conn(pool)?;

    let m: Match = conn.query_row(
        "SELECT id, guid, start_time, end_time, arena, score_blue, score_orange, winner, is_online, is_overtime, duration_seconds, match_type, playlist, mood FROM matches WHERE id = ?1",
        params![match_id],
        |row| {
            Ok(Match {
                id: row.get(0)?,
                guid: row.get(1)?,
                start_time: row.get::<_, String>(2)?.parse::<DateTime<Utc>>().unwrap_or_else(|_| Utc::now()),
                end_time: row.get::<_, Option<String>>(3)?.and_then(|s| s.parse::<DateTime<Utc>>().ok()),
                arena: row.get(4)?,
                score_blue: row.get(5)?,
                score_orange: row.get(6)?,
                winner: row.get(7)?,
                is_online: row.get::<_, i32>(8)? != 0,
                is_overtime: row.get::<_, i32>(9)? != 0,
                duration_seconds: row.get(10)?,
                match_type: row.get(11)?,
                playlist: row.get(12)?,
                mood: row.get::<_, Option<String>>(13).unwrap_or(None),
            })
        },
    ).map_err(|e| AppError::StorageError(e.to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT p.id, p.primary_id, p.name, mp.team_num, mp.score, mp.goals, mp.shots, mp.assists, mp.saves, mp.touches, mp.car_touches, mp.demos, mp.speed, mp.boost, mp.mmr, mp.head_to_head_json, mp.kickoff_goals
         FROM match_players mp
         JOIN players p ON mp.player_id = p.id
         WHERE mp.match_id = ?1"
    )?;

    let player_iter = stmt.query_map(params![match_id], |row| {
        let h2h_json: Option<String> = row.get(15)?;
        let h2h = h2h_json.and_then(|s| serde_json::from_str::<HeadToHeadRecord>(&s).ok());
        Ok(Player {
            id: row.get(0)?,
            primary_id: row.get(1)?,
            name: row.get(2)?,
            team_num: row.get(3)?,
            stats: crate::core::models::PlayerStats {
                score: row.get(4)?,
                goals: row.get(5)?,
                shots: row.get(6)?,
                assists: row.get(7)?,
                saves: row.get(8)?,
                touches: row.get(9)?,
                car_touches: row.get(10)?,
                demos: row.get(11)?,
                speed: row.get(12)?,
                boost: row.get(13)?,
                mmr: row.get(14)?,
                kickoff_goals: row.get(16)?,
                head_to_head: h2h,
            },
        })
    })?;

    let mut players = Vec::new();
    for p in player_iter {
        players.push(p.map_err(|e| AppError::StorageError(e.to_string()))?);
    }

    Ok((m, players))
}

pub fn get_match_events(pool: &DbPool, match_id: i64) -> AppResult<Vec<MatchEvent>> {
    let conn = get_conn(pool)?;
    let mut stmt = conn.prepare(
        "SELECT id, match_id, event_type, event_data, occurred_at
         FROM match_events
         WHERE match_id = ?1
         ORDER BY occurred_at ASC, id ASC",
    )?;

    let iter = stmt.query_map(params![match_id], |row| {
        Ok(MatchEvent {
            id: row.get(0)?,
            match_id: row.get(1)?,
            event_type: row.get(2)?,
            event_data: row.get(3)?,
            occurred_at: row
                .get::<_, String>(4)?
                .parse::<DateTime<Utc>>()
                .unwrap_or_else(|_| Utc::now()),
        })
    })?;

    let mut events = Vec::new();
    for event in iter {
        events.push(event.map_err(|e| AppError::StorageError(e.to_string()))?);
    }

    Ok(events)
}

pub fn get_local_team_num(
    pool: &DbPool,
    match_id: i64,
    local_primary_id: Option<&str>,
    player_names: &[String],
) -> AppResult<Option<i32>> {
    if local_primary_id.is_none() && player_names.is_empty() {
        return Ok(None);
    }

    let conn = get_conn(pool)?;
    get_local_team_num_from_conn(&conn, match_id, local_primary_id, player_names)
}

pub fn get_local_match_stats(
    pool: &DbPool,
    match_ids: &[i64],
    local_primary_id: Option<&str>,
    player_names: &[String],
) -> AppResult<HashMap<i64, LocalMatchStats>> {
    if match_ids.is_empty() || (local_primary_id.is_none() && player_names.is_empty()) {
        return Ok(HashMap::new());
    }

    let conn = get_conn(pool)?;
    get_local_match_stats_from_conn(&conn, match_ids, local_primary_id, player_names)
}

/// Update match metadata (match_type and playlist).
pub fn update_match(
    pool: &DbPool,
    match_id: i64,
    match_type: Option<&str>,
    playlist: Option<&str>,
) -> AppResult<()> {
    let conn = get_conn(pool)?;
    conn.execute(
        "UPDATE matches SET match_type = ?1, playlist = ?2 WHERE id = ?3",
        params![match_type, playlist, match_id],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    enqueue_match_upsert_conn(&conn, match_id)?;
    Ok(())
}

/// Valid post-match mood values, ordered from most positive to most negative.
pub const MATCH_MOODS: &[&str] = &["very_happy", "happy", "neutral", "angry", "very_angry"];

/// Validate a mood value coming from the UI. `None`/empty clears the rating.
pub fn normalize_mood(mood: Option<&str>) -> AppResult<Option<String>> {
    match mood {
        None => Ok(None),
        Some(raw) => {
            let value = raw.trim().to_ascii_lowercase();
            if value.is_empty() {
                return Ok(None);
            }
            if MATCH_MOODS.contains(&value.as_str()) {
                Ok(Some(value))
            } else {
                Err(AppError::StorageError(format!("Unknown mood: {raw}")))
            }
        }
    }
}

/// Set (or clear) the self-reported mood of a match.
pub fn set_match_mood(pool: &DbPool, match_id: i64, mood: Option<&str>) -> AppResult<()> {
    let mood = normalize_mood(mood)?;
    let conn = get_conn(pool)?;
    let updated = conn
        .execute(
            "UPDATE matches SET mood = ?1 WHERE id = ?2",
            params![mood, match_id],
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    if updated == 0 {
        return Err(AppError::StorageError(format!(
            "Match {match_id} not found"
        )));
    }
    enqueue_match_upsert_conn(&conn, match_id)?;
    Ok(())
}

/// Delete a match and all related data (cascade), then rebuild daily rollups.
pub fn delete_match(pool: &DbPool, match_id: i64) -> AppResult<()> {
    let conn = get_conn(pool)?;
    if let Some(guid) = match_guid_for_id_conn(&conn, match_id)? {
        sync::enqueue_delete_conn(
            &conn,
            "match",
            &guid,
            serde_json::json!({ "local_id": match_id, "guid": guid }),
        )?;
    }
    conn.execute("DELETE FROM matches WHERE id = ?1", params![match_id])
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    let settings = crate::core::settings::get_settings(pool).unwrap_or_default();
    let names = identity_candidate_names(&settings);
    if let Err(e) =
        rebuild_daily_rollups_for_identity(pool, settings.local_primary_id.as_deref(), &names)
    {
        tracing::warn!(error = %e, "Failed to rebuild daily rollups after match deletion");
    }
    Ok(())
}

pub fn identity_candidate_names(settings: &crate::core::settings::AppSettings) -> Vec<String> {
    let mut names = Vec::new();
    if !settings.player_name.trim().is_empty() {
        names.push(settings.player_name.trim().to_string());
    }
    if let Some(ref u) = settings.tracker_username {
        let u = u.trim();
        if !u.is_empty() && !names.iter().any(|n| n.eq_ignore_ascii_case(u)) {
            names.push(u.to_string());
        }
    }
    names
}

/// Get daily rollups for a date range.
pub fn get_daily_rollups(
    pool: &DbPool,
    start_date: &str,
    end_date: &str,
) -> AppResult<Vec<DailyRollup>> {
    let conn = get_conn(pool)?;
    let mut stmt = conn.prepare(
        "SELECT date, matches_played, wins, losses, goals_scored, goals_conceded, total_shots, total_saves, avg_duration_seconds, total_demos, total_assists, avg_score, kickoff_goals_scored, kickoff_goals_conceded
         FROM daily_rollups
         WHERE date >= ?1 AND date <= ?2
         ORDER BY date ASC"
    )?;

    let iter = stmt.query_map(params![start_date, end_date], |row| {
        Ok(DailyRollup {
            date: row.get(0)?,
            matches_played: row.get(1)?,
            wins: row.get(2)?,
            losses: row.get(3)?,
            goals_scored: row.get(4)?,
            goals_conceded: row.get(5)?,
            total_shots: row.get(6)?,
            total_saves: row.get(7)?,
            avg_duration_seconds: row.get(8)?,
            total_demos: row.get(9)?,
            total_assists: row.get(10)?,
            avg_score: row.get(11)?,
            kickoff_goals_scored: row.get(12)?,
            kickoff_goals_conceded: row.get(13)?,
        })
    })?;

    let mut rollups = Vec::new();
    for r in iter {
        rollups.push(r.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(rollups)
}

/// Compute daily rollups from matches with optional playlist/match_type filters.
/// Used when the pre-aggregated daily_rollups table cannot satisfy filter requirements.
#[allow(clippy::too_many_arguments)]
pub fn get_daily_rollups_filtered(
    pool: &DbPool,
    start_date: &str,
    end_date: &str,
    local_primary_id: Option<&str>,
    player_names: &[String],
    playlist: Option<&str>,
    match_type: Option<&str>,
    scope: Option<&str>,
) -> AppResult<Vec<DailyRollup>> {
    let conn = get_conn(pool)?;

    let mut sql = String::from(
        "SELECT id, start_time, score_blue, score_orange, winner, duration_seconds
         FROM matches
         WHERE start_time >= ?1 AND start_time < date(?2, '+1 day')",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    args.push(Box::new(start_date.to_string()));
    args.push(Box::new(end_date.to_string()));

    if let Some(mt) = match_type {
        sql.push_str(" AND LOWER(match_type) = LOWER(?)");
        args.push(Box::new(mt.to_string()));
    }
    if let Some(pl) = playlist {
        sql.push_str(" AND LOWER(playlist) = LOWER(?)");
        args.push(Box::new(pl.to_string()));
    }
    sql.push_str(" ORDER BY start_time ASC");

    let params_refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(&*params_refs, |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i32>(2)?,
            row.get::<_, i32>(3)?,
            row.get::<_, Option<i32>>(4)?,
            row.get::<_, i32>(5)?,
        ))
    })?;

    let mut rollups_by_date: HashMap<String, DailyRollup> = HashMap::new();
    let is_individual = scope == Some("me");

    for row in rows {
        let (match_id, start_time, score_blue, score_orange, winner, duration_seconds) =
            row.map_err(|e| AppError::StorageError(e.to_string()))?;

        let Some(my_team) =
            get_local_team_num_from_conn(&conn, match_id, local_primary_id, player_names)?
        else {
            continue;
        };

        let date = local_date_string(&start_time);

        let rollup = rollups_by_date.entry(date.clone()).or_insert(DailyRollup {
            date,
            matches_played: 0,
            wins: 0,
            losses: 0,
            goals_scored: 0,
            goals_conceded: 0,
            total_shots: 0,
            total_saves: 0,
            avg_duration_seconds: 0,
            total_demos: 0,
            total_assists: 0,
            avg_score: 0,
            kickoff_goals_scored: 0,
            kickoff_goals_conceded: 0,
        });

        let prev_count = rollup.matches_played;
        rollup.matches_played += 1;
        rollup.wins += if winner == Some(my_team) { 1 } else { 0 };
        rollup.losses += if winner.is_some() && winner != Some(my_team) {
            1
        } else {
            0
        };

        if is_individual {
            let (goals, shots, saves, demos, assists, score, kickoff_goals): (
                i32,
                i32,
                i32,
                i32,
                i32,
                i32,
                i32,
            ) = if let Some(local_pid) = local_primary_id {
                conn.query_row(
                        "SELECT mp.goals, mp.shots, mp.saves, mp.demos, mp.assists, mp.score, mp.kickoff_goals
                         FROM match_players mp
                         JOIN players p ON mp.player_id = p.id
                         WHERE mp.match_id = ?1 AND p.primary_id = ?2",
                        params![match_id, local_pid],
                        |row| {
                            Ok((
                                row.get(0)?,
                                row.get(1)?,
                                row.get(2)?,
                                row.get(3)?,
                                row.get(4)?,
                                row.get(5)?,
                                row.get(6)?,
                            ))
                        },
                    )
                    .unwrap_or((0, 0, 0, 0, 0, 0, 0))
            } else if !player_names.is_empty() {
                let placeholders = player_names
                    .iter()
                    .map(|_| "LOWER(TRIM(p.name)) = LOWER(TRIM(?))")
                    .collect::<Vec<_>>()
                    .join(" OR ");
                let sql = format!(
                        "SELECT mp.goals, mp.shots, mp.saves, mp.demos, mp.assists, mp.score, mp.kickoff_goals
                         FROM match_players mp
                         JOIN players p ON mp.player_id = p.id
                         WHERE mp.match_id = ?1 AND ({})",
                        placeholders
                    );
                let mut query_args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
                query_args.push(Box::new(match_id));
                for name in player_names {
                    query_args.push(Box::new(name.clone()));
                }
                let params_refs: Vec<&dyn rusqlite::ToSql> =
                    query_args.iter().map(|a| a.as_ref()).collect();
                conn.query_row(&sql, &*params_refs, |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                    ))
                })
                .unwrap_or((0, 0, 0, 0, 0, 0, 0))
            } else {
                (0, 0, 0, 0, 0, 0, 0)
            };

            let their_goals = if my_team == 0 {
                score_orange
            } else {
                score_blue
            };

            rollup.goals_scored += goals;
            rollup.goals_conceded += their_goals;
            rollup.total_shots += shots;
            rollup.total_saves += saves;
            rollup.total_demos += demos;
            rollup.total_assists += assists;
            rollup.kickoff_goals_scored += kickoff_goals;
            rollup.avg_duration_seconds = ((rollup.avg_duration_seconds * prev_count)
                + duration_seconds)
                / rollup.matches_played;
            rollup.avg_score = ((rollup.avg_score * prev_count) + score) / rollup.matches_played;
        } else {
            let (
                my_goals,
                their_goals,
                total_shots,
                total_saves,
                total_demos,
                total_assists,
                my_score,
                my_kickoff_goals,
                their_kickoff_goals,
            ): (i32, i32, i32, i32, i32, i32, i32, i32, i32) = conn
                .query_row(
                    "SELECT
                        COALESCE(SUM(CASE WHEN team_num = ?1 THEN goals ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN team_num != ?1 THEN goals ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN team_num = ?1 THEN shots ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN team_num = ?1 THEN saves ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN team_num = ?1 THEN demos ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN team_num = ?1 THEN assists ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN team_num = ?1 THEN score ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN team_num = ?1 THEN kickoff_goals ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN team_num != ?1 THEN kickoff_goals ELSE 0 END), 0)
                     FROM match_players
                     WHERE match_id = ?2",
                    params![my_team, match_id],
                    |row| {
                        Ok((
                            row.get(0)?,
                            row.get(1)?,
                            row.get(2)?,
                            row.get(3)?,
                            row.get(4)?,
                            row.get(5)?,
                            row.get(6)?,
                            row.get(7)?,
                            row.get(8)?,
                        ))
                    },
                )
                .map_err(|e| AppError::StorageError(e.to_string()))?;

            rollup.goals_scored += if my_goals == 0 && their_goals == 0 {
                if my_team == 0 {
                    score_blue
                } else {
                    score_orange
                }
            } else {
                my_goals
            };
            rollup.goals_conceded += if my_goals == 0 && their_goals == 0 {
                if my_team == 0 {
                    score_orange
                } else {
                    score_blue
                }
            } else {
                their_goals
            };
            rollup.total_shots += total_shots;
            rollup.total_saves += total_saves;
            rollup.total_demos += total_demos;
            rollup.total_assists += total_assists;
            rollup.kickoff_goals_scored += my_kickoff_goals;
            rollup.kickoff_goals_conceded += their_kickoff_goals;
            rollup.avg_duration_seconds = ((rollup.avg_duration_seconds * prev_count)
                + duration_seconds)
                / rollup.matches_played;
            rollup.avg_score = ((rollup.avg_score * prev_count) + my_score) / rollup.matches_played;
        }
    }

    let mut rollups: Vec<DailyRollup> = rollups_by_date.into_values().collect();
    rollups.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(rollups)
}

pub fn rebuild_daily_rollups_for_identity(
    pool: &DbPool,
    local_primary_id: Option<&str>,
    player_names: &[String],
) -> AppResult<()> {
    let conn = get_conn(pool)?;

    conn.execute("DELETE FROM daily_rollups", [])
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT id, start_time, score_blue, score_orange, winner, duration_seconds
         FROM matches
         ORDER BY start_time ASC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i32>(2)?,
            row.get::<_, i32>(3)?,
            row.get::<_, Option<i32>>(4)?,
            row.get::<_, i32>(5)?,
        ))
    })?;

    for row in rows {
        let (match_id, start_time, score_blue, score_orange, winner, duration_seconds) =
            row.map_err(|e| AppError::StorageError(e.to_string()))?;

        let Some(my_team) =
            get_local_team_num_from_conn(&conn, match_id, local_primary_id, player_names)?
        else {
            continue;
        };

        let (
            my_goals,
            their_goals,
            total_shots,
            total_saves,
            total_demos,
            total_assists,
            my_score,
            my_kickoff_goals,
            their_kickoff_goals,
        ): (i32, i32, i32, i32, i32, i32, i32, i32, i32) = conn
            .query_row(
                "SELECT
                    COALESCE(SUM(CASE WHEN team_num = ?1 THEN goals ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN team_num != ?1 THEN goals ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN team_num = ?1 THEN shots ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN team_num = ?1 THEN saves ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN team_num = ?1 THEN demos ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN team_num = ?1 THEN assists ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN team_num = ?1 THEN score ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN team_num = ?1 THEN kickoff_goals ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN team_num != ?1 THEN kickoff_goals ELSE 0 END), 0)
                 FROM match_players
                 WHERE match_id = ?2",
                params![my_team, match_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                        row.get(8)?,
                    ))
                },
            )
            .map_err(|e| AppError::StorageError(e.to_string()))?;

        let date = local_date_string(&start_time);

        let rollup = DailyRollup {
            date,
            matches_played: 1,
            wins: if winner == Some(my_team) { 1 } else { 0 },
            losses: if winner.is_some() && winner != Some(my_team) {
                1
            } else {
                0
            },
            goals_scored: if my_goals == 0 && their_goals == 0 {
                if my_team == 0 {
                    score_blue
                } else {
                    score_orange
                }
            } else {
                my_goals
            },
            goals_conceded: if my_goals == 0 && their_goals == 0 {
                if my_team == 0 {
                    score_orange
                } else {
                    score_blue
                }
            } else {
                their_goals
            },
            total_shots,
            total_saves,
            avg_duration_seconds: duration_seconds,
            total_demos,
            total_assists,
            avg_score: my_score,
            kickoff_goals_scored: my_kickoff_goals,
            kickoff_goals_conceded: their_kickoff_goals,
        };

        upsert_daily_rollup_conn(&conn, &rollup)
            .map_err(|e| AppError::StorageError(e.to_string()))?;
    }

    Ok(())
}

fn get_local_team_num_from_conn(
    conn: &rusqlite::Connection,
    match_id: i64,
    local_primary_id: Option<&str>,
    player_names: &[String],
) -> AppResult<Option<i32>> {
    if let Some(local_primary_id) = local_primary_id {
        let team_num = conn
            .query_row(
                "SELECT mp.team_num
                 FROM match_players mp
                 JOIN players p ON mp.player_id = p.id
                 WHERE mp.match_id = ?1 AND p.primary_id = ?2
                 LIMIT 1",
                params![match_id, local_primary_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| AppError::StorageError(e.to_string()))?;

        if team_num.is_some() {
            return Ok(team_num);
        }
    }

    for player_name in player_names {
        let team_num = conn
            .query_row(
                "SELECT mp.team_num
                 FROM match_players mp
                 JOIN players p ON mp.player_id = p.id
                 WHERE mp.match_id = ?1 AND LOWER(TRIM(p.name)) = LOWER(TRIM(?2))
                 LIMIT 1",
                params![match_id, player_name],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| AppError::StorageError(e.to_string()))?;

        if team_num.is_some() {
            return Ok(team_num);
        }
    }

    Ok(None)
}

fn get_local_match_stats_from_conn(
    conn: &rusqlite::Connection,
    match_ids: &[i64],
    local_primary_id: Option<&str>,
    player_names: &[String],
) -> AppResult<HashMap<i64, LocalMatchStats>> {
    if match_ids.is_empty() || (local_primary_id.is_none() && player_names.is_empty()) {
        return Ok(HashMap::new());
    }

    let placeholders = vec!["?"; match_ids.len()].join(", ");
    let sql = format!(
        "SELECT mp.match_id, mp.team_num, mp.shots, mp.saves, mp.assists, mp.demos, mp.goals, mp.score, p.primary_id, p.name, mp.kickoff_goals
         FROM match_players mp
         JOIN players p ON mp.player_id = p.id
         WHERE mp.match_id IN ({})",
        placeholders
    );

    let params_refs: Vec<&dyn rusqlite::ToSql> = match_ids
        .iter()
        .map(|match_id| match_id as &dyn rusqlite::ToSql)
        .collect();

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(&*params_refs, |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i32>(1)?,
            row.get::<_, i32>(2)?,
            row.get::<_, i32>(3)?,
            row.get::<_, i32>(4)?,
            row.get::<_, i32>(5)?,
            row.get::<_, i32>(6)?,
            row.get::<_, i32>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, i32>(10)?,
        ))
    })?;

    let normalized_names: HashSet<String> = player_names
        .iter()
        .map(|name| normalize_player_name(name))
        .collect();

    let mut all_rows = Vec::new();
    for row in rows {
        all_rows.push(row.map_err(|e| AppError::StorageError(e.to_string()))?);
    }

    let mut stats_by_match: HashMap<i64, LocalMatchStats> = HashMap::new();

    // First pass: identify local team for each match
    for (match_id, team_num, _, _, _, _, _, _, primary_id, name, _) in &all_rows {
        let is_local_primary = local_primary_id == Some(primary_id.as_str());
        let is_local_name = normalized_names.contains(&normalize_player_name(name));

        if is_local_primary || is_local_name {
            let entry = stats_by_match.entry(*match_id).or_default();
            if is_local_primary || entry.local_team_num.is_none() {
                entry.local_team_num = Some(*team_num);
            }
        }
    }

    // Second pass: aggregate stats
    for (
        match_id,
        team_num,
        shots,
        saves,
        assists,
        demos,
        goals,
        score,
        primary_id,
        name,
        kickoff_goals,
    ) in all_rows
    {
        if let Some(entry) = stats_by_match.get_mut(&match_id) {
            let is_local_primary = local_primary_id == Some(primary_id.as_str());
            let is_local_name = normalized_names.contains(&normalize_player_name(&name));
            let is_local = is_local_primary || is_local_name;

            if is_local {
                entry.shots += shots;
                entry.saves += saves;
                entry.assists += assists;
                entry.demos += demos;
                entry.goals += goals;
                entry.score += score;
                entry.kickoff_goals += kickoff_goals;
            }

            if Some(team_num) == entry.local_team_num {
                entry.team_shots += shots;
                entry.team_saves += saves;
                entry.team_assists += assists;
                entry.team_demos += demos;
                entry.team_goals += goals;
                entry.team_score += score;
                entry.team_kickoff_goals += kickoff_goals;
            } else {
                entry.opponent_kickoff_goals += kickoff_goals;
            }
        }
    }

    Ok(stats_by_match)
}

/// Get match count.
pub fn get_match_count(pool: &DbPool) -> AppResult<i64> {
    let conn = get_conn(pool)?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM matches", [], |row| row.get(0))
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(count)
}

/// Enqueue all existing local rows for a one-time cloud sync backfill.
pub fn enqueue_existing_history_for_sync(pool: &DbPool) -> AppResult<i64> {
    let conn = get_conn(pool)?;
    let mut enqueued = 0;

    let match_ids = collect_i64(&conn, "SELECT id FROM matches ORDER BY id ASC")?;
    for match_id in match_ids {
        enqueue_match_upsert_conn(&conn, match_id)?;
        enqueued += 1;
    }

    let player_ids = collect_i64(&conn, "SELECT id FROM players ORDER BY id ASC")?;
    for player_id in player_ids {
        enqueue_player_upsert_conn(&conn, player_id)?;
        enqueued += 1;
    }

    let match_players = collect_i64_pairs(
        &conn,
        "SELECT match_id, player_id FROM match_players ORDER BY match_id ASC, player_id ASC",
    )?;
    for (match_id, player_id) in match_players {
        enqueue_match_player_upsert_conn(&conn, match_id, player_id)?;
        enqueued += 1;
    }

    for event_id in collect_i64(&conn, "SELECT id FROM match_events ORDER BY id ASC")? {
        sync::enqueue_upsert_conn(
            &conn,
            "match_event",
            &event_id.to_string(),
            serde_json::json!({ "local_id": event_id }),
        )?;
        enqueued += 1;
    }

    for session_id in collect_i64(&conn, "SELECT id FROM sessions ORDER BY id ASC")? {
        sync::enqueue_upsert_conn(
            &conn,
            "session",
            &session_id.to_string(),
            serde_json::json!({ "local_id": session_id }),
        )?;
        enqueued += 1;
    }

    for friend_player_id in collect_i64(
        &conn,
        "SELECT player_id FROM friends ORDER BY player_id ASC",
    )? {
        sync::enqueue_upsert_conn(
            &conn,
            "friend",
            &friend_player_id.to_string(),
            serde_json::json!({ "player_id": friend_player_id }),
        )?;
        enqueued += 1;
    }

    for preset_id in collect_i64(&conn, "SELECT id FROM user_presets ORDER BY id ASC")? {
        sync::enqueue_upsert_conn(
            &conn,
            "user_preset",
            &preset_id.to_string(),
            serde_json::json!({ "local_id": preset_id }),
        )?;
        enqueued += 1;
    }

    Ok(enqueued)
}

fn collect_i64(conn: &rusqlite::Connection, sql: &str) -> AppResult<Vec<i64>> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let mut values = Vec::new();
    for row in rows {
        values.push(row.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(values)
}

fn collect_i64_pairs(conn: &rusqlite::Connection, sql: &str) -> AppResult<Vec<(i64, i64)>> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let mut values = Vec::new();
    for row in rows {
        values.push(row.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(values)
}

/// Get storage stats.
pub fn get_storage_stats(pool: &DbPool) -> AppResult<serde_json::Value> {
    let conn = get_conn(pool)?;
    let match_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM matches", [], |row| row.get(0))
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let player_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM players", [], |row| row.get(0))
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let event_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM match_events", [], |row| row.get(0))
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let database_size_bytes: i64 = conn
        .query_row(
            "SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()",
            [],
            |row| row.get(0),
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let oldest_match_date = conn
        .query_row("SELECT MIN(start_time) FROM matches", [], |row| {
            row.get::<_, Option<String>>(0)
        })
        .map_err(|e| AppError::StorageError(e.to_string()))?
        .and_then(|value| value.parse::<DateTime<Utc>>().ok())
        .map(|value| value.timestamp());
    let db_path = conn
        .query_row(
            "SELECT file FROM pragma_database_list WHERE name = 'main'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    Ok(serde_json::json!({
        "match_count": match_count,
        "total_matches": match_count,
        "player_count": player_count,
        "event_count": event_count,
        "total_events": event_count,
        "database_size_bytes": database_size_bytes,
        "oldest_match_date": oldest_match_date,
        "db_path": db_path,
    }))
}

/// Clear all data (destructive).
pub fn clear_all_data(pool: &DbPool) -> AppResult<()> {
    let conn = get_conn(pool)?;
    sync::enqueue_delete_conn(
        &conn,
        "profile_data",
        "*",
        serde_json::json!({ "scope": "all_local_profile_data" }),
    )?;
    conn.execute_batch(
        "DELETE FROM match_events;
         DELETE FROM match_players;
         DELETE FROM state_snapshots;
         DELETE FROM sessions;
         DELETE FROM daily_rollups;
         DELETE FROM matches;
         DELETE FROM players;
        ",
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(())
}

// ─── Export helpers ──────────────────────────────────────────────────────────

/// Export all players (for backup/restore).
pub fn get_all_players(pool: &DbPool) -> AppResult<Vec<serde_json::Value>> {
    let conn = get_conn(pool)?;
    let mut stmt = conn.prepare("SELECT id, primary_id, name FROM players")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "primary_id": row.get::<_, String>(1)?,
                "name": row.get::<_, String>(2)?,
            }))
        })
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let mut result = Vec::new();
    for r in rows {
        result.push(r.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(result)
}

/// Export all match_players rows.
pub fn get_all_match_players(pool: &DbPool) -> AppResult<Vec<serde_json::Value>> {
    let conn = get_conn(pool)?;
    let mut stmt = conn.prepare(
        "SELECT mp.match_id, mp.player_id, mp.team_num, mp.score, mp.goals, mp.shots,
                mp.assists, mp.saves, mp.touches, mp.car_touches, mp.demos, mp.speed, mp.boost,
                mp.kickoff_goals, m.guid, p.primary_id
         FROM match_players mp
         JOIN matches m ON mp.match_id = m.id
         JOIN players p ON mp.player_id = p.id",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "match_guid": row.get::<_, String>(14)?,
                "player_primary_id": row.get::<_, String>(15)?,
                "player_id": row.get::<_, i64>(1)?,
                "team_num": row.get::<_, i32>(2)?,
                "score": row.get::<_, i32>(3)?,
                "goals": row.get::<_, i32>(4)?,
                "shots": row.get::<_, i32>(5)?,
                "assists": row.get::<_, i32>(6)?,
                "saves": row.get::<_, i32>(7)?,
                "touches": row.get::<_, i32>(8)?,
                "car_touches": row.get::<_, i32>(9)?,
                "demos": row.get::<_, i32>(10)?,
                "speed": row.get::<_, f64>(11)?,
                "boost": row.get::<_, i32>(12)?,
                "kickoff_goals": row.get::<_, i32>(13)?,
            }))
        })
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let mut result = Vec::new();
    for r in rows {
        result.push(r.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(result)
}

/// Export all match_events.
pub fn get_all_match_events(pool: &DbPool) -> AppResult<Vec<serde_json::Value>> {
    let conn = get_conn(pool)?;
    let mut stmt = conn.prepare(
        "SELECT me.id, me.match_id, me.event_type, me.event_data, me.occurred_at, m.guid
         FROM match_events me
         JOIN matches m ON me.match_id = m.id",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "match_guid": row.get::<_, String>(5)?,
                "event_type": row.get::<_, String>(2)?,
                "event_data": row.get::<_, String>(3)?,
                "occurred_at": row.get::<_, String>(4)?,
            }))
        })
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let mut result = Vec::new();
    for r in rows {
        result.push(r.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(result)
}

/// Export all sessions.
pub fn get_all_sessions(pool: &DbPool) -> AppResult<Vec<serde_json::Value>> {
    let conn = get_conn(pool)?;
    let mut stmt = conn.prepare(
        "SELECT s.id, s.match_id, s.summary_json, s.created_at, m.guid
         FROM sessions s
         JOIN matches m ON s.match_id = m.id",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "match_guid": row.get::<_, String>(4)?,
                "summary_json": row.get::<_, String>(2)?,
                "created_at": row.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let mut result = Vec::new();
    for r in rows {
        result.push(r.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(result)
}

/// Export all daily_rollups.
pub fn get_all_daily_rollups_all(pool: &DbPool) -> AppResult<Vec<DailyRollup>> {
    let conn = get_conn(pool)?;
    let mut stmt = conn.prepare(
        "SELECT date, matches_played, wins, losses, goals_scored, goals_conceded, total_shots, total_saves, avg_duration_seconds, total_demos, total_assists, avg_score, kickoff_goals_scored, kickoff_goals_conceded
         FROM daily_rollups
         ORDER BY date ASC",
    )?;
    let iter = stmt
        .query_map([], |row| {
            Ok(DailyRollup {
                date: row.get(0)?,
                matches_played: row.get(1)?,
                wins: row.get(2)?,
                losses: row.get(3)?,
                goals_scored: row.get(4)?,
                goals_conceded: row.get(5)?,
                total_shots: row.get(6)?,
                total_saves: row.get(7)?,
                avg_duration_seconds: row.get(8)?,
                total_demos: row.get(9)?,
                total_assists: row.get(10)?,
                avg_score: row.get(11)?,
                kickoff_goals_scored: row.get(12)?,
                kickoff_goals_conceded: row.get(13)?,
            })
        })
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let mut rollups = Vec::new();
    for r in iter {
        rollups.push(r.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(rollups)
}

// ─── Import helpers ──────────────────────────────────────────────────────────

/// Upsert a match by its GUID. Returns the row id.
pub fn upsert_match_by_guid(
    conn: &rusqlite::Connection,
    record: MatchUpsert<'_>,
) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO matches (guid, start_time, end_time, arena, score_blue, score_orange, winner, is_online, is_overtime, duration_seconds, match_type, playlist, mood)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT(guid) DO UPDATE SET
            start_time = excluded.start_time,
            end_time = coalesce(excluded.end_time, matches.end_time),
            arena = coalesce(excluded.arena, matches.arena),
            score_blue = excluded.score_blue,
            score_orange = excluded.score_orange,
            winner = excluded.winner,
            is_online = excluded.is_online,
            is_overtime = excluded.is_overtime,
            duration_seconds = excluded.duration_seconds,
            match_type = coalesce(excluded.match_type, matches.match_type),
            playlist = coalesce(excluded.playlist, matches.playlist),
            mood = coalesce(excluded.mood, matches.mood)",
        params![
            record.guid,
            record.start_time,
            record.end_time,
            record.arena,
            record.score_blue,
            record.score_orange,
            record.winner,
            record.is_online as i32,
            record.is_overtime as i32,
            record.duration_seconds,
            record.match_type,
            record.playlist,
            record.mood,
        ],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;

    // Retrieve the actual id (inserted or existing).
    let id: i64 = conn
        .query_row(
            "SELECT id FROM matches WHERE guid = ?1",
            params![record.guid],
            |row| row.get(0),
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    sync::enqueue_upsert_conn(
        conn,
        "match",
        record.guid,
        serde_json::json!({ "local_id": id, "guid": record.guid }),
    )?;
    Ok(id)
}

/// Upsert a player by primary_id. Returns the row id.
pub fn upsert_player_by_primary_id(
    conn: &rusqlite::Connection,
    primary_id: &str,
    name: &str,
) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO players (primary_id, name) VALUES (?1, ?2)
         ON CONFLICT(primary_id) DO UPDATE SET name = excluded.name",
        params![primary_id, name],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;

    let id: i64 = conn
        .query_row(
            "SELECT id FROM players WHERE primary_id = ?1",
            params![primary_id],
            |row| row.get(0),
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    enqueue_player_upsert_conn(conn, id)?;
    Ok(id)
}

/// Insert a match_player row (upsert semantics on match_id, player_id).
pub fn upsert_match_player_row(
    conn: &rusqlite::Connection,
    match_id: i64,
    player: MatchPlayerRow,
) -> AppResult<()> {
    let player_id = player.player_id;
    conn.execute(
        "INSERT INTO match_players (match_id, player_id, team_num, score, goals, shots, assists, saves, touches, car_touches, demos, speed, boost, kickoff_goals)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
         ON CONFLICT(match_id, player_id) DO UPDATE SET
            team_num = excluded.team_num,
            score = excluded.score,
            goals = excluded.goals,
            shots = excluded.shots,
            assists = excluded.assists,
            saves = excluded.saves,
            touches = excluded.touches,
            car_touches = excluded.car_touches,
            demos = excluded.demos,
            speed = excluded.speed,
            boost = excluded.boost,
            kickoff_goals = excluded.kickoff_goals",
        params![
            match_id,
            player_id,
            player.team_num,
            player.stats.score,
            player.stats.goals,
            player.stats.shots,
            player.stats.assists,
            player.stats.saves,
            player.stats.touches,
            player.stats.car_touches,
            player.stats.demos,
            player.stats.speed,
            player.stats.boost,
            player.stats.kickoff_goals,
        ],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    enqueue_match_player_upsert_conn(conn, match_id, player_id)?;
    Ok(())
}

/// Insert a match_event row only if no duplicate exists (by match_id, event_type, event_data, occurred_at).
pub fn insert_match_event_if_not_exists(
    conn: &rusqlite::Connection,
    match_id: i64,
    event_type: &str,
    event_data: &str,
    occurred_at: &str,
) -> AppResult<()> {
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM match_events
             WHERE match_id = ?1 AND event_type = ?2 AND event_data = ?3 AND occurred_at = ?4",
            params![match_id, event_type, event_data, occurred_at],
            |row| row.get(0),
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    if !exists {
        conn.execute(
            "INSERT INTO match_events (match_id, event_type, event_data, occurred_at) VALUES (?1, ?2, ?3, ?4)",
            params![match_id, event_type, event_data, occurred_at],
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
        let id = conn.last_insert_rowid();
        sync::enqueue_upsert_conn(
            conn,
            "match_event",
            &id.to_string(),
            serde_json::json!({
                "local_id": id,
                "match_id": match_id,
                "match_guid": match_guid_for_id_conn(conn, match_id)?,
                "event_type": event_type,
                "occurred_at": occurred_at,
            }),
        )?;
    }
    Ok(())
}

/// Insert a session row if not already present for this match_id.
pub fn insert_session_if_not_exists(
    conn: &rusqlite::Connection,
    match_id: i64,
    summary_json: &str,
    created_at: &str,
) -> AppResult<()> {
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sessions WHERE match_id = ?1",
            params![match_id],
            |row| row.get(0),
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    if !exists {
        conn.execute(
            "INSERT INTO sessions (match_id, summary_json, created_at) VALUES (?1, ?2, ?3)",
            params![match_id, summary_json, created_at],
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
        let id = conn.last_insert_rowid();
        sync::enqueue_upsert_conn(
            conn,
            "session",
            &id.to_string(),
            serde_json::json!({
                "local_id": id,
                "match_id": match_id,
                "match_guid": match_guid_for_id_conn(conn, match_id)?,
                "created_at": created_at,
            }),
        )?;
    }
    Ok(())
}

// ─── Session grouping ───────────────────────────────────────────────────────

/// A group of consecutive matches played within a time gap threshold.
#[derive(Clone, Debug, Serialize)]
pub struct MatchSession {
    /// 1-based sequential session number (most recent = 1).
    pub id: i32,
    /// ISO 8601 start time of the session (first match start_time).
    pub start_time: String,
    /// ISO 8601 end time of the session (last match end_time or start_time).
    pub end_time: String,
    /// Total duration from first match start to last match end, in seconds.
    pub duration_seconds: i32,
    /// Number of matches in this session.
    pub match_count: i32,
    /// Wins in this session.
    pub wins: i32,
    /// Losses in this session.
    pub losses: i32,
    /// Matches where local team could not be determined (wins+losses+unknown = match_count).
    pub unknown: i32,
    /// Goals scored by local player in this session.
    pub goals_scored: i32,
    /// Goals conceded by local player in this session.
    pub goals_conceded: i32,
    /// Total shots across all matches in this session.
    pub total_shots: i32,
    /// Total saves across all matches in this session.
    pub total_saves: i32,
    /// Total assists across all matches in this session.
    pub total_assists: i32,
    /// Total demos across all matches in this session.
    pub total_demos: i32,
    /// Kickoff goals scored in this session.
    pub kickoff_goals_scored: i32,
    /// Kickoff goals conceded in this session.
    pub kickoff_goals_conceded: i32,
}

/// Groups matches into play sessions separated by at most `gap_minutes`.
///
/// A session is defined as a sequence of matches where the gap between
/// consecutive matches (previous match end_time to next match start_time)
/// does not exceed `gap_minutes`. Matches are ordered by start_time
/// descending so session #1 is the most recent.
pub fn get_match_sessions(
    pool: &DbPool,
    gap_minutes: u32,
    playlist: Option<&str>,
    match_type: Option<&str>,
    scope: Option<&str>,
) -> AppResult<Vec<MatchSession>> {
    let conn = get_conn(pool)?;

    let mut sql = String::from(
        "SELECT id, guid, start_time, end_time, arena, score_blue, score_orange, winner,
                is_online, is_overtime, duration_seconds, match_type, playlist
         FROM matches
         WHERE 1=1",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(mt) = match_type {
        sql.push_str(" AND LOWER(match_type) = LOWER(?)");
        args.push(Box::new(mt.to_string()));
    }

    if let Some(pl) = playlist {
        sql.push_str(" AND LOWER(playlist) = LOWER(?)");
        args.push(Box::new(pl.to_string()));
    }

    sql.push_str(" ORDER BY start_time DESC");

    let params_refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;

    let matches: Vec<Match> = stmt
        .query_map(&*params_refs, map_match_row)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    if matches.is_empty() {
        return Ok(Vec::new());
    }

    let gap = chrono::Duration::minutes(gap_minutes as i64);
    let mut sessions: Vec<Vec<&Match>> = Vec::new();
    let mut current_group: Vec<&Match> = Vec::new();

    // Matches are ordered by start_time DESC (most recent first).
    // We iterate and group: if the previous match in the group started
    // within `gap` of this match's end, they belong to the same session.
    for m in &matches {
        if let Some(last) = current_group.last() {
            // last.end_time is the previous match (more recent), m is the current (older).
            // Check if m ended close enough to last's start.
            let prev_end = last.end_time.unwrap_or(last.start_time);
            let gap_duration = prev_end - m.start_time;
            if gap_duration <= gap {
                current_group.push(m);
            } else {
                sessions.push(std::mem::take(&mut current_group));
                current_group.push(m);
            }
        } else {
            current_group.push(m);
        }
    }
    if !current_group.is_empty() {
        sessions.push(current_group);
    }

    // Build session summaries.
    let settings = crate::core::settings::get_settings(pool).unwrap_or_default();
    let player_names = identity_candidate_names(&settings);
    let local_stats_by_match = get_local_match_stats_from_conn(
        &conn,
        &matches.iter().map(|m| m.id).collect::<Vec<_>>(),
        settings.local_primary_id.as_deref(),
        &player_names,
    )?;
    let is_individual = scope == Some("me");
    let mut result = Vec::with_capacity(sessions.len());
    for (idx, group) in sessions.iter().enumerate() {
        let first = group.last().unwrap(); // oldest match in group
        let last = group.first().unwrap(); // newest match in group
        let start_time = first.start_time;
        let end_time = last.end_time.unwrap_or(last.start_time);
        let duration_seconds = (end_time - start_time).num_seconds().max(0) as i32;

        let match_count = group.len() as i32;
        let mut wins = 0i32;
        let mut losses = 0i32;
        let mut unknown = 0i32;
        let mut goals_scored = 0i32;
        let mut goals_conceded = 0i32;
        let mut total_shots = 0i32;
        let mut total_saves = 0i32;
        let mut total_assists = 0i32;
        let mut total_demos = 0i32;
        let mut kickoff_goals_scored = 0i32;
        let mut kickoff_goals_conceded = 0i32;

        for m in group.iter() {
            let local_stats = local_stats_by_match.get(&m.id);
            let local_team = local_stats.and_then(|stats| stats.local_team_num);

            if let Some(lt) = local_team {
                if m.winner == Some(lt) {
                    wins += 1;
                } else {
                    losses += 1;
                }

                if is_individual {
                    goals_scored += local_stats.map(|s| s.goals).unwrap_or(0);
                    goals_conceded += if lt == 0 {
                        m.score_orange
                    } else {
                        m.score_blue
                    };
                    kickoff_goals_scored += local_stats.map(|s| s.kickoff_goals).unwrap_or(0);
                    kickoff_goals_conceded +=
                        local_stats.map(|s| s.opponent_kickoff_goals).unwrap_or(0);
                } else {
                    goals_scored += if lt == 0 {
                        m.score_blue
                    } else {
                        m.score_orange
                    };
                    goals_conceded += if lt == 0 {
                        m.score_orange
                    } else {
                        m.score_blue
                    };
                    kickoff_goals_scored += local_stats.map(|s| s.team_kickoff_goals).unwrap_or(0);
                    kickoff_goals_conceded +=
                        local_stats.map(|s| s.opponent_kickoff_goals).unwrap_or(0);
                }
            } else {
                unknown += 1;
            }

            if let Some(local_stats) = local_stats {
                if is_individual {
                    total_shots += local_stats.shots;
                    total_saves += local_stats.saves;
                    total_assists += local_stats.assists;
                    total_demos += local_stats.demos;
                } else {
                    total_shots += local_stats.team_shots;
                    total_saves += local_stats.team_saves;
                    total_assists += local_stats.team_assists;
                    total_demos += local_stats.team_demos;
                }
            }
        }

        result.push(MatchSession {
            id: (idx + 1) as i32,
            start_time: start_time.to_rfc3339(),
            end_time: end_time.to_rfc3339(),
            duration_seconds,
            match_count,
            wins,
            losses,
            unknown,
            goals_scored,
            goals_conceded,
            total_shots,
            total_saves,
            total_assists,
            total_demos,
            kickoff_goals_scored,
            kickoff_goals_conceded,
        });
    }

    Ok(result)
}

// ─── Tracker Network cache helpers ───────────────────────────────────────────

pub fn upsert_tracker_cache(
    pool: &DbPool,
    platform: &str,
    username: &str,
    profile_json: &str,
) -> AppResult<()> {
    let conn = get_conn(pool)?;
    conn.execute(
        "INSERT INTO tracker_cache (platform, username, profile_json, fetched_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(platform, username) DO UPDATE SET
         profile_json = excluded.profile_json,
         fetched_at = excluded.fetched_at",
        params![platform, username, profile_json],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    sync::enqueue_upsert_conn(
        &conn,
        "tracker_cache",
        &format!("{}:{}", platform, username),
        serde_json::json!({ "platform": platform, "username": username }),
    )?;
    debug!(platform, username, "Tracker cache updated");
    Ok(())
}

pub fn get_tracker_cache(
    pool: &DbPool,
    platform: &str,
    username: &str,
) -> AppResult<Option<(String, String)>> {
    let conn = get_conn(pool)?;
    let result = conn
        .query_row(
            "SELECT profile_json, fetched_at FROM tracker_cache WHERE platform = ?1 AND username = ?2",
            params![platform, username],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(result)
}

pub fn upsert_rlstats_cache(
    pool: &DbPool,
    platform: &str,
    username: &str,
    profile_json: &str,
) -> AppResult<()> {
    let conn = get_conn(pool)?;
    conn.execute(
        "INSERT INTO rlstats_cache (platform, username, profile_json, fetched_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(platform, username) DO UPDATE SET
         profile_json = excluded.profile_json,
         fetched_at = excluded.fetched_at",
        params![platform, username, profile_json],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    sync::enqueue_upsert_conn(
        &conn,
        "rlstats_cache",
        &format!("{}:{}", platform, username),
        serde_json::json!({ "platform": platform, "username": username }),
    )?;
    debug!(platform, username, "RLStats cache updated");
    Ok(())
}

pub fn get_rlstats_cache(
    pool: &DbPool,
    platform: &str,
    username: &str,
) -> AppResult<Option<(String, String)>> {
    let conn = get_conn(pool)?;
    let result = conn
        .query_row(
            "SELECT profile_json, fetched_at FROM rlstats_cache WHERE platform = ?1 AND username = ?2",
            params![platform, username],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(result)
}

pub fn upsert_mmr_cache(
    pool: &DbPool,
    provider: &str,
    platform: &str,
    identifier: &str,
    payload_json: &str,
    fetched_at: &str,
) -> AppResult<()> {
    let conn = get_conn(pool)?;
    conn.execute(
        "INSERT INTO mmr_cache (provider, platform, identifier, payload_json, fetched_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(provider, platform, identifier) DO UPDATE SET
         payload_json = excluded.payload_json,
         fetched_at = excluded.fetched_at",
        params![provider, platform, identifier, payload_json, fetched_at],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    sync::enqueue_upsert_conn(
        &conn,
        "mmr_cache",
        &format!("{}:{}:{}", provider, platform, identifier),
        serde_json::json!({ "provider": provider, "platform": platform, "identifier": identifier }),
    )?;
    debug!(provider, platform, identifier, "MMR cache updated");
    Ok(())
}

pub fn get_mmr_cache(
    pool: &DbPool,
    provider: &str,
    platform: &str,
    identifier: &str,
) -> AppResult<Option<(String, String)>> {
    let conn = get_conn(pool)?;
    let result = conn
        .query_row(
            "SELECT payload_json, fetched_at FROM mmr_cache
             WHERE provider = ?1 AND platform = ?2 AND identifier = ?3",
            params![provider, platform, identifier],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(result)
}

pub fn delete_mmr_cache(
    pool: &DbPool,
    provider: &str,
    platform: &str,
    identifier: &str,
) -> AppResult<()> {
    let conn = get_conn(pool)?;
    let entity_key = format!("{}:{}:{}", provider, platform, identifier);
    sync::enqueue_delete_conn(
        &conn,
        "mmr_cache",
        &entity_key,
        serde_json::json!({ "provider": provider, "platform": platform, "identifier": identifier }),
    )?;
    conn.execute(
        "DELETE FROM mmr_cache WHERE provider = ?1 AND platform = ?2 AND identifier = ?3",
        params![provider, platform, identifier],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(())
}

pub fn get_latest_player_mmr_for_playlist(
    pool: &DbPool,
    primary_id: &str,
    playlist: &str,
) -> AppResult<Option<i32>> {
    let conn = get_conn(pool)?;
    conn.query_row(
        "SELECT mp.mmr
         FROM match_players mp
         JOIN players p ON p.id = mp.player_id
         JOIN matches m ON m.id = mp.match_id
         WHERE p.primary_id = ?1
           AND LOWER(COALESCE(m.playlist, '')) = LOWER(?2)
           AND mp.mmr IS NOT NULL
         ORDER BY m.start_time DESC
         LIMIT 1",
        params![primary_id, playlist],
        |row| row.get::<_, i32>(0),
    )
    .optional()
    .map_err(|e| AppError::StorageError(e.to_string()))
}

/// Returns up to `limit` historical MMR values for the given player+playlist,
/// ordered most-recent first. Used to compute an average MMR delta.
pub fn get_player_mmr_history_for_playlist(
    pool: &DbPool,
    primary_id: &str,
    playlist: &str,
    limit: usize,
) -> AppResult<Vec<i32>> {
    let conn = get_conn(pool)?;
    let limit_i64 = i64::try_from(limit.max(1)).unwrap_or(i64::MAX);
    let mut stmt = conn
        .prepare(
            "SELECT mp.mmr
             FROM match_players mp
             JOIN players p ON p.id = mp.player_id
             JOIN matches m ON m.id = mp.match_id
             WHERE p.primary_id = ?1
               AND LOWER(COALESCE(m.playlist, '')) = LOWER(?2)
               AND mp.mmr IS NOT NULL
             ORDER BY m.start_time DESC
             LIMIT ?3",
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let rows = stmt
        .query_map(params![primary_id, playlist, limit_i64], |row| {
            row.get::<_, i32>(0)
        })
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let mut values = Vec::new();
    for row in rows {
        values.push(row.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(values)
}

// ─── Friends ─────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize)]
pub struct FriendRecord {
    pub id: i64,
    pub player_id: i64,
    pub primary_id: String,
    pub name: String,
    pub tag: Option<String>,
    pub created_at: String,
}

pub fn add_friend(pool: &DbPool, player_id: i64, tag: Option<&str>) -> AppResult<()> {
    let conn = get_conn(pool)?;
    conn.execute(
        "INSERT INTO friends (player_id, tag, created_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(player_id) DO UPDATE SET tag = excluded.tag",
        params![player_id, tag],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    sync::enqueue_upsert_conn(
        &conn,
        "friend",
        &player_id.to_string(),
        serde_json::json!({
            "player_id": player_id,
            "player_primary_id": player_primary_id_for_id_conn(&conn, player_id)?,
        }),
    )?;
    Ok(())
}

pub fn remove_friend(pool: &DbPool, player_id: i64) -> AppResult<()> {
    let conn = get_conn(pool)?;
    sync::enqueue_delete_conn(
        &conn,
        "friend",
        &player_id.to_string(),
        serde_json::json!({
            "player_id": player_id,
            "player_primary_id": player_primary_id_for_id_conn(&conn, player_id)?,
        }),
    )?;
    conn.execute(
        "DELETE FROM friends WHERE player_id = ?1",
        params![player_id],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(())
}

pub fn get_friends(pool: &DbPool) -> AppResult<Vec<FriendRecord>> {
    let conn = get_conn(pool)?;
    let mut stmt = conn.prepare(
        "SELECT f.id, f.player_id, p.primary_id, p.name, f.tag, f.created_at
         FROM friends f
         JOIN players p ON f.player_id = p.id
         ORDER BY p.name ASC",
    )?;
    let iter = stmt.query_map([], |row| {
        Ok(FriendRecord {
            id: row.get(0)?,
            player_id: row.get(1)?,
            primary_id: row.get(2)?,
            name: row.get(3)?,
            tag: row.get::<_, Option<String>>(4)?,
            created_at: row.get(5)?,
        })
    })?;
    let mut result = Vec::new();
    for r in iter {
        result.push(r.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(result)
}

pub fn is_friend(pool: &DbPool, player_id: i64) -> AppResult<bool> {
    let conn = get_conn(pool)?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM friends WHERE player_id = ?1",
            params![player_id],
            |row| row.get(0),
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(count > 0)
}

/// Get primary_ids of all friends.
pub fn get_friend_primary_ids(pool: &DbPool) -> AppResult<std::collections::HashSet<String>> {
    let conn = get_conn(pool)?;
    let mut stmt =
        conn.prepare("SELECT p.primary_id FROM friends f JOIN players p ON f.player_id = p.id")?;
    let iter = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut result = std::collections::HashSet::new();
    for r in iter {
        result.insert(r.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(result)
}

// ─── Insights ──────────────────────────────────────────────────────────────

// ─── Player Directory ─────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize)]
pub struct PlayerDirectoryEntry {
    pub player_id: i64,
    pub primary_id: String,
    pub name: String,
    pub total_matches: i32,
    pub matches_as_teammate: i32,
    pub matches_as_opponent: i32,
    pub first_seen: String,
    pub last_seen: String,
    pub wins_together: i32,
    pub losses_together: i32,
    pub wins_against: i32,
    pub losses_against: i32,
    pub avg_score_teammate: f64,
    pub avg_goals_teammate: f64,
    pub avg_assists_teammate: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct PlayerDetailRecord {
    pub player_id: i64,
    pub primary_id: String,
    pub name: String,
    pub total_matches: i32,
    pub matches_as_teammate: i32,
    pub matches_as_opponent: i32,
    pub first_seen: String,
    pub last_seen: String,
    pub wins_together: i32,
    pub losses_together: i32,
    pub wins_against: i32,
    pub losses_against: i32,
    pub total_goals_together: i32,
    pub total_assists_together: i32,
    pub total_saves_together: i32,
    pub total_shots_together: i32,
    pub total_goals_against: i32,
    pub total_assists_against: i32,
    pub total_saves_against: i32,
    pub total_shots_against: i32,
    pub recent_matches: Vec<PlayerMatchEntry>,
}

#[derive(Clone, Debug, Serialize)]
pub struct PlayerMatchEntry {
    pub match_id: i64,
    pub match_guid: String,
    pub start_time: String,
    pub arena: Option<String>,
    pub playlist: Option<String>,
    pub relationship: String, // "teammate" or "opponent"
    pub goals: i32,
    pub assists: i32,
    pub saves: i32,
    pub shots: i32,
    pub score: i32,
    pub demos: i32,
}

#[derive(Clone, Debug, Serialize)]
pub struct PlayerTeammateEntry {
    pub player_id: i64,
    pub primary_id: String,
    pub name: String,
    pub total_matches: i32,
    pub wins: i32,
    pub losses: i32,
    pub win_rate: f64,
    pub avg_goals: f64,
    pub avg_assists: f64,
    pub avg_saves: f64,
    pub last_played: String,
}

/// Get the player directory — all players encountered, with aggregate stats
/// relative to the local player.
#[allow(clippy::too_many_arguments)]
pub fn get_player_directory(
    pool: &DbPool,
    local_primary_id: Option<&str>,
    player_names: &[String],
    search: Option<&str>,
    relationship: Option<&str>, // "teammate", "opponent", or None for all
    sort_by: Option<&str>,      // "matches", "recent", "wins_together", "wins_against"
    limit: i64,
    offset: i64,
) -> AppResult<Vec<PlayerDirectoryEntry>> {
    let conn = get_conn(pool)?;

    let local_id = if let Some(pid) = local_primary_id {
        get_player_id_by_primary_id(&conn, pid)?
    } else if !player_names.is_empty() {
        get_player_id_by_name(&conn, &player_names[0])?
    } else {
        None
    };

    let Some(local_id) = local_id else {
        return Ok(Vec::new());
    };

    let has_search = search.is_some();
    let search_filter = if has_search {
        "AND (LOWER(p.name) LIKE '%' || LOWER(?2) || '%' OR LOWER(p.primary_id) LIKE '%' || LOWER(?3) || '%')".to_string()
    } else {
        String::new()
    };

    let rel_join = if relationship == Some("opponent") {
        "AND mp_local.team_num != mp_other.team_num"
    } else if relationship == Some("teammate") {
        "AND mp_local.team_num = mp_other.team_num"
    } else {
        ""
    };

    let order = match sort_by.unwrap_or("matches") {
        "recent" => "last_seen DESC",
        "wins_together" => "wins_together DESC",
        "wins_against" => "wins_against DESC",
        _ => "total_matches DESC",
    };

    let limit_param = if has_search { "?4" } else { "?2" };
    let offset_param = if has_search { "?5" } else { "?3" };

    let sql = format!(
        r#"SELECT
            p.id,
            p.primary_id,
            p.name,
            COUNT(DISTINCT m.id) AS total_matches,
            SUM(CASE WHEN mp_other.team_num = mp_local.team_num THEN 1 ELSE 0 END) AS matches_as_teammate,
            SUM(CASE WHEN mp_other.team_num != mp_local.team_num THEN 1 ELSE 0 END) AS matches_as_opponent,
            MIN(m.start_time) AS first_seen,
            MAX(m.start_time) AS last_seen,
            SUM(CASE WHEN mp_other.team_num = mp_local.team_num AND m.winner = mp_local.team_num THEN 1 ELSE 0 END) AS wins_together,
            SUM(CASE WHEN mp_other.team_num = mp_local.team_num AND m.winner IS NOT NULL AND m.winner != mp_local.team_num THEN 1 ELSE 0 END) AS losses_together,
            SUM(CASE WHEN mp_other.team_num != mp_local.team_num AND m.winner = mp_local.team_num THEN 1 ELSE 0 END) AS wins_against,
            SUM(CASE WHEN mp_other.team_num != mp_local.team_num AND m.winner IS NOT NULL AND m.winner != mp_local.team_num THEN 1 ELSE 0 END) AS losses_against,
            COALESCE(AVG(CASE WHEN mp_other.team_num = mp_local.team_num THEN mp_other.score END), 0) AS avg_score_teammate,
            COALESCE(AVG(CASE WHEN mp_other.team_num = mp_local.team_num THEN mp_other.goals END), 0) AS avg_goals_teammate,
            COALESCE(AVG(CASE WHEN mp_other.team_num = mp_local.team_num THEN mp_other.assists END), 0) AS avg_assists_teammate
        FROM players p
        JOIN match_players mp_other ON p.id = mp_other.player_id
        JOIN matches m ON mp_other.match_id = m.id
        JOIN match_players mp_local ON m.id = mp_local.match_id AND mp_local.player_id != p.id
        WHERE mp_local.player_id = ?1
          AND p.id != ?1
          {search_filter}
          {rel_join}
        GROUP BY p.id
        ORDER BY {order}
        LIMIT {limit_param} OFFSET {offset_param}"#,
        search_filter = search_filter,
        rel_join = rel_join,
        order = order,
        limit_param = limit_param,
        offset_param = offset_param,
    );

    let mut stmt = conn.prepare(&sql)?;

    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(local_id)];
    if let Some(s) = search {
        params.push(Box::new(s.to_string()));
        params.push(Box::new(s.to_string()));
    }
    params.push(Box::new(limit));
    params.push(Box::new(offset));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let iter = stmt.query_map(&*params_refs, |row| {
        Ok(PlayerDirectoryEntry {
            player_id: row.get(0)?,
            primary_id: row.get(1)?,
            name: row.get(2)?,
            total_matches: row.get(3)?,
            matches_as_teammate: row.get(4)?,
            matches_as_opponent: row.get(5)?,
            first_seen: row.get(6)?,
            last_seen: row.get(7)?,
            wins_together: row.get(8)?,
            losses_together: row.get(9)?,
            wins_against: row.get(10)?,
            losses_against: row.get(11)?,
            avg_score_teammate: row.get(12)?,
            avg_goals_teammate: row.get(13)?,
            avg_assists_teammate: row.get(14)?,
        })
    })?;

    let mut result = Vec::new();
    for entry in iter {
        result.push(entry.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(result)
}

/// Get detailed stats for a specific player, including recent matches against/with them.
pub fn get_player_detail(
    pool: &DbPool,
    target_player_id: i64,
    local_primary_id: Option<&str>,
    player_names: &[String],
) -> AppResult<Option<PlayerDetailRecord>> {
    let conn = get_conn(pool)?;

    let local_id = if let Some(pid) = local_primary_id {
        get_player_id_by_primary_id(&conn, pid)?
    } else if !player_names.is_empty() {
        get_player_id_by_name(&conn, &player_names[0])?
    } else {
        None
    };

    let Some(local_id) = local_id else {
        return Ok(None);
    };

    let summary = conn.query_row(
        r#"SELECT
            p.id, p.primary_id, p.name,
            COUNT(DISTINCT m.id) AS total_matches,
            SUM(CASE WHEN mp_other.team_num = mp_local.team_num THEN 1 ELSE 0 END) AS matches_as_teammate,
            SUM(CASE WHEN mp_other.team_num != mp_local.team_num THEN 1 ELSE 0 END) AS matches_as_opponent,
            MIN(m.start_time) AS first_seen,
            MAX(m.start_time) AS last_seen,
            SUM(CASE WHEN mp_other.team_num = mp_local.team_num AND m.winner = mp_local.team_num THEN 1 ELSE 0 END) AS wins_together,
            SUM(CASE WHEN mp_other.team_num = mp_local.team_num AND m.winner IS NOT NULL AND m.winner != mp_local.team_num THEN 1 ELSE 0 END) AS losses_together,
            SUM(CASE WHEN mp_other.team_num != mp_local.team_num AND m.winner = mp_local.team_num THEN 1 ELSE 0 END) AS wins_against,
            SUM(CASE WHEN mp_other.team_num != mp_local.team_num AND m.winner IS NOT NULL AND m.winner != mp_local.team_num THEN 1 ELSE 0 END) AS losses_against,
            COALESCE(SUM(CASE WHEN mp_other.team_num = mp_local.team_num THEN mp_other.goals END), 0) AS total_goals_together,
            COALESCE(SUM(CASE WHEN mp_other.team_num = mp_local.team_num THEN mp_other.assists END), 0) AS total_assists_together,
            COALESCE(SUM(CASE WHEN mp_other.team_num = mp_local.team_num THEN mp_other.saves END), 0) AS total_saves_together,
            COALESCE(SUM(CASE WHEN mp_other.team_num = mp_local.team_num THEN mp_other.shots END), 0) AS total_shots_together,
            COALESCE(SUM(CASE WHEN mp_other.team_num != mp_local.team_num THEN mp_other.goals END), 0) AS total_goals_against,
            COALESCE(SUM(CASE WHEN mp_other.team_num != mp_local.team_num THEN mp_other.assists END), 0) AS total_assists_against,
            COALESCE(SUM(CASE WHEN mp_other.team_num != mp_local.team_num THEN mp_other.saves END), 0) AS total_saves_against,
            COALESCE(SUM(CASE WHEN mp_other.team_num != mp_local.team_num THEN mp_other.shots END), 0) AS total_shots_against
        FROM players p
        JOIN match_players mp_other ON p.id = mp_other.player_id
        JOIN matches m ON mp_other.match_id = m.id
        JOIN match_players mp_local ON m.id = mp_local.match_id AND mp_local.player_id != p.id
        WHERE p.id = ?1 AND mp_local.player_id = ?2
        GROUP BY p.id"#,
        params![target_player_id, local_id],
        |row| {
            Ok(PlayerDetailRecord {
                player_id: row.get(0)?,
                primary_id: row.get(1)?,
                name: row.get(2)?,
                total_matches: row.get(3)?,
                matches_as_teammate: row.get(4)?,
                matches_as_opponent: row.get(5)?,
                first_seen: row.get(6)?,
                last_seen: row.get(7)?,
                wins_together: row.get(8)?,
                losses_together: row.get(9)?,
                wins_against: row.get(10)?,
                losses_against: row.get(11)?,
                total_goals_together: row.get(12)?,
                total_assists_together: row.get(13)?,
                total_saves_together: row.get(14)?,
                total_shots_together: row.get(15)?,
                total_goals_against: row.get(16)?,
                total_assists_against: row.get(17)?,
                total_saves_against: row.get(18)?,
                total_shots_against: row.get(19)?,
                recent_matches: Vec::new(),
            })
        },
    ).optional().map_err(|e| AppError::StorageError(e.to_string()))?;

    let Some(mut summary) = summary else {
        return Ok(None);
    };

    let mut stmt = conn.prepare(
        r#"SELECT
            m.id, m.guid, m.start_time, m.arena, m.playlist,
            CASE WHEN mp_other.team_num = mp_local.team_num THEN 'teammate' ELSE 'opponent' END AS relationship,
            mp_other.goals, mp_other.assists, mp_other.saves, mp_other.shots, mp_other.score, mp_other.demos
        FROM matches m
        JOIN match_players mp_other ON m.id = mp_other.match_id AND mp_other.player_id = ?1
        JOIN match_players mp_local ON m.id = mp_local.match_id AND mp_local.player_id = ?2
        ORDER BY m.start_time DESC
        LIMIT 50"#,
    )?;

    let iter = stmt.query_map(params![target_player_id, local_id], |row| {
        Ok(PlayerMatchEntry {
            match_id: row.get(0)?,
            match_guid: row.get(1)?,
            start_time: row.get(2)?,
            arena: row.get(3)?,
            playlist: row.get(4)?,
            relationship: row.get(5)?,
            goals: row.get(6)?,
            assists: row.get(7)?,
            saves: row.get(8)?,
            shots: row.get(9)?,
            score: row.get(10)?,
            demos: row.get(11)?,
        })
    })?;

    for entry in iter {
        summary
            .recent_matches
            .push(entry.map_err(|e| AppError::StorageError(e.to_string()))?);
    }

    Ok(Some(summary))
}

fn get_player_id_by_primary_id(
    conn: &rusqlite::Connection,
    primary_id: &str,
) -> AppResult<Option<i64>> {
    conn.query_row(
        "SELECT id FROM players WHERE primary_id = ?1",
        params![primary_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| AppError::StorageError(e.to_string()))
}

fn get_player_id_by_name(conn: &rusqlite::Connection, name: &str) -> AppResult<Option<i64>> {
    conn.query_row(
        "SELECT id FROM players WHERE LOWER(TRIM(name)) = LOWER(TRIM(?1)) LIMIT 1",
        params![name],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| AppError::StorageError(e.to_string()))
}

/// Summary of individual player stats for a date range.
#[derive(Clone, Debug, Default)]
pub struct IndividualAnalyticsSummary {
    pub total_matches: i32,
    pub wins: i32,
    pub losses: i32,
    pub total_goals: i32,
    pub total_conceded: i32,
    pub total_shots: i32,
    pub total_saves: i32,
    pub total_assists: i32,
    pub total_demos: i32,
    pub avg_score: f64,
    pub avg_duration: f64,
    pub peak_speed: f64,
}

/// Compute analytics summary for a specific player identity across a date range.
/// Aggregates individual stats from match_players joined with matches.
pub fn get_analytics_summary_for_identity(
    pool: &DbPool,
    local_primary_id: &str,
    start_date: &str,
    end_date: &str,
    playlist: Option<&str>,
    match_type: Option<&str>,
) -> AppResult<IndividualAnalyticsSummary> {
    let conn = get_conn(pool)?;

    let mut sql = String::from(
        "SELECT m.winner, mp.team_num, m.score_blue, m.score_orange, m.duration_seconds,
                mp.goals, mp.shots, mp.saves, mp.assists, mp.demos, mp.score, mp.speed
         FROM matches m
         JOIN match_players mp ON m.id = mp.match_id
         JOIN players p ON mp.player_id = p.id
         WHERE p.primary_id = ?1
           AND m.start_time >= ?2
           AND m.start_time < date(?3, '+1 day')",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    args.push(Box::new(local_primary_id.to_string()));
    args.push(Box::new(start_date.to_string()));
    args.push(Box::new(end_date.to_string()));

    if let Some(mt) = match_type {
        sql.push_str(" AND LOWER(m.match_type) = LOWER(?)");
        args.push(Box::new(mt.to_string()));
    }
    if let Some(pl) = playlist {
        sql.push_str(" AND LOWER(m.playlist) = LOWER(?)");
        args.push(Box::new(pl.to_string()));
    }

    let params_refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(&*params_refs, |row| {
        Ok((
            row.get::<_, Option<i32>>(0)?,
            row.get::<_, i32>(1)?,
            row.get::<_, i32>(2)?,
            row.get::<_, i32>(3)?,
            row.get::<_, i32>(4)?,
            row.get::<_, i32>(5)?,
            row.get::<_, i32>(6)?,
            row.get::<_, i32>(7)?,
            row.get::<_, i32>(8)?,
            row.get::<_, i32>(9)?,
            row.get::<_, i32>(10)?,
            row.get::<_, f64>(11)?,
        ))
    })?;

    let mut summary = IndividualAnalyticsSummary::default();

    for row in rows {
        let (
            winner,
            team_num,
            score_blue,
            score_orange,
            duration,
            goals,
            shots,
            saves,
            assists,
            demos,
            score,
            speed,
        ) = row.map_err(|e| AppError::StorageError(e.to_string()))?;

        summary.total_matches += 1;
        if winner == Some(team_num) {
            summary.wins += 1;
        } else if winner.is_some() {
            summary.losses += 1;
        }

        summary.total_goals += goals;
        summary.total_conceded += if team_num == 0 {
            score_orange
        } else {
            score_blue
        };
        summary.total_shots += shots;
        summary.total_saves += saves;
        summary.total_assists += assists;
        summary.total_demos += demos;
        summary.avg_score += score as f64;
        summary.avg_duration += duration as f64;
        if speed > summary.peak_speed {
            summary.peak_speed = speed;
        }
    }

    if summary.total_matches > 0 {
        summary.avg_score /= summary.total_matches as f64;
        summary.avg_duration /= summary.total_matches as f64;
    }

    Ok(summary)
}

/// Insights are always computed from the local player's own rows.
///
/// `scope` is accepted for call-site symmetry with the other analytics
/// functions but deliberately unused: the query already joins on
/// `local_primary_id`, so per-player figures are individual by construction,
/// and everything else here (playlist / hourly win rates, overtime, close and
/// blowout records) is a match outcome that is identical whichever scope the
/// UI is showing. Wiring it up would not change a single number.
pub fn get_insights(
    pool: &DbPool,
    player_primary_id: &str,
    start_date: &str,
    end_date: &str,
    playlist: Option<&str>,
    match_type: Option<&str>,
    _scope: Option<&str>,
) -> AppResult<serde_json::Value> {
    let conn = get_conn(pool)?;

    let mut sql = String::from(
        "SELECT m.id, m.winner, mp.team_num, m.playlist, m.start_time,
                m.is_overtime, m.score_blue, m.score_orange,
                mp.score, mp.goals, mp.assists, mp.saves, mp.shots, mp.demos,
                m.arena
         FROM matches m
         JOIN match_players mp ON m.id = mp.match_id
         JOIN players p ON mp.player_id = p.id
         WHERE p.primary_id = ?1
           AND m.winner IS NOT NULL
           AND m.start_time >= ?2
           AND m.start_time < date(?3, '+1 day')",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    args.push(Box::new(player_primary_id.to_string()));
    args.push(Box::new(start_date.to_string()));
    args.push(Box::new(end_date.to_string()));

    if let Some(mt) = match_type {
        sql.push_str(" AND LOWER(m.match_type) = LOWER(?)");
        args.push(Box::new(mt.to_string()));
    }

    if let Some(pl) = playlist {
        sql.push_str(" AND LOWER(m.playlist) = LOWER(?)");
        args.push(Box::new(pl.to_string()));
    }

    sql.push_str(" ORDER BY m.start_time ASC");

    let params_refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;

    type MatchPlayerRow = (
        i64,
        Option<i32>,
        i32,
        Option<String>,
        String,
        i32,
        i32,
        i32,
        i32,
        i32,
        i32,
        i32,
        i32,
        i32,
        Option<String>,
    );
    let rows: Vec<MatchPlayerRow> = stmt
        .query_map(&*params_refs, |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
                row.get(9)?,
                row.get(10)?,
                row.get(11)?,
                row.get(12)?,
                row.get(13)?,
                row.get(14)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    if rows.is_empty() {
        return Ok(serde_json::json!({ "available": false, "totalMatches": 0 }));
    }

    // Load every GoalScored event for the relevant matches so comebacks and
    // collapses can be reconstructed from the running score.
    let match_ids: Vec<i64> = rows.iter().map(|row| row.0).collect();
    let goal_timelines = load_goal_timelines(&conn, &match_ids)?;

    let mut by_playlist: std::collections::HashMap<String, (i32, i32)> =
        std::collections::HashMap::new();
    let mut by_hour: std::collections::HashMap<u32, (i32, i32)> = std::collections::HashMap::new();
    let mut by_weekday: std::collections::HashMap<u32, (i32, i32)> =
        std::collections::HashMap::new();
    let mut heatmap: std::collections::HashMap<(u32, u32), (i32, i32)> =
        std::collections::HashMap::new();
    let mut by_arena: std::collections::HashMap<String, (i32, i32)> =
        std::collections::HashMap::new();
    let mut ot_games = 0i32;
    let mut ot_wins = 0i32;
    let mut close_games = 0i32;
    let mut close_wins = 0i32;
    let mut blowout_games = 0i32;
    let mut blowout_wins = 0i32;
    let mut comeback_wins = 0i32;
    let mut collapse_losses = 0i32;
    let mut total_team_goals = 0i32;
    let mut total_my_goals = 0i32;
    let mut total_my_assists = 0i32;
    let mut total_my_saves = 0i32;
    let mut total_my_shots = 0i32;
    let mut total_my_demos = 0i32;

    for row in &rows {
        let (
            match_id,
            winner,
            team,
            playlist,
            start_time,
            is_overtime,
            score_blue,
            score_orange,
            _score,
            goals,
            assists,
            saves,
            shots,
            demos,
            arena,
        ) = row;
        let playlist_key = playlist.clone().unwrap_or_else(|| "Desconocido".into());
        let entry = by_playlist.entry(playlist_key).or_insert((0, 0));
        entry.0 += 1;

        if let (Some(winner), team) = (winner, team) {
            let is_win = *winner == *team;
            if is_win {
                entry.1 += 1;
            }

            // All time buckets use the machine's local timezone: the stored
            // timestamps are UTC, so bucketing on the raw hour produced the
            // "random hours" best-hour bug.
            if let Some(hour) = local_hour(start_time) {
                let he = by_hour.entry(hour).or_insert((0, 0));
                he.0 += 1;
                if is_win {
                    he.1 += 1;
                }
                if let Some(weekday) = local_weekday(start_time) {
                    let we = by_weekday.entry(weekday).or_insert((0, 0));
                    we.0 += 1;
                    if is_win {
                        we.1 += 1;
                    }
                    let cell = heatmap.entry((weekday, hour)).or_insert((0, 0));
                    cell.0 += 1;
                    if is_win {
                        cell.1 += 1;
                    }
                }
            }

            let arena_key = arena.clone().unwrap_or_else(|| "Desconocida".into());
            let ae = by_arena.entry(arena_key).or_insert((0, 0));
            ae.0 += 1;
            if is_win {
                ae.1 += 1;
            }

            if *is_overtime != 0 {
                ot_games += 1;
                if is_win {
                    ot_wins += 1;
                }
            }

            let my_score = if *team == 0 {
                *score_blue
            } else {
                *score_orange
            };
            let their_score = if *team == 0 {
                *score_orange
            } else {
                *score_blue
            };
            let diff = my_score - their_score;
            if diff.abs() == 1 {
                close_games += 1;
                if is_win {
                    close_wins += 1;
                }
            }
            if diff.abs() >= 4 {
                blowout_games += 1;
                if is_win {
                    blowout_wins += 1;
                }
            }

            // Comeback / collapse: reconstruct the running score from the goal
            // timeline of the match, translated into *my* team's perspective.
            // A comeback is a win after trailing at some point; a collapse is
            // a loss after leading at some point.
            if let Some((blue_ahead, orange_ahead)) = goal_timelines.get(match_id) {
                let (ever_behind, ever_ahead) =
                    relative_timeline_flags(*blue_ahead, *orange_ahead, *team);
                if is_win && ever_behind {
                    comeback_wins += 1;
                }
                if !is_win && ever_ahead {
                    collapse_losses += 1;
                }
            }
        }

        total_team_goals += if *team == 0 {
            *score_blue
        } else {
            *score_orange
        };
        total_my_goals += goals;
        total_my_assists += assists;
        total_my_saves += saves;
        total_my_shots += shots;
        total_my_demos += demos;
    }

    let mut team_sql = String::from(
        "SELECT SUM(assists), SUM(saves), SUM(shots), SUM(demos)
         FROM match_players mp
         JOIN matches m ON mp.match_id = m.id
         WHERE m.start_time >= ?1 AND m.start_time < date(?2, '+1 day')",
    );
    let mut team_args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    team_args.push(Box::new(start_date.to_string()));
    team_args.push(Box::new(end_date.to_string()));

    if let Some(mt) = match_type {
        team_sql.push_str(" AND LOWER(m.match_type) = LOWER(?)");
        team_args.push(Box::new(mt.to_string()));
    }

    if let Some(pl) = playlist {
        team_sql.push_str(" AND LOWER(m.playlist) = LOWER(?)");
        team_args.push(Box::new(pl.to_string()));
    }

    let team_params_refs: Vec<&dyn rusqlite::ToSql> =
        team_args.iter().map(|a| a.as_ref()).collect();
    let mut team_stmt = conn.prepare(&team_sql)?;
    let (total_team_assists, total_team_saves, total_team_shots, total_team_demos): (
        i32,
        i32,
        i32,
        i32,
    ) = team_stmt
        .query_row(&*team_params_refs, |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, i32>(1)?,
                row.get::<_, i32>(2)?,
                row.get::<_, i32>(3)?,
            ))
        })
        .unwrap_or((0, 0, 0, 0));

    let mut best_playlist = String::new();
    let mut best_playlist_wr = 0f64;
    let mut playlist_stats = Vec::new();
    for (name, (played, won)) in &by_playlist {
        let wr = if *played > 0 {
            (*won as f64 / *played as f64) * 100.0
        } else {
            0.0
        };
        if *played >= 3 && wr > best_playlist_wr {
            best_playlist_wr = wr;
            best_playlist = name.clone();
        }
        playlist_stats.push(serde_json::json!({
            "name": name, "played": played, "won": won,
            "winRate": wr.round() as i32,
        }));
    }
    playlist_stats.sort_by(|a, b| {
        b["played"]
            .as_i64()
            .unwrap()
            .cmp(&a["played"].as_i64().unwrap())
    });

    let mut best_hour = 0u32;
    let mut best_hour_wr = 0f64;
    let mut hour_stats = Vec::new();
    for (&hour, (played, won)) in &by_hour {
        let wr = if *played > 0 {
            (*won as f64 / *played as f64) * 100.0
        } else {
            0.0
        };
        if *played >= MIN_INSIGHT_SAMPLE && wr > best_hour_wr {
            best_hour_wr = wr;
            best_hour = hour;
        }
        hour_stats.push(serde_json::json!({
            "hour": hour, "played": played, "won": won,
            "winRate": wr.round() as i32,
        }));
    }
    hour_stats.sort_by_key(|h| h["hour"].as_u64().unwrap());

    let mut best_weekday = 0u32;
    let mut best_weekday_wr = 0f64;
    let mut weekday_stats = Vec::new();
    for (&weekday, (played, won)) in &by_weekday {
        let wr = if *played > 0 {
            (*won as f64 / *played as f64) * 100.0
        } else {
            0.0
        };
        if *played >= MIN_INSIGHT_SAMPLE && wr > best_weekday_wr {
            best_weekday_wr = wr;
            best_weekday = weekday;
        }
        weekday_stats.push(serde_json::json!({
            "weekday": weekday, "played": played, "won": won,
            "winRate": wr.round() as i32,
        }));
    }
    weekday_stats.sort_by_key(|w| w["weekday"].as_u64().unwrap());

    let mut heatmap_stats = Vec::new();
    for (&(weekday, hour), (played, won)) in &heatmap {
        let wr = if *played > 0 {
            (*won as f64 / *played as f64) * 100.0
        } else {
            0.0
        };
        heatmap_stats.push(serde_json::json!({
            "weekday": weekday, "hour": hour,
            "played": played, "won": won,
            "winRate": wr.round() as i32,
        }));
    }
    heatmap_stats.sort_by(|a, b| {
        (a["weekday"].as_u64().unwrap(), a["hour"].as_u64().unwrap())
            .cmp(&(b["weekday"].as_u64().unwrap(), b["hour"].as_u64().unwrap()))
    });

    let mut arena_stats = Vec::new();
    for (name, (played, won)) in &by_arena {
        let wr = if *played > 0 {
            (*won as f64 / *played as f64) * 100.0
        } else {
            0.0
        };
        arena_stats.push(serde_json::json!({
            "name": name, "played": played, "won": won,
            "winRate": wr.round() as i32,
        }));
    }
    arena_stats.sort_by(|a, b| {
        b["played"]
            .as_i64()
            .unwrap()
            .cmp(&a["played"].as_i64().unwrap())
    });

    let total_matches = rows.len() as i32;

    Ok(serde_json::json!({
        "available": true,
        "totalMatches": total_matches,
        "playlists": playlist_stats,
        "bestPlaylist": if best_playlist.is_empty() { "N/A" } else { &best_playlist },
        "bestPlaylistWR": best_playlist_wr.round() as i32,
        "byHour": hour_stats,
        "bestHour": best_hour,
        "bestHourWR": best_hour_wr.round() as i32,
        "byWeekday": weekday_stats,
        "bestWeekday": best_weekday,
        "bestWeekdayWR": best_weekday_wr.round() as i32,
        "heatmap": heatmap_stats,
        "byArena": arena_stats,
        "minSample": MIN_INSIGHT_SAMPLE,
        "otGames": ot_games,
        "otWins": ot_wins,
        "otLosses": ot_games - ot_wins,
        "otWinRate": if ot_games > 0 { ((ot_wins as f64 / ot_games as f64) * 100.0).round() as i32 } else { 0 },
        "closeGames": close_games,
        "closeWinRate": if close_games > 0 { ((close_wins as f64 / close_games as f64) * 100.0).round() as i32 } else { 0 },
        "blowoutGames": blowout_games,
        "blowoutWins": blowout_wins,
        "blowoutLosses": blowout_games - blowout_wins,
        "blowoutWinRate": if blowout_games > 0 { ((blowout_wins as f64 / blowout_games as f64) * 100.0).round() as i32 } else { 0 },
        "comebackWins": comeback_wins,
        "collapseLosses": collapse_losses,
        "contrib": {
            "goalsPct": if total_team_goals > 0 { ((total_my_goals as f64 / total_team_goals as f64) * 100.0).round() as i32 } else { 0 },
            "assistsPct": if total_team_assists > 0 { ((total_my_assists as f64 / total_team_assists as f64) * 100.0).round() as i32 } else { 0 },
            "savesPct": if total_team_saves > 0 { ((total_my_saves as f64 / total_team_saves as f64) * 100.0).round() as i32 } else { 0 },
            "shotsPct": if total_team_shots > 0 { ((total_my_shots as f64 / total_team_shots as f64) * 100.0).round() as i32 } else { 0 },
            "demosPct": if total_team_demos > 0 { ((total_my_demos as f64 / total_team_demos as f64) * 100.0).round() as i32 } else { 0 },
        },
    }))
}

/// Reconstructs, for every match, which color ever led during the match,
/// based on the GoalScored timeline persisted in `match_events`.
///
/// The running score is rebuilt from each goal's `scorer.teamNum` and the
/// result is `(blue_ever_ahead, orange_ever_ahead)` in absolute colors.
/// Callers translate that into the viewer's perspective with
/// [`relative_timeline_flags`]: a player on orange who wins after blue led
/// staged a comeback just as much as a blue player who wins after orange
/// led. (This used to return perspective-blind ever-behind/ever-ahead flags,
/// so every comeback/collapse involving an orange local team was missed.)
///
/// Matches without goal events simply yield `(false, false)`, so they never
/// count as comebacks or collapses — no timeline, no claim.
fn load_goal_timelines(
    conn: &rusqlite::Connection,
    match_ids: &[i64],
) -> AppResult<HashMap<i64, (bool, bool)>> {
    if match_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let placeholders = vec!["?"; match_ids.len()].join(", ");
    let sql = format!(
        "SELECT match_id, event_data
         FROM match_events
         WHERE event_type = 'GoalScored' AND match_id IN ({placeholders})
         ORDER BY occurred_at ASC, id ASC"
    );

    let mut stmt = conn.prepare(&sql)?;
    let iter = stmt.query_map(
        rusqlite::params_from_iter(match_ids.iter().copied()),
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
    )?;

    let mut running: HashMap<i64, (i32, i32)> = HashMap::new();
    let mut flags: HashMap<i64, (bool, bool)> = HashMap::new();

    for entry in iter {
        let (match_id, event_data) = entry.map_err(|e| AppError::StorageError(e.to_string()))?;
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&event_data) else {
            continue;
        };
        let Some(team_num) = value
            .get("scorer")
            .or_else(|| value.get("Scorer"))
            .and_then(|scorer| scorer.get("teamNum").or_else(|| scorer.get("TeamNum")))
            .and_then(|team| team.as_i64())
        else {
            continue;
        };

        let scores = running.entry(match_id).or_insert((0, 0));
        if team_num == 0 {
            scores.0 += 1;
        } else {
            scores.1 += 1;
        }

        let flag = flags.entry(match_id).or_insert((false, false));
        if scores.0 > scores.1 {
            flag.0 = true; // blue ahead
        } else if scores.1 > scores.0 {
            flag.1 = true; // orange ahead
        }
    }

    Ok(flags)
}

/// Translate absolute timeline flags into the perspective of `my_team`:
/// `(ever_behind, ever_ahead)` — was *my* team losing / winning at some point.
fn relative_timeline_flags(blue_ahead: bool, orange_ahead: bool, my_team: i32) -> (bool, bool) {
    if my_team == 0 {
        (orange_ahead, blue_ahead)
    } else {
        (blue_ahead, orange_ahead)
    }
}

/// Matches played by a given player (any platform identity), with the match
/// outcome, score, overtime and situation flags (comeback / collapse) from
/// the perspective of that player's team. Used by the per-profile analytics
/// view on the Analytics page.
pub fn get_player_analytics_matches(
    pool: &DbPool,
    player_primary_id: &str,
    start_date: &str,
    end_date: &str,
    playlist: Option<&str>,
    match_type: Option<&str>,
    limit: i64,
) -> AppResult<Vec<serde_json::Value>> {
    let conn = get_conn(pool)?;

    let mut sql = String::from(
        "SELECT m.id, m.guid, m.start_time, m.end_time, m.arena,
                m.score_blue, m.score_orange, m.winner,
                m.is_online, m.is_overtime, m.duration_seconds,
                m.match_type, m.playlist,
                mp.team_num, mp.goals, mp.assists, mp.saves, mp.shots, mp.score, mp.demos,
                mp.kickoff_goals, m.mood
         FROM matches m
         JOIN match_players mp ON m.id = mp.match_id
         JOIN players p ON mp.player_id = p.id
         WHERE p.primary_id = ?1
           AND m.winner IS NOT NULL
           AND m.start_time >= ?2
           AND m.start_time < date(?3, '+1 day')
           AND m.match_type != 'training'",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    args.push(Box::new(player_primary_id.to_string()));
    args.push(Box::new(start_date.to_string()));
    args.push(Box::new(end_date.to_string()));

    if let Some(mt) = match_type {
        sql.push_str(" AND LOWER(m.match_type) = LOWER(?)");
        args.push(Box::new(mt.to_string()));
    }
    if let Some(pl) = playlist {
        sql.push_str(" AND LOWER(m.playlist) = LOWER(?)");
        args.push(Box::new(pl.to_string()));
    }

    sql.push_str(" ORDER BY m.start_time DESC LIMIT ?4");

    let mut params: Vec<Box<dyn rusqlite::ToSql>> = args;
    params.push(Box::new(limit.max(1)));
    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|a| a.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let iter = stmt.query_map(&*params_refs, |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, i32>(5)?,
            row.get::<_, i32>(6)?,
            row.get::<_, Option<i32>>(7)?,
            row.get::<_, i32>(8)?,
            row.get::<_, i32>(9)?,
            row.get::<_, i32>(10)?,
            row.get::<_, Option<String>>(11)?,
            row.get::<_, Option<String>>(12)?,
            row.get::<_, i32>(13)?,
            row.get::<_, i32>(14)?,
            row.get::<_, i32>(15)?,
            row.get::<_, i32>(16)?,
            row.get::<_, i32>(17)?,
            row.get::<_, i32>(18)?,
            row.get::<_, i32>(19)?,
            row.get::<_, i32>(20)?,
            row.get::<_, Option<String>>(21).unwrap_or(None),
        ))
    })?;

    let mut match_ids = Vec::new();
    let mut rows = Vec::new();
    for entry in iter {
        let row = entry.map_err(|e| AppError::StorageError(e.to_string()))?;
        match_ids.push(row.0);
        rows.push(row);
    }

    let timelines = load_goal_timelines(&conn, &match_ids)?;

    let mut result = Vec::new();
    for row in rows {
        let (
            match_id,
            guid,
            start_time,
            end_time,
            arena,
            score_blue,
            score_orange,
            winner,
            is_online,
            is_overtime,
            duration_seconds,
            match_type,
            playlist,
            team_num,
            goals,
            assists,
            saves,
            shots,
            score,
            demos,
            kickoff_goals,
            mood,
        ) = row;

        let is_win = winner == Some(team_num);
        let my_score = if team_num == 0 {
            score_blue
        } else {
            score_orange
        };
        let their_score = if team_num == 0 {
            score_orange
        } else {
            score_blue
        };
        let (blue_ahead, orange_ahead) =
            timelines.get(&match_id).copied().unwrap_or((false, false));
        let (ever_behind, ever_ahead) = relative_timeline_flags(blue_ahead, orange_ahead, team_num);
        let was_comeback = is_win && ever_behind;
        let was_collapse = !is_win && ever_ahead;

        result.push(serde_json::json!({
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
            "team_num": team_num,
            "is_win": is_win,
            "goal_diff": my_score - their_score,
            "goals": goals,
            "assists": assists,
            "saves": saves,
            "shots": shots,
            "score": score,
            "demos": demos,
            "kickoff_goals": kickoff_goals,
            "mood": mood,
            "was_comeback": was_comeback,
            "was_collapse": was_collapse,
        }));
    }

    Ok(result)
}

pub(crate) fn compute_head_to_head_conn(
    conn: &rusqlite::Connection,
    local_primary_id: &str,
    opponent_ids: &[String],
) -> AppResult<HashMap<String, HeadToHeadRecord>> {
    if opponent_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let placeholders: Vec<String> = opponent_ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect();
    let in_clause = placeholders.join(",");

    let sql = format!(
        "SELECT p_other.primary_id,
            SUM(CASE WHEN mp_other.team_num != mp_local.team_num AND m.winner = mp_local.team_num THEN 1 ELSE 0 END) as wins_against,
            SUM(CASE WHEN mp_other.team_num != mp_local.team_num AND m.winner IS NOT NULL AND m.winner != mp_local.team_num THEN 1 ELSE 0 END) as losses_against,
            SUM(CASE WHEN mp_other.team_num = mp_local.team_num AND m.winner = mp_local.team_num THEN 1 ELSE 0 END) as wins_together,
            SUM(CASE WHEN mp_other.team_num = mp_local.team_num AND m.winner IS NOT NULL AND m.winner != mp_local.team_num THEN 1 ELSE 0 END) as losses_together
         FROM match_players mp_local
         JOIN players p_local ON mp_local.player_id = p_local.id
         JOIN match_players mp_other ON mp_local.match_id = mp_other.match_id
         JOIN players p_other ON mp_other.player_id = p_other.id
         JOIN matches m ON mp_local.match_id = m.id
         WHERE p_other.primary_id IN ({in_clause})
           AND p_local.primary_id = ?{n}
         GROUP BY p_other.primary_id",
        in_clause = in_clause,
        n = opponent_ids.len() + 1
    );

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    for id in opponent_ids {
        params.push(Box::new(id.clone()));
    }
    params.push(Box::new(local_primary_id.to_string()));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|a| a.as_ref()).collect();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let rows = stmt
        .query_map(&*param_refs, |row| {
            Ok((
                row.get::<_, String>(0)?,
                HeadToHeadRecord {
                    wins_against: row.get(1)?,
                    losses_against: row.get(2)?,
                    wins_together: row.get(3)?,
                    losses_together: row.get(4)?,
                },
            ))
        })
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    let mut result = HashMap::new();
    for row in rows {
        let (id, record) = row.map_err(|e| AppError::StorageError(e.to_string()))?;
        result.insert(id, record);
    }

    Ok(result)
}

pub fn get_head_to_head_records(
    pool: &DbPool,
    local_primary_id: &str,
    opponent_ids: &[String],
) -> AppResult<HashMap<String, HeadToHeadRecord>> {
    if opponent_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let conn = get_conn(pool)?;
    let placeholders: Vec<String> = opponent_ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect();
    let in_clause = placeholders.join(",");

    let sql = format!(
        "SELECT p_other.primary_id,
            SUM(CASE WHEN mp_other.team_num != mp_local.team_num AND m.winner = mp_local.team_num THEN 1 ELSE 0 END) as wins_against,
            SUM(CASE WHEN mp_other.team_num != mp_local.team_num AND m.winner IS NOT NULL AND m.winner != mp_local.team_num THEN 1 ELSE 0 END) as losses_against,
            SUM(CASE WHEN mp_other.team_num = mp_local.team_num AND m.winner = mp_local.team_num THEN 1 ELSE 0 END) as wins_together,
            SUM(CASE WHEN mp_other.team_num = mp_local.team_num AND m.winner IS NOT NULL AND m.winner != mp_local.team_num THEN 1 ELSE 0 END) as losses_together
         FROM match_players mp_local
         JOIN players p_local ON mp_local.player_id = p_local.id
         JOIN match_players mp_other ON mp_local.match_id = mp_other.match_id
         JOIN players p_other ON mp_other.player_id = p_other.id
         JOIN matches m ON mp_local.match_id = m.id
         WHERE p_other.primary_id IN ({in_clause})
           AND p_local.primary_id = ?{n}
         GROUP BY p_other.primary_id",
        in_clause = in_clause,
        n = opponent_ids.len() + 1
    );

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    for id in opponent_ids {
        params.push(Box::new(id.clone()));
    }
    params.push(Box::new(local_primary_id.to_string()));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|a| a.as_ref()).collect();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let rows = stmt
        .query_map(&*param_refs, |row| {
            Ok((
                row.get::<_, String>(0)?,
                HeadToHeadRecord {
                    wins_against: row.get(1)?,
                    losses_against: row.get(2)?,
                    wins_together: row.get(3)?,
                    losses_together: row.get(4)?,
                },
            ))
        })
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    let mut result = HashMap::new();
    for row in rows {
        let (id, record) = row.map_err(|e| AppError::StorageError(e.to_string()))?;
        result.insert(id, record);
    }

    Ok(result)
}

// --- User Presets -----------------------------------------------------------

fn optional_json<T: serde::Serialize>(value: &Option<T>) -> AppResult<Option<String>> {
    match value {
        Some(v) => serde_json::to_string(v)
            .map(Some)
            .map_err(|e| AppError::ParseError(e.to_string())),
        None => Ok(None),
    }
}

fn map_user_preset_row(row: &rusqlite::Row) -> rusqlite::Result<UserPreset> {
    let camera_json: Option<String> = row.get(3)?;
    let controls_json: Option<String> = row.get(4)?;
    let deadzone_json: Option<String> = row.get(5)?;
    let hardware_json: Option<String> = row.get(6)?;

    Ok(UserPreset {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        camera: camera_json.and_then(|s| serde_json::from_str(&s).ok()),
        controls: controls_json.and_then(|s| serde_json::from_str(&s).ok()),
        deadzone: deadzone_json.and_then(|s| serde_json::from_str(&s).ok()),
        hardware: hardware_json.and_then(|s| serde_json::from_str(&s).ok()),
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

pub fn list_user_presets(pool: &DbPool) -> AppResult<Vec<UserPreset>> {
    let conn = get_conn(pool)?;
    let mut stmt = conn.prepare(
        "SELECT id, name, description, camera_json, controls_json, deadzone_json, hardware_json, created_at, updated_at
         FROM user_presets
         ORDER BY updated_at DESC",
    )?;
    let iter = stmt.query_map([], map_user_preset_row)?;
    let mut result = Vec::new();
    for r in iter {
        result.push(r.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(result)
}

pub fn get_user_preset(pool: &DbPool, id: i64) -> AppResult<Option<UserPreset>> {
    let conn = get_conn(pool)?;
    let result = conn
        .query_row(
            "SELECT id, name, description, camera_json, controls_json, deadzone_json, hardware_json, created_at, updated_at
             FROM user_presets
             WHERE id = ?1",
            params![id],
            map_user_preset_row,
        )
        .optional()
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(result)
}

#[allow(clippy::too_many_arguments)]
pub fn insert_user_preset(
    pool: &DbPool,
    name: &str,
    description: Option<&str>,
    camera: &Option<CameraSettings>,
    controls: &Option<ControlSettings>,
    deadzone: &Option<DeadzoneSettings>,
    hardware: &Option<HardwareSettings>,
) -> AppResult<i64> {
    let conn = get_conn(pool)?;
    let camera_json = optional_json(camera)?;
    let controls_json = optional_json(controls)?;
    let deadzone_json = optional_json(deadzone)?;
    let hardware_json = optional_json(hardware)?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO user_presets (name, description, camera_json, controls_json, deadzone_json, hardware_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![name, description, camera_json, controls_json, deadzone_json, hardware_json, now, now],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;

    let id = conn.last_insert_rowid();
    sync::enqueue_upsert_conn(
        &conn,
        "user_preset",
        &id.to_string(),
        serde_json::json!({ "local_id": id, "name": name }),
    )?;
    info!(preset_id = id, name, "Inserted user preset");
    Ok(id)
}

#[allow(clippy::too_many_arguments)]
pub fn update_user_preset(
    pool: &DbPool,
    id: i64,
    name: &str,
    description: Option<&str>,
    camera: &Option<CameraSettings>,
    controls: &Option<ControlSettings>,
    deadzone: &Option<DeadzoneSettings>,
    hardware: &Option<HardwareSettings>,
) -> AppResult<()> {
    let conn = get_conn(pool)?;
    let camera_json = optional_json(camera)?;
    let controls_json = optional_json(controls)?;
    let deadzone_json = optional_json(deadzone)?;
    let hardware_json = optional_json(hardware)?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE user_presets SET name = ?1, description = ?2, camera_json = ?3, controls_json = ?4, deadzone_json = ?5, hardware_json = ?6, updated_at = ?7 WHERE id = ?8",
        params![name, description, camera_json, controls_json, deadzone_json, hardware_json, now, id],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    sync::enqueue_upsert_conn(
        &conn,
        "user_preset",
        &id.to_string(),
        serde_json::json!({ "local_id": id, "name": name }),
    )?;
    info!(preset_id = id, name, "Updated user preset");
    Ok(())
}

pub fn delete_user_preset(pool: &DbPool, id: i64) -> AppResult<()> {
    let conn = get_conn(pool)?;
    sync::enqueue_delete_conn(
        &conn,
        "user_preset",
        &id.to_string(),
        serde_json::json!({ "local_id": id }),
    )?;
    conn.execute("DELETE FROM user_presets WHERE id = ?1", params![id])
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    info!(preset_id = id, "Deleted user preset");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mood_validation_accepts_the_five_moods_and_clears_on_empty() {
        assert_eq!(
            normalize_mood(Some("very_happy")).unwrap(),
            Some("very_happy".to_string())
        );
        assert_eq!(
            normalize_mood(Some("  Angry ")).unwrap(),
            Some("angry".to_string())
        );
        assert_eq!(normalize_mood(None).unwrap(), None);
        assert_eq!(normalize_mood(Some("")).unwrap(), None);
        assert_eq!(normalize_mood(Some("   ")).unwrap(), None);
        assert!(normalize_mood(Some("tilted")).is_err());
        assert_eq!(MATCH_MOODS.len(), 5);
    }

    #[test]
    fn local_date_buckets_use_local_time() {
        // Noon UTC is morning in the Americas and evening in Asia — either
        // way the helpers must parse and return a same-shaped answer.
        let ts = "2026-06-01T12:00:00+00:00";
        assert_eq!(local_date_string(ts).len(), 10);
        assert!(local_hour(ts).unwrap() <= 23);
        assert!(local_weekday(ts).unwrap() <= 6);
        assert_eq!(
            local_date_string("garbage"),
            Local::now().format("%Y-%m-%d").to_string()
        );
    }
}

#[cfg(test)]
mod mood_roundtrip_tests {
    use super::*;
    use chrono::TimeZone;

    fn temp_pool(tag: &str) -> DbPool {
        let dir = std::env::temp_dir().join(format!(
            "rl-stats-mood-test-{}-{}-{}",
            tag,
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        init_storage(dir.join("test.db")).expect("init storage")
    }

    fn insert_test_match(pool: &DbPool) -> i64 {
        let conn = get_conn(pool).unwrap();
        insert_match_conn(
            &conn,
            "mood-test-guid",
            chrono::Utc.with_ymd_and_hms(2026, 9, 6, 21, 0, 0).unwrap(),
            Some("DFH Stadium"),
            true,
            Some("ranked"),
            Some("Doubles"),
        )
        .unwrap()
    }

    #[test]
    fn migrations_reach_v22_with_mood_column() {
        let pool = temp_pool("version");
        let conn = get_conn(&pool).unwrap();
        conn.prepare("SELECT mood FROM matches LIMIT 0")
            .expect("matches.mood must exist after migrations");
        let version: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(version >= 22, "migrations must reach v22, got {version}");
    }

    #[test]
    fn mood_set_read_update_and_clear_roundtrip() {
        let pool = temp_pool("roundtrip");
        let match_id = insert_test_match(&pool);

        // Set every valid mood and read it back through both detail and list paths.
        for mood in MATCH_MOODS {
            set_match_mood(&pool, match_id, Some(mood)).unwrap();
            let (detail, _) = get_match_detail(&pool, match_id).unwrap();
            assert_eq!(detail.mood.as_deref(), Some(*mood));
            let listed = get_matches(
                &pool,
                MatchQuery {
                    limit: 10,
                    offset: 0,
                    arena: None,
                    match_type: None,
                    playlist: None,
                    result: None,
                    date_from: None,
                    date_to: None,
                    search: None,
                },
            )
            .unwrap();
            assert_eq!(listed.len(), 1);
            assert_eq!(listed[0].mood.as_deref(), Some(*mood));
        }

        // Clearing works and unknown values are rejected.
        set_match_mood(&pool, match_id, None).unwrap();
        let (detail, _) = get_match_detail(&pool, match_id).unwrap();
        assert_eq!(detail.mood, None);
        assert!(set_match_mood(&pool, match_id, Some("tilted")).is_err());
        assert!(set_match_mood(&pool, 999_999, Some("happy")).is_err());
    }
}
