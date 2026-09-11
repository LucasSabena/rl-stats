//! Applying remote sync changes to the local SQLite database.
//!
//! The cloud client (React) orchestrates auth and paging: it calls the
//! `sync_pull` RPC, then hands each page to [`apply_remote_changes`]. Applying
//! here — instead of in the frontend — keeps the transaction atomic and, more
//! importantly, never calls the `enqueue_*` helpers, so pulled rows are not
//! pushed straight back (no echo loop).
//!
//! Natural keys are the only cross-device identifiers: `matches.guid`,
//! `players.primary_id`, `(platform, username)` caches, preset names, training
//! pack ids. Local autoincrement ids in the payload are ignored.

use crate::core::settings::AppSettings;
use crate::error::{AppError, AppResult};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{debug, warn};

/// One change returned by the server's `sync_pull` RPC.
#[derive(Debug, Clone, Deserialize)]
pub struct RemoteChange {
    pub server_revision: i64,
    pub entity_type: String,
    pub entity_key: String,
    pub operation: String,
    #[serde(default)]
    pub payload_json: Value,
}

/// Result of applying a batch of remote changes.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ApplySummary {
    pub applied: u32,
    pub skipped: u32,
    pub max_revision: i64,
    /// True when a match or match player row landed, so daily rollups and
    /// derived analytics must be rebuilt.
    pub touched_matches: bool,
}

fn string_field(payload: &Value, key: &str) -> Option<String> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

fn i64_field(payload: &Value, key: &str) -> Option<i64> {
    payload.get(key).and_then(Value::as_i64)
}

fn f64_field(payload: &Value, key: &str) -> Option<f64> {
    payload.get(key).and_then(Value::as_f64)
}

fn bool_field(payload: &Value, key: &str) -> Option<bool> {
    payload.get(key).and_then(Value::as_bool)
}

/// Applies every change in order, returning what happened. Individual failures
/// are logged and skipped: one malformed remote row must not block the rest of
/// the pull.
pub fn apply_remote_changes(
    conn: &rusqlite::Connection,
    changes: &[RemoteChange],
) -> AppResult<ApplySummary> {
    let mut summary = ApplySummary::default();

    for change in changes {
        summary.max_revision = summary.max_revision.max(change.server_revision);
        match apply_one(conn, change) {
            Ok(true) => {
                summary.applied += 1;
                if matches!(change.entity_type.as_str(), "match" | "match_player") {
                    summary.touched_matches = true;
                }
            }
            Ok(false) => summary.skipped += 1,
            Err(e) => {
                warn!(
                    entity_type = %change.entity_type,
                    entity_key = %change.entity_key,
                    error = %e,
                    "Skipping remote change that could not be applied"
                );
                summary.skipped += 1;
            }
        }
    }

    Ok(summary)
}

fn apply_one(conn: &rusqlite::Connection, change: &RemoteChange) -> AppResult<bool> {
    let is_delete = change.operation == "delete";
    match change.entity_type.as_str() {
        "match" => apply_match(conn, change, is_delete),
        "player" => apply_player(conn, change, is_delete),
        "match_player" => apply_match_player(conn, change, is_delete),
        "session" => apply_session(conn, change, is_delete),
        "match_event" => apply_match_event(conn, change, is_delete),
        "tracker_cache" => apply_profile_cache(conn, change, is_delete, "tracker_cache"),
        "rlstats_cache" => apply_profile_cache(conn, change, is_delete, "rlstats_cache"),
        "friend" => apply_friend(conn, change, is_delete),
        "user_preset" => apply_user_preset(conn, change, is_delete),
        "training_pack" => apply_training_pack(conn, change, is_delete),
        "app_settings" => apply_settings(conn, change),
        // Device identity and cloud-profile bookkeeping stay local.
        "profile" | "profiles_manifest" => Ok(false),
        other => {
            debug!(entity_type = other, "Ignoring unknown remote entity type");
            Ok(false)
        }
    }
}

fn apply_match(
    conn: &rusqlite::Connection,
    change: &RemoteChange,
    is_delete: bool,
) -> AppResult<bool> {
    let p = &change.payload_json;
    let Some(guid) = string_field(p, "guid").or_else(|| Some(change.entity_key.clone())) else {
        return Ok(false);
    };

    if is_delete {
        let removed = conn
            .execute("DELETE FROM matches WHERE guid = ?1", params![guid])
            .map_err(|e| AppError::StorageError(e.to_string()))?;
        return Ok(removed > 0);
    }

    let start_time =
        string_field(p, "start_time").unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    conn.execute(
        "INSERT INTO matches (
            guid, start_time, end_time, arena, score_blue, score_orange, winner,
            is_online, is_overtime, duration_seconds, match_type, playlist, mood
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT(guid) DO UPDATE SET
            start_time = excluded.start_time,
            end_time = COALESCE(excluded.end_time, matches.end_time),
            arena = COALESCE(excluded.arena, matches.arena),
            score_blue = excluded.score_blue,
            score_orange = excluded.score_orange,
            winner = COALESCE(excluded.winner, matches.winner),
            is_online = excluded.is_online,
            is_overtime = excluded.is_overtime,
            duration_seconds = excluded.duration_seconds,
            match_type = COALESCE(excluded.match_type, matches.match_type),
            playlist = COALESCE(excluded.playlist, matches.playlist),
            mood = COALESCE(excluded.mood, matches.mood)",
        params![
            guid,
            start_time,
            string_field(p, "end_time"),
            string_field(p, "arena"),
            i64_field(p, "score_blue").unwrap_or(0),
            i64_field(p, "score_orange").unwrap_or(0),
            i64_field(p, "winner"),
            bool_field(p, "is_online").unwrap_or(false) as i32,
            bool_field(p, "is_overtime").unwrap_or(false) as i32,
            i64_field(p, "duration_seconds").unwrap_or(0),
            string_field(p, "match_type"),
            string_field(p, "playlist"),
            string_field(p, "mood"),
        ],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(true)
}

fn apply_player(
    conn: &rusqlite::Connection,
    change: &RemoteChange,
    is_delete: bool,
) -> AppResult<bool> {
    let primary_id = string_field(&change.payload_json, "primary_id")
        .unwrap_or_else(|| change.entity_key.clone());
    if primary_id.is_empty() {
        return Ok(false);
    }

    if is_delete {
        let removed = conn
            .execute(
                "DELETE FROM players WHERE primary_id = ?1",
                params![primary_id],
            )
            .map_err(|e| AppError::StorageError(e.to_string()))?;
        return Ok(removed > 0);
    }

    let name = string_field(&change.payload_json, "name").unwrap_or_default();
    conn.execute(
        "INSERT INTO players (primary_id, name) VALUES (?1, ?2)
         ON CONFLICT(primary_id) DO UPDATE SET
            name = COALESCE(NULLIF(excluded.name, ''), players.name)",
        params![primary_id, name],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(true)
}

fn match_id_by_guid(conn: &rusqlite::Connection, guid: &str) -> AppResult<Option<i64>> {
    conn.query_row(
        "SELECT id FROM matches WHERE guid = ?1",
        params![guid],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| AppError::StorageError(e.to_string()))
}

fn player_id_by_primary(conn: &rusqlite::Connection, primary_id: &str) -> AppResult<Option<i64>> {
    conn.query_row(
        "SELECT id FROM players WHERE primary_id = ?1",
        params![primary_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| AppError::StorageError(e.to_string()))
}

fn apply_match_player(
    conn: &rusqlite::Connection,
    change: &RemoteChange,
    is_delete: bool,
) -> AppResult<bool> {
    let p = &change.payload_json;
    let Some(guid) = string_field(p, "match_guid") else {
        return Ok(false);
    };
    let Some(primary_id) = string_field(p, "player_primary_id") else {
        return Ok(false);
    };
    let Some(match_id) = match_id_by_guid(conn, &guid)? else {
        return Ok(false);
    };
    // The player row is pushed as its own entity; if it has not landed yet,
    // skip rather than violate the foreign key. A later pull will retry.
    let Some(player_id) = player_id_by_primary(conn, &primary_id)? else {
        return Ok(false);
    };

    if is_delete {
        let removed = conn
            .execute(
                "DELETE FROM match_players WHERE match_id = ?1 AND player_id = ?2",
                params![match_id, player_id],
            )
            .map_err(|e| AppError::StorageError(e.to_string()))?;
        return Ok(removed > 0);
    }

    conn.execute(
        "INSERT INTO match_players (
            match_id, player_id, team_num, score, goals, shots, assists, saves,
            touches, car_touches, demos, speed, boost, mmr, head_to_head_json, kickoff_goals
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
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
            mmr = COALESCE(excluded.mmr, match_players.mmr),
            head_to_head_json = COALESCE(excluded.head_to_head_json, match_players.head_to_head_json),
            kickoff_goals = excluded.kickoff_goals",
        params![
            match_id,
            player_id,
            i64_field(p, "team_num").unwrap_or(0),
            i64_field(p, "score").unwrap_or(0),
            i64_field(p, "goals").unwrap_or(0),
            i64_field(p, "shots").unwrap_or(0),
            i64_field(p, "assists").unwrap_or(0),
            i64_field(p, "saves").unwrap_or(0),
            i64_field(p, "touches").unwrap_or(0),
            i64_field(p, "car_touches").unwrap_or(0),
            i64_field(p, "demos").unwrap_or(0),
            f64_field(p, "speed").unwrap_or(0.0),
            i64_field(p, "boost").unwrap_or(0),
            i64_field(p, "mmr"),
            string_field(p, "head_to_head_json"),
            i64_field(p, "kickoff_goals").unwrap_or(0),
        ],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(true)
}

fn apply_session(
    conn: &rusqlite::Connection,
    change: &RemoteChange,
    is_delete: bool,
) -> AppResult<bool> {
    let p = &change.payload_json;
    let Some(guid) = string_field(p, "match_guid") else {
        return Ok(false);
    };
    let Some(match_id) = match_id_by_guid(conn, &guid)? else {
        return Ok(false);
    };

    if is_delete {
        let removed = conn
            .execute(
                "DELETE FROM sessions WHERE match_id = ?1",
                params![match_id],
            )
            .map_err(|e| AppError::StorageError(e.to_string()))?;
        return Ok(removed > 0);
    }

    let summary_json = string_field(p, "summary_json").unwrap_or_else(|| "{}".to_string());
    let created_at =
        string_field(p, "created_at").unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM sessions WHERE match_id = ?1",
            params![match_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    match existing {
        Some(id) => {
            conn.execute(
                "UPDATE sessions SET summary_json = ?1 WHERE id = ?2",
                params![summary_json, id],
            )
            .map_err(|e| AppError::StorageError(e.to_string()))?;
        }
        None => {
            conn.execute(
                "INSERT INTO sessions (match_id, summary_json, created_at) VALUES (?1, ?2, ?3)",
                params![match_id, summary_json, created_at],
            )
            .map_err(|e| AppError::StorageError(e.to_string()))?;
        }
    }
    Ok(true)
}

fn apply_match_event(
    conn: &rusqlite::Connection,
    change: &RemoteChange,
    is_delete: bool,
) -> AppResult<bool> {
    if is_delete {
        return Ok(false);
    }
    let p = &change.payload_json;
    let Some(guid) = string_field(p, "match_guid") else {
        return Ok(false);
    };
    let Some(match_id) = match_id_by_guid(conn, &guid)? else {
        return Ok(false);
    };
    let event_type = string_field(p, "event_type").unwrap_or_default();
    let occurred_at =
        string_field(p, "occurred_at").unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let event_data = string_field(p, "event_data").unwrap_or_else(|| "{}".to_string());

    // Events have no unique key; dedupe on the natural triple.
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM match_events
             WHERE match_id = ?1 AND event_type = ?2 AND occurred_at = ?3
             LIMIT 1",
            params![match_id, event_type, occurred_at],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    if exists.is_some() {
        return Ok(false);
    }

    conn.execute(
        "INSERT INTO match_events (match_id, event_type, event_data, occurred_at) VALUES (?1, ?2, ?3, ?4)",
        params![match_id, event_type, event_data, occurred_at],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(true)
}

fn apply_profile_cache(
    conn: &rusqlite::Connection,
    change: &RemoteChange,
    is_delete: bool,
    table: &str,
) -> AppResult<bool> {
    let p = &change.payload_json;
    let platform = string_field(p, "platform").unwrap_or_else(|| {
        change
            .entity_key
            .split_once(':')
            .map(|(p, _)| p.to_string())
            .unwrap_or_default()
    });
    let username = string_field(p, "username").unwrap_or_else(|| {
        change
            .entity_key
            .split_once(':')
            .map(|(_, u)| u.to_string())
            .unwrap_or_default()
    });
    if platform.is_empty() || username.is_empty() {
        return Ok(false);
    }

    if is_delete {
        let sql = format!("DELETE FROM {table} WHERE platform = ?1 AND username = ?2");
        let removed = conn
            .execute(&sql, params![platform, username])
            .map_err(|e| AppError::StorageError(e.to_string()))?;
        return Ok(removed > 0);
    }

    let profile_json = string_field(p, "profile_json").unwrap_or_else(|| "{}".to_string());
    let fetched_at =
        string_field(p, "fetched_at").unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let sql = format!(
        "INSERT INTO {table} (platform, username, profile_json, fetched_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(platform, username) DO UPDATE SET
            profile_json = excluded.profile_json,
            fetched_at = excluded.fetched_at"
    );
    conn.execute(&sql, params![platform, username, profile_json, fetched_at])
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(true)
}

fn apply_friend(
    conn: &rusqlite::Connection,
    change: &RemoteChange,
    is_delete: bool,
) -> AppResult<bool> {
    let p = &change.payload_json;
    let Some(primary_id) = string_field(p, "player_primary_id") else {
        return Ok(false);
    };

    if is_delete {
        let Some(player_id) = player_id_by_primary(conn, &primary_id)? else {
            return Ok(false);
        };
        let removed = conn
            .execute(
                "DELETE FROM friends WHERE player_id = ?1",
                params![player_id],
            )
            .map_err(|e| AppError::StorageError(e.to_string()))?;
        return Ok(removed > 0);
    }

    let name = string_field(p, "player_name").unwrap_or_default();
    conn.execute(
        "INSERT INTO players (primary_id, name) VALUES (?1, ?2)
         ON CONFLICT(primary_id) DO UPDATE SET
            name = COALESCE(NULLIF(excluded.name, ''), players.name)",
        params![primary_id, name],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    let player_id = player_id_by_primary(conn, &primary_id)?
        .ok_or_else(|| AppError::StorageError("friend player row missing".into()))?;

    let tag = string_field(p, "tag");
    let created_at =
        string_field(p, "created_at").unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    conn.execute(
        "INSERT INTO friends (player_id, tag, created_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(player_id) DO UPDATE SET tag = excluded.tag",
        params![player_id, tag, created_at],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(true)
}

fn apply_user_preset(
    conn: &rusqlite::Connection,
    change: &RemoteChange,
    is_delete: bool,
) -> AppResult<bool> {
    let p = &change.payload_json;
    let Some(name) = string_field(p, "name") else {
        return Ok(false);
    };

    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM user_presets WHERE name = ?1 LIMIT 1",
            params![name],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    if is_delete {
        if let Some(id) = existing {
            conn.execute("DELETE FROM user_presets WHERE id = ?1", params![id])
                .map_err(|e| AppError::StorageError(e.to_string()))?;
            return Ok(true);
        }
        return Ok(false);
    }

    let now = chrono::Utc::now().to_rfc3339();
    let created_at = string_field(p, "created_at").unwrap_or_else(|| now.clone());
    let updated_at = string_field(p, "updated_at").unwrap_or(now);
    match existing {
        Some(id) => {
            conn.execute(
                "UPDATE user_presets SET description = ?1, camera_json = ?2, controls_json = ?3,
                    deadzone_json = ?4, hardware_json = ?5, updated_at = ?6
                 WHERE id = ?7",
                params![
                    string_field(p, "description"),
                    string_field(p, "camera_json"),
                    string_field(p, "controls_json"),
                    string_field(p, "deadzone_json"),
                    string_field(p, "hardware_json"),
                    updated_at,
                    id
                ],
            )
            .map_err(|e| AppError::StorageError(e.to_string()))?;
        }
        None => {
            conn.execute(
                "INSERT INTO user_presets (name, description, camera_json, controls_json, deadzone_json, hardware_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    name,
                    string_field(p, "description"),
                    string_field(p, "camera_json"),
                    string_field(p, "controls_json"),
                    string_field(p, "deadzone_json"),
                    string_field(p, "hardware_json"),
                    created_at,
                    updated_at
                ],
            )
            .map_err(|e| AppError::StorageError(e.to_string()))?;
        }
    }
    Ok(true)
}

fn apply_training_pack(
    conn: &rusqlite::Connection,
    change: &RemoteChange,
    is_delete: bool,
) -> AppResult<bool> {
    let p = &change.payload_json;
    let id = string_field(p, "id").unwrap_or_else(|| change.entity_key.clone());
    if id.is_empty() {
        return Ok(false);
    }
    if is_delete {
        let removed = conn
            .execute("DELETE FROM training_packs WHERE id = ?1", params![id])
            .map_err(|e| AppError::StorageError(e.to_string()))?;
        return Ok(removed > 0);
    }

    let tags_json = p
        .get("tags")
        .map(|tags| serde_json::to_string(tags).unwrap_or_else(|_| "[]".into()))
        .unwrap_or_else(|| "[]".to_string());
    conn.execute(
        "INSERT INTO training_packs (id, name, code, creator, category, difficulty, description, tags_json, source_url, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            code = excluded.code,
            creator = excluded.creator,
            category = excluded.category,
            difficulty = excluded.difficulty,
            description = excluded.description,
            tags_json = excluded.tags_json,
            source_url = excluded.source_url,
            updated_at = excluded.updated_at",
        params![
            id,
            string_field(p, "name").unwrap_or_default(),
            string_field(p, "code").unwrap_or_default(),
            string_field(p, "creator").unwrap_or_default(),
            string_field(p, "category").unwrap_or_default(),
            string_field(p, "difficulty").unwrap_or_default(),
            string_field(p, "description").unwrap_or_default(),
            tags_json,
            string_field(p, "source_url"),
            i64_field(p, "created_at").unwrap_or_else(|| chrono::Utc::now().timestamp()),
            i64_field(p, "updated_at").unwrap_or_else(|| chrono::Utc::now().timestamp()),
        ],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(true)
}

/// Settings are last-write-wins for every non-secret, non-device-local field
/// (that merge lives in [`crate::core::settings::AppSettings::merge_remote`]).
fn apply_settings(conn: &rusqlite::Connection, change: &RemoteChange) -> AppResult<bool> {
    let Ok(remote) = serde_json::from_value::<AppSettings>(change.payload_json.clone()) else {
        return Ok(false);
    };
    crate::core::settings::set_settings_conn_no_sync(conn, &remote)?;
    Ok(true)
}
