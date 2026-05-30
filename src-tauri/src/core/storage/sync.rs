use crate::error::{AppError, AppResult};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{get_conn, DbPool};

pub const SYNC_PROTOCOL_VERSION: &str = "1";
const DEVICE_ID_KEY: &str = "sync.device_id";
const PROTOCOL_VERSION_KEY: &str = "sync.protocol_version";
const LAST_PULLED_REVISION_KEY: &str = "sync.last_pulled_revision";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncOperation {
    Upsert,
    Delete,
}

impl SyncOperation {
    fn as_str(self) -> &'static str {
        match self {
            SyncOperation::Upsert => "upsert",
            SyncOperation::Delete => "delete",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PendingSyncChange {
    pub id: i64,
    pub entity_type: String,
    pub entity_key: String,
    pub operation: SyncOperation,
    pub payload_json: String,
    pub idempotency_key: String,
    pub created_at: String,
    pub attempts: i32,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HydratedSyncChange {
    pub id: i64,
    pub entity_type: String,
    pub entity_key: String,
    pub operation: SyncOperation,
    pub payload_json: serde_json::Value,
    pub idempotency_key: String,
    pub created_at: String,
    pub attempts: i32,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SyncStatus {
    pub device_id: String,
    pub protocol_version: String,
    pub pending_changes: i64,
    pub failed_changes: i64,
    pub last_pulled_revision: i64,
}

pub fn ensure_local_sync_identity(pool: &DbPool) -> AppResult<String> {
    let conn = get_conn(pool)?;
    ensure_local_sync_identity_conn(&conn)
}

pub(crate) fn ensure_local_sync_identity_conn(conn: &rusqlite::Connection) -> AppResult<String> {
    let existing: Option<String> = get_metadata_conn(conn, DEVICE_ID_KEY)?;
    let device_id = match existing {
        Some(value) if !value.trim().is_empty() => value,
        _ => {
            let value = Uuid::new_v4().to_string();
            set_metadata_conn(conn, DEVICE_ID_KEY, &value)?;
            value
        }
    };

    set_metadata_conn(conn, PROTOCOL_VERSION_KEY, SYNC_PROTOCOL_VERSION)?;
    if get_metadata_conn(conn, LAST_PULLED_REVISION_KEY)?.is_none() {
        set_metadata_conn(conn, LAST_PULLED_REVISION_KEY, "0")?;
    }

    Ok(device_id)
}

pub fn get_sync_status(pool: &DbPool) -> AppResult<SyncStatus> {
    let conn = get_conn(pool)?;
    let device_id = ensure_local_sync_identity_conn(&conn)?;
    let pending_changes: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let failed_changes: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL AND last_error IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let last_pulled_revision = get_metadata_conn(&conn, LAST_PULLED_REVISION_KEY)?
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);

    Ok(SyncStatus {
        device_id,
        protocol_version: SYNC_PROTOCOL_VERSION.to_string(),
        pending_changes,
        failed_changes,
        last_pulled_revision,
    })
}

pub fn get_pending_changes(pool: &DbPool, limit: i64) -> AppResult<Vec<PendingSyncChange>> {
    let conn = get_conn(pool)?;
    let mut stmt = conn.prepare(
        "SELECT id, entity_type, entity_key, operation, payload_json, idempotency_key, created_at, attempts, last_error
         FROM sync_outbox
         WHERE synced_at IS NULL AND available_at <= ?1
         ORDER BY id ASC
         LIMIT ?2",
    )?;

    let now = Utc::now().to_rfc3339();
    let rows = stmt.query_map(params![now, limit], |row| {
        let operation = match row.get::<_, String>(3)?.as_str() {
            "delete" => SyncOperation::Delete,
            _ => SyncOperation::Upsert,
        };

        Ok(PendingSyncChange {
            id: row.get(0)?,
            entity_type: row.get(1)?,
            entity_key: row.get(2)?,
            operation,
            payload_json: row.get(4)?,
            idempotency_key: row.get(5)?,
            created_at: row.get(6)?,
            attempts: row.get(7)?,
            last_error: row.get(8)?,
        })
    })?;

    let mut changes = Vec::new();
    for row in rows {
        changes.push(row.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(changes)
}

pub fn get_pending_hydrated_changes(
    pool: &DbPool,
    limit: i64,
) -> AppResult<Vec<HydratedSyncChange>> {
    let conn = get_conn(pool)?;
    let pending = get_pending_changes_conn(&conn, limit)?;
    let mut result = Vec::with_capacity(pending.len());

    for change in pending {
        let fallback_payload = parse_payload_or_empty(&change.payload_json);
        let payload_json = if change.operation == SyncOperation::Delete {
            fallback_payload
        } else {
            hydrate_change_payload_conn(&conn, &change).unwrap_or(fallback_payload)
        };

        result.push(HydratedSyncChange {
            id: change.id,
            entity_type: change.entity_type,
            entity_key: change.entity_key,
            operation: change.operation,
            payload_json,
            idempotency_key: change.idempotency_key,
            created_at: change.created_at,
            attempts: change.attempts,
            last_error: change.last_error,
        });
    }

    Ok(result)
}

fn get_pending_changes_conn(
    conn: &rusqlite::Connection,
    limit: i64,
) -> AppResult<Vec<PendingSyncChange>> {
    let mut stmt = conn.prepare(
        "SELECT id, entity_type, entity_key, operation, payload_json, idempotency_key, created_at, attempts, last_error
         FROM sync_outbox
         WHERE synced_at IS NULL AND available_at <= ?1
         ORDER BY id ASC
         LIMIT ?2",
    )?;

    let now = Utc::now().to_rfc3339();
    let rows = stmt.query_map(params![now, limit], |row| {
        let operation = match row.get::<_, String>(3)?.as_str() {
            "delete" => SyncOperation::Delete,
            _ => SyncOperation::Upsert,
        };

        Ok(PendingSyncChange {
            id: row.get(0)?,
            entity_type: row.get(1)?,
            entity_key: row.get(2)?,
            operation,
            payload_json: row.get(4)?,
            idempotency_key: row.get(5)?,
            created_at: row.get(6)?,
            attempts: row.get(7)?,
            last_error: row.get(8)?,
        })
    })?;

    let mut changes = Vec::new();
    for row in rows {
        changes.push(row.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(changes)
}

fn parse_payload_or_empty(payload_json: &str) -> serde_json::Value {
    serde_json::from_str(payload_json).unwrap_or_else(|_| serde_json::json!({}))
}

fn hydrate_change_payload_conn(
    conn: &rusqlite::Connection,
    change: &PendingSyncChange,
) -> Option<serde_json::Value> {
    match change.entity_type.as_str() {
        "match" => hydrate_match(conn, &change.entity_key),
        "player" => hydrate_player(conn, &change.entity_key),
        "match_player" => hydrate_match_player(conn, &change.entity_key),
        "match_event" => hydrate_match_event(conn, &change.entity_key),
        "session" => hydrate_session(conn, &change.entity_key),
        "tracker_cache" => hydrate_profile_cache(conn, &change.entity_key, "tracker_cache"),
        "rlstats_cache" => hydrate_profile_cache(conn, &change.entity_key, "rlstats_cache"),
        "friend" => hydrate_friend(conn, &change.entity_key),
        "user_preset" => hydrate_user_preset(conn, &change.entity_key),
        _ => Some(parse_payload_or_empty(&change.payload_json)),
    }
}

fn hydrate_match(conn: &rusqlite::Connection, guid: &str) -> Option<serde_json::Value> {
    conn.query_row(
        "SELECT id, guid, start_time, end_time, arena, score_blue, score_orange, winner,
                is_online, is_overtime, duration_seconds, match_type, playlist
         FROM matches
         WHERE guid = ?1",
        params![guid],
        |row| {
            let local_id = row.get::<_, i64>(0)?;
            let guid = row.get::<_, String>(1)?;
            let start_time = row.get::<_, String>(2)?;
            let end_time = row.get::<_, Option<String>>(3)?;
            let arena = row.get::<_, Option<String>>(4)?;
            let score_blue = row.get::<_, i32>(5)?;
            let score_orange = row.get::<_, i32>(6)?;
            let winner = row.get::<_, Option<i32>>(7)?;
            let is_online = row.get::<_, i32>(8)? != 0;
            let is_overtime = row.get::<_, i32>(9)? != 0;
            let duration_seconds = row.get::<_, i32>(10)?;
            let match_type = row.get::<_, Option<String>>(11)?;
            let playlist = row.get::<_, Option<String>>(12)?;

            Ok(serde_json::json!({
                "local_id": local_id,
                "guid": guid,
                "start_time": start_time,
                "end_time": end_time,
                "arena": arena,
                "score_blue": score_blue,
                "score_orange": score_orange,
                "winner": winner,
                "is_online": is_online,
                "is_overtime": is_overtime,
                "duration_seconds": duration_seconds,
                "match_type": match_type,
                "playlist": playlist,
            }))
        },
    )
    .optional()
    .ok()
    .flatten()
}

fn hydrate_player(conn: &rusqlite::Connection, primary_id: &str) -> Option<serde_json::Value> {
    conn.query_row(
        "SELECT id, primary_id, name FROM players WHERE primary_id = ?1",
        params![primary_id],
        |row| {
            let local_id = row.get::<_, i64>(0)?;
            let primary_id = row.get::<_, String>(1)?;
            let name = row.get::<_, String>(2)?;

            Ok(serde_json::json!({
                "local_id": local_id,
                "primary_id": primary_id,
                "name": name,
            }))
        },
    )
    .optional()
    .ok()
    .flatten()
}

fn hydrate_match_player(
    conn: &rusqlite::Connection,
    entity_key: &str,
) -> Option<serde_json::Value> {
    let (match_guid, player_primary_id) = entity_key.split_once(':')?;
    conn.query_row(
        "SELECT mp.id, m.guid, p.primary_id, mp.team_num, mp.score, mp.goals, mp.shots,
                mp.assists, mp.saves, mp.touches, mp.car_touches, mp.demos, mp.speed, mp.boost,
                mp.mmr, mp.head_to_head_json, mp.kickoff_goals
         FROM match_players mp
         JOIN matches m ON m.id = mp.match_id
         JOIN players p ON p.id = mp.player_id
         WHERE m.guid = ?1 AND p.primary_id = ?2",
        params![match_guid, player_primary_id],
        |row| {
            let local_id = row.get::<_, i64>(0)?;
            let match_guid = row.get::<_, String>(1)?;
            let player_primary_id = row.get::<_, String>(2)?;
            let team_num = row.get::<_, i32>(3)?;
            let score = row.get::<_, i32>(4)?;
            let goals = row.get::<_, i32>(5)?;
            let shots = row.get::<_, i32>(6)?;
            let assists = row.get::<_, i32>(7)?;
            let saves = row.get::<_, i32>(8)?;
            let touches = row.get::<_, i32>(9)?;
            let car_touches = row.get::<_, i32>(10)?;
            let demos = row.get::<_, i32>(11)?;
            let speed = row.get::<_, f64>(12)?;
            let boost = row.get::<_, i32>(13)?;
            let mmr = row.get::<_, Option<i32>>(14)?;
            let head_to_head_json = row.get::<_, Option<String>>(15)?;
            let kickoff_goals = row.get::<_, i32>(16)?;

            Ok(serde_json::json!({
                "local_id": local_id,
                "match_guid": match_guid,
                "player_primary_id": player_primary_id,
                "team_num": team_num,
                "score": score,
                "goals": goals,
                "shots": shots,
                "assists": assists,
                "saves": saves,
                "touches": touches,
                "car_touches": car_touches,
                "demos": demos,
                "speed": speed,
                "boost": boost,
                "mmr": mmr,
                "head_to_head_json": head_to_head_json,
                "kickoff_goals": kickoff_goals,
            }))
        },
    )
    .optional()
    .ok()
    .flatten()
}

fn hydrate_match_event(conn: &rusqlite::Connection, entity_key: &str) -> Option<serde_json::Value> {
    let id = entity_key.parse::<i64>().ok()?;
    conn.query_row(
        "SELECT me.id, me.match_id, m.guid, me.event_type, me.event_data, me.occurred_at
         FROM match_events me
         JOIN matches m ON m.id = me.match_id
         WHERE me.id = ?1",
        params![id],
        |row| {
            let local_id = row.get::<_, i64>(0)?;
            let match_id = row.get::<_, i64>(1)?;
            let match_guid = row.get::<_, String>(2)?;
            let event_type = row.get::<_, String>(3)?;
            let event_data = row.get::<_, String>(4)?;
            let occurred_at = row.get::<_, String>(5)?;

            Ok(serde_json::json!({
                "local_id": local_id,
                "match_id": match_id,
                "match_guid": match_guid,
                "event_type": event_type,
                "event_data": event_data,
                "occurred_at": occurred_at,
            }))
        },
    )
    .optional()
    .ok()
    .flatten()
}

fn hydrate_session(conn: &rusqlite::Connection, entity_key: &str) -> Option<serde_json::Value> {
    let id = entity_key.parse::<i64>().ok()?;
    conn.query_row(
        "SELECT s.id, s.match_id, m.guid, s.summary_json, s.created_at
         FROM sessions s
         JOIN matches m ON m.id = s.match_id
         WHERE s.id = ?1",
        params![id],
        |row| {
            let local_id = row.get::<_, i64>(0)?;
            let match_id = row.get::<_, i64>(1)?;
            let match_guid = row.get::<_, String>(2)?;
            let summary_json = row.get::<_, String>(3)?;
            let created_at = row.get::<_, String>(4)?;

            Ok(serde_json::json!({
                "local_id": local_id,
                "match_id": match_id,
                "match_guid": match_guid,
                "summary_json": summary_json,
                "created_at": created_at,
            }))
        },
    )
    .optional()
    .ok()
    .flatten()
}

fn hydrate_profile_cache(
    conn: &rusqlite::Connection,
    entity_key: &str,
    table: &str,
) -> Option<serde_json::Value> {
    let (platform, username) = entity_key.split_once(':')?;
    let sql = format!(
        "SELECT platform, username, profile_json, fetched_at FROM {} WHERE platform = ?1 AND username = ?2",
        table
    );
    conn.query_row(&sql, params![platform, username], |row| {
        let platform = row.get::<_, String>(0)?;
        let username = row.get::<_, String>(1)?;
        let profile_json = row.get::<_, String>(2)?;
        let fetched_at = row.get::<_, String>(3)?;

        Ok(serde_json::json!({
            "platform": platform,
            "username": username,
            "profile_json": profile_json,
            "fetched_at": fetched_at,
        }))
    })
    .optional()
    .ok()
    .flatten()
}

fn hydrate_friend(conn: &rusqlite::Connection, entity_key: &str) -> Option<serde_json::Value> {
    let player_id = entity_key.parse::<i64>().ok()?;
    conn.query_row(
        "SELECT f.id, f.player_id, p.primary_id, p.name, f.tag, f.created_at
         FROM friends f
         JOIN players p ON p.id = f.player_id
         WHERE f.player_id = ?1",
        params![player_id],
        |row| {
            let local_id = row.get::<_, i64>(0)?;
            let player_id = row.get::<_, i64>(1)?;
            let player_primary_id = row.get::<_, String>(2)?;
            let player_name = row.get::<_, String>(3)?;
            let tag = row.get::<_, Option<String>>(4)?;
            let created_at = row.get::<_, String>(5)?;

            Ok(serde_json::json!({
                "local_id": local_id,
                "player_id": player_id,
                "player_primary_id": player_primary_id,
                "player_name": player_name,
                "tag": tag,
                "created_at": created_at,
            }))
        },
    )
    .optional()
    .ok()
    .flatten()
}

fn hydrate_user_preset(conn: &rusqlite::Connection, entity_key: &str) -> Option<serde_json::Value> {
    let id = entity_key.parse::<i64>().ok()?;
    conn.query_row(
        "SELECT id, name, description, camera_json, controls_json, deadzone_json, hardware_json,
                created_at, updated_at
         FROM user_presets
         WHERE id = ?1",
        params![id],
        |row| {
            let local_id = row.get::<_, i64>(0)?;
            let name = row.get::<_, String>(1)?;
            let description = row.get::<_, Option<String>>(2)?;
            let camera_json = row.get::<_, Option<String>>(3)?;
            let controls_json = row.get::<_, Option<String>>(4)?;
            let deadzone_json = row.get::<_, Option<String>>(5)?;
            let hardware_json = row.get::<_, Option<String>>(6)?;
            let created_at = row.get::<_, String>(7)?;
            let updated_at = row.get::<_, String>(8)?;

            Ok(serde_json::json!({
                "local_id": local_id,
                "name": name,
                "description": description,
                "camera_json": camera_json,
                "controls_json": controls_json,
                "deadzone_json": deadzone_json,
                "hardware_json": hardware_json,
                "created_at": created_at,
                "updated_at": updated_at,
            }))
        },
    )
    .optional()
    .ok()
    .flatten()
}

pub(crate) fn enqueue_upsert_conn(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_key: &str,
    payload: serde_json::Value,
) -> AppResult<i64> {
    enqueue_change_conn(
        conn,
        entity_type,
        entity_key,
        SyncOperation::Upsert,
        payload,
    )
}

pub(crate) fn enqueue_delete_conn(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_key: &str,
    payload: serde_json::Value,
) -> AppResult<i64> {
    let outbox_id = enqueue_change_conn(
        conn,
        entity_type,
        entity_key,
        SyncOperation::Delete,
        payload.clone(),
    )?;
    record_tombstone_conn(conn, entity_type, entity_key, payload, Some(outbox_id))?;
    Ok(outbox_id)
}

pub fn enqueue_change(
    pool: &DbPool,
    entity_type: &str,
    entity_key: &str,
    operation: SyncOperation,
    payload: serde_json::Value,
) -> AppResult<i64> {
    let conn = get_conn(pool)?;
    enqueue_change_conn(&conn, entity_type, entity_key, operation, payload)
}

pub(crate) fn enqueue_change_conn(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_key: &str,
    operation: SyncOperation,
    payload: serde_json::Value,
) -> AppResult<i64> {
    let device_id = ensure_local_sync_identity_conn(conn)?;
    let now = Utc::now().to_rfc3339();
    let idempotency_key = format!(
        "{}:{}:{}:{}:{}",
        device_id,
        entity_type,
        entity_key,
        operation.as_str(),
        Uuid::new_v4()
    );
    let payload_json = serde_json::to_string(&payload)
        .map_err(|e| AppError::ParseError(format!("Failed to serialize sync payload: {e}")))?;

    let outbox_id = if operation == SyncOperation::Upsert {
        let existing_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM sync_outbox
                 WHERE entity_type = ?1 AND entity_key = ?2 AND operation = 'upsert' AND synced_at IS NULL
                 ORDER BY id DESC
                 LIMIT 1",
                params![entity_type, entity_key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| AppError::StorageError(e.to_string()))?;

        if let Some(existing_id) = existing_id {
            conn.execute(
                "UPDATE sync_outbox
                 SET payload_json = ?1, available_at = ?2, last_error = NULL
                 WHERE id = ?3",
                params![payload_json, now, existing_id],
            )
            .map_err(|e| AppError::StorageError(e.to_string()))?;
            existing_id
        } else {
            insert_outbox_change(
                conn,
                entity_type,
                entity_key,
                operation,
                &payload_json,
                &idempotency_key,
                &now,
            )?
        }
    } else {
        insert_outbox_change(
            conn,
            entity_type,
            entity_key,
            operation,
            &payload_json,
            &idempotency_key,
            &now,
        )?
    };

    conn.execute(
        "INSERT INTO sync_entity_state (entity_type, entity_key, dirty, updated_at)
         VALUES (?1, ?2, 1, ?3)
         ON CONFLICT(entity_type, entity_key) DO UPDATE SET
            dirty = 1,
            updated_at = excluded.updated_at",
        params![entity_type, entity_key, now],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;

    Ok(outbox_id)
}

fn insert_outbox_change(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_key: &str,
    operation: SyncOperation,
    payload_json: &str,
    idempotency_key: &str,
    now: &str,
) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO sync_outbox (entity_type, entity_key, operation, payload_json, idempotency_key, created_at, available_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            entity_type,
            entity_key,
            operation.as_str(),
            payload_json,
            idempotency_key,
            now,
            now,
        ],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;

    Ok(conn.last_insert_rowid())
}

pub(crate) fn record_tombstone_conn(
    conn: &rusqlite::Connection,
    entity_type: &str,
    entity_key: &str,
    payload: serde_json::Value,
    source_outbox_id: Option<i64>,
) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    let payload_json = serde_json::to_string(&payload)
        .map_err(|e| AppError::ParseError(format!("Failed to serialize tombstone payload: {e}")))?;

    conn.execute(
        "INSERT INTO sync_tombstones (entity_type, entity_key, deleted_at, payload_json, source_outbox_id)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(entity_type, entity_key) DO UPDATE SET
            deleted_at = excluded.deleted_at,
            payload_json = excluded.payload_json,
            source_outbox_id = excluded.source_outbox_id",
        params![entity_type, entity_key, now, payload_json, source_outbox_id],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;

    Ok(())
}

pub fn mark_change_synced(pool: &DbPool, outbox_id: i64, server_revision: i64) -> AppResult<()> {
    let conn = get_conn(pool)?;
    let now = Utc::now().to_rfc3339();

    let entity: Option<(String, String)> = conn
        .query_row(
            "SELECT entity_type, entity_key FROM sync_outbox WHERE id = ?1",
            params![outbox_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    conn.execute(
        "UPDATE sync_outbox SET synced_at = ?1, last_error = NULL WHERE id = ?2",
        params![now, outbox_id],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;

    if let Some((entity_type, entity_key)) = entity {
        conn.execute(
            "UPDATE sync_entity_state
             SET dirty = 0, server_revision = MAX(server_revision, ?1), last_pushed_at = ?2, updated_at = ?2
             WHERE entity_type = ?3 AND entity_key = ?4",
            params![server_revision, now, entity_type, entity_key],
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    }

    Ok(())
}

pub fn mark_change_failed(pool: &DbPool, outbox_id: i64, error: &str) -> AppResult<()> {
    let conn = get_conn(pool)?;
    conn.execute(
        "UPDATE sync_outbox
         SET attempts = attempts + 1, last_error = ?1, available_at = datetime('now', '+5 minutes')
         WHERE id = ?2",
        params![error, outbox_id],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(())
}

pub fn set_last_pulled_revision(pool: &DbPool, revision: i64) -> AppResult<()> {
    let conn = get_conn(pool)?;
    set_metadata_conn(&conn, LAST_PULLED_REVISION_KEY, &revision.to_string())
}

fn get_metadata_conn(conn: &rusqlite::Connection, key: &str) -> AppResult<Option<String>> {
    conn.query_row(
        "SELECT value FROM sync_metadata WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| AppError::StorageError(e.to_string()))
}

fn set_metadata_conn(conn: &rusqlite::Connection, key: &str, value: &str) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO sync_metadata (key, value, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, now],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(())
}
