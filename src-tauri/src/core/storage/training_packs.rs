//! User-created training packs.
//!
//! Historically these lived only in the frontend's localStorage. They are now
//! canonical SQLite rows so they are covered by backups and by cloud sync:
//! every mutation enqueues a `training_pack` entity in the sync outbox, and
//! the server stores it through its generic `cloud_profile_entities` table
//! (no dedicated server table is required).

use crate::core::storage::{get_conn, sync, DbPool};
use crate::error::{AppError, AppResult};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

pub const TRAINING_PACK_ENTITY: &str = "training_pack";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingPackRecord {
    pub id: String,
    pub name: String,
    pub code: String,
    pub creator: String,
    pub category: String,
    pub difficulty: String,
    pub description: String,
    pub tags: Vec<String>,
    pub source_url: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingPackInput {
    /// Present when updating an existing pack; `None` creates a new one.
    pub id: Option<String>,
    pub name: String,
    pub code: String,
    #[serde(default)]
    pub creator: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub difficulty: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub source_url: Option<String>,
}

fn row_to_record(row: &rusqlite::Row) -> rusqlite::Result<TrainingPackRecord> {
    let tags_json: String = row.get(7)?;
    Ok(TrainingPackRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        code: row.get(2)?,
        creator: row.get(3)?,
        category: row.get(4)?,
        difficulty: row.get(5)?,
        description: row.get(6)?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        source_url: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

const SELECT_COLUMNS: &str = "id, name, code, creator, category, difficulty, description,
     tags_json, source_url, created_at, updated_at";

/// Payload sent to the cloud: stable snake_case keys, independent of the
/// camelCase shape the UI consumes.
fn sync_payload(record: &TrainingPackRecord) -> serde_json::Value {
    serde_json::json!({
        "id": record.id,
        "name": record.name,
        "code": record.code,
        "creator": record.creator,
        "category": record.category,
        "difficulty": record.difficulty,
        "description": record.description,
        "tags": record.tags,
        "source_url": record.source_url,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    })
}

pub fn list_training_packs(pool: &DbPool) -> AppResult<Vec<TrainingPackRecord>> {
    let conn = get_conn(pool)?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLUMNS} FROM training_packs ORDER BY created_at ASC"
    ))?;
    let rows = stmt
        .query_map([], row_to_record)
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    let mut packs = Vec::new();
    for row in rows {
        packs.push(row.map_err(|e| AppError::StorageError(e.to_string()))?);
    }
    Ok(packs)
}

pub fn upsert_training_pack(
    pool: &DbPool,
    input: TrainingPackInput,
) -> AppResult<TrainingPackRecord> {
    let conn = get_conn(pool)?;
    upsert_training_pack_conn(&conn, input)
}

pub(crate) fn upsert_training_pack_conn(
    conn: &rusqlite::Connection,
    input: TrainingPackInput,
) -> AppResult<TrainingPackRecord> {
    let name = input.name.trim();
    let code = input.code.trim();
    if name.is_empty() {
        return Err(AppError::ConfigError("El pack necesita un nombre.".into()));
    }
    if code.is_empty() {
        return Err(AppError::ConfigError("El pack necesita un código.".into()));
    }

    let now = chrono::Utc::now().timestamp_millis();
    let existing: Option<(i64,)> = conn
        .query_row(
            "SELECT created_at FROM training_packs WHERE id = ?1",
            params![input.id.as_deref().unwrap_or_default()],
            |row| Ok((row.get(0)?,)),
        )
        .optional()
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    let id = input
        .id
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let created_at = existing.map(|row| row.0).unwrap_or(now);
    let tags_json = serde_json::to_string(&input.tags).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "INSERT INTO training_packs
            (id, name, code, creator, category, difficulty, description, tags_json, source_url, created_at, updated_at)
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
            name,
            code,
            input.creator.trim(),
            input.category,
            input.difficulty,
            input.description,
            tags_json,
            input.source_url,
            created_at,
            now,
        ],
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;

    let record = conn
        .query_row(
            &format!("SELECT {SELECT_COLUMNS} FROM training_packs WHERE id = ?1"),
            params![id],
            row_to_record,
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    sync::enqueue_upsert_conn(
        conn,
        TRAINING_PACK_ENTITY,
        &record.id,
        sync_payload(&record),
    )?;
    Ok(record)
}

/// Hard-delete locally; the sync outbox carries a tombstone so other devices
/// and the cloud mirror remove it too.
pub fn delete_training_pack(pool: &DbPool, id: &str) -> AppResult<bool> {
    let conn = get_conn(pool)?;
    let deleted = conn
        .execute("DELETE FROM training_packs WHERE id = ?1", params![id])
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    if deleted > 0 {
        sync::enqueue_delete_conn(
            &conn,
            TRAINING_PACK_ENTITY,
            id,
            serde_json::json!({ "id": id }),
        )?;
    }
    Ok(deleted > 0)
}

pub(crate) fn hydrate_training_pack(
    conn: &rusqlite::Connection,
    entity_key: &str,
) -> Option<serde_json::Value> {
    conn.query_row(
        &format!("SELECT {SELECT_COLUMNS} FROM training_packs WHERE id = ?1"),
        params![entity_key],
        row_to_record,
    )
    .optional()
    .ok()
    .flatten()
    .map(|record| sync_payload(&record))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::storage::{get_conn, init_storage, sync, DbPool};

    fn temp_pool(tag: &str) -> DbPool {
        let dir = std::env::temp_dir().join(format!(
            "rl-stats-training-packs-{tag}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        init_storage(dir.join("test.db")).expect("init storage")
    }

    fn input(name: &str, code: &str) -> TrainingPackInput {
        TrainingPackInput {
            id: None,
            name: name.to_string(),
            code: code.to_string(),
            creator: "Tester".into(),
            category: "aerial".into(),
            difficulty: "advanced".into(),
            description: "desc".into(),
            tags: vec!["air".into(), "car".into()],
            source_url: None,
        }
    }

    #[test]
    fn upsert_lists_and_enqueues_a_hydrated_change() {
        let pool = temp_pool("roundtrip");
        let record = upsert_training_pack(&pool, input("Aerial Master", "ABC-123")).unwrap();
        assert_eq!(record.name, "Aerial Master");
        assert_eq!(record.tags, vec!["air".to_string(), "car".to_string()]);

        let packs = list_training_packs(&pool).unwrap();
        assert_eq!(packs.len(), 1);
        assert_eq!(packs[0].id, record.id);

        let pending = sync::get_pending_hydrated_changes(&pool, 10).unwrap();
        let change = pending
            .iter()
            .find(|change| change.entity_type == TRAINING_PACK_ENTITY)
            .expect("training pack upsert must be queued for sync");
        assert_eq!(change.entity_key, record.id);
        // Hydration reads the live row, not the enqueue-time snapshot.
        assert_eq!(change.payload_json["code"], "ABC-123");
        assert_eq!(change.payload_json["tags"][0], "air");
    }

    #[test]
    fn update_keeps_created_at_and_delete_leaves_a_tombstone() {
        let pool = temp_pool("update-delete");
        let created = upsert_training_pack(&pool, input("Pack", "CODE-1")).unwrap();

        let updated = upsert_training_pack(
            &pool,
            TrainingPackInput {
                id: Some(created.id.clone()),
                name: "Pack v2".into(),
                ..input("Pack", "CODE-1")
            },
        )
        .unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.created_at, created.created_at);
        assert_eq!(updated.name, "Pack v2");
        assert_eq!(list_training_packs(&pool).unwrap().len(), 1);

        assert!(delete_training_pack(&pool, &created.id).unwrap());
        assert!(list_training_packs(&pool).unwrap().is_empty());

        let conn = get_conn(&pool).unwrap();
        let tombstones: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_tombstones WHERE entity_type = ?1 AND entity_key = ?2",
                params![TRAINING_PACK_ENTITY, created.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tombstones, 1, "delete must be propagated to sync");
    }

    #[test]
    fn upsert_rejects_empty_name_or_code() {
        let pool = temp_pool("validation");
        assert!(upsert_training_pack(&pool, input("", "CODE")).is_err());
        assert!(upsert_training_pack(&pool, input("Name", "  ")).is_err());
    }
}
