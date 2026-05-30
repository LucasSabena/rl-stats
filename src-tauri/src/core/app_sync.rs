use crate::core::cloud::{CloudConfig, CloudSyncStatus};
use crate::core::profiles::ProfilesManifest;
use crate::core::storage::sync;
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::{Path, PathBuf};
use tracing::warn;

const APP_SYNC_DB_NAME: &str = "rl_stats_app_sync.db";

pub fn get_app_sync_db_path(app_dir: &Path) -> PathBuf {
    app_dir.join(APP_SYNC_DB_NAME)
}

pub fn init_app_sync(app_dir: &Path) -> AppResult<()> {
    let conn = open_app_sync_conn(app_dir)?;
    sync::ensure_local_sync_identity_conn(&conn)?;
    Ok(())
}

pub fn enqueue_profiles_manifest_snapshot(
    app_dir: &Path,
    manifest: &ProfilesManifest,
) -> AppResult<()> {
    let conn = open_app_sync_conn(app_dir)?;
    sync::enqueue_upsert_conn(
        &conn,
        "profiles_manifest",
        "all",
        serde_json::to_value(manifest).map_err(|e| {
            AppError::ParseError(format!("Failed to serialize profiles manifest: {e}"))
        })?,
    )?;
    Ok(())
}

pub fn enqueue_profiles_manifest_snapshot_best_effort(app_dir: &Path, manifest: &ProfilesManifest) {
    if let Err(error) = enqueue_profiles_manifest_snapshot(app_dir, manifest) {
        warn!(error = %error, "Failed to enqueue profiles manifest sync snapshot");
    }
}

pub fn get_cloud_config(app_dir: &Path) -> AppResult<CloudConfig> {
    let conn = open_app_sync_conn(app_dir)?;
    let mut config = CloudConfig::default();
    let mut stmt = conn.prepare("SELECT key, value FROM cloud_config")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    for row in rows {
        let (key, value) = row.map_err(|e| AppError::StorageError(e.to_string()))?;
        match key.as_str() {
            "enabled" => config.enabled = value.parse().unwrap_or(false),
            "supabase_url" => config.supabase_url = empty_to_none(value),
            "supabase_anon_key" => config.supabase_anon_key = empty_to_none(value),
            "device_name" => config.device_name = empty_to_none(value),
            "cloud_profile_id" => config.cloud_profile_id = empty_to_none(value),
            "cloud_profile_ids" => {
                config.cloud_profile_ids = serde_json::from_str(&value).unwrap_or_default();
            }
            "last_sync_at" => config.last_sync_at = empty_to_none(value),
            "plan_code" => config.plan_code = empty_to_none(value),
            "plan_status" => config.plan_status = empty_to_none(value),
            "cloud_sync_enabled" => config.cloud_sync_enabled = value.parse().unwrap_or(false),
            _ => {}
        }
    }

    Ok(config)
}

pub fn set_cloud_config(app_dir: &Path, config: &CloudConfig) -> AppResult<()> {
    let conn = open_app_sync_conn(app_dir)?;
    let pairs = [
        ("enabled", config.enabled.to_string()),
        (
            "supabase_url",
            config.supabase_url.clone().unwrap_or_default(),
        ),
        (
            "supabase_anon_key",
            config.supabase_anon_key.clone().unwrap_or_default(),
        ),
        (
            "device_name",
            config.device_name.clone().unwrap_or_default(),
        ),
        (
            "cloud_profile_id",
            config.cloud_profile_id.clone().unwrap_or_default(),
        ),
        (
            "cloud_profile_ids",
            serde_json::to_string(&config.cloud_profile_ids).unwrap_or_else(|_| "{}".into()),
        ),
        (
            "last_sync_at",
            config.last_sync_at.clone().unwrap_or_default(),
        ),
        ("plan_code", config.plan_code.clone().unwrap_or_default()),
        (
            "plan_status",
            config.plan_status.clone().unwrap_or_default(),
        ),
        ("cloud_sync_enabled", config.cloud_sync_enabled.to_string()),
    ];

    for (key, value) in pairs {
        conn.execute(
            "INSERT INTO cloud_config (key, value, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value],
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    }

    Ok(())
}

pub fn get_cloud_sync_status(app_dir: &Path) -> AppResult<CloudSyncStatus> {
    let conn = open_app_sync_conn(app_dir)?;
    let config = get_cloud_config(app_dir)?;
    let pending_app_changes = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let failed_app_changes = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL AND last_error IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let device_id = conn
        .query_row(
            "SELECT value FROM sync_metadata WHERE key = 'sync.device_id'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| AppError::StorageError(e.to_string()))?
        .unwrap_or_default();

    Ok(CloudSyncStatus {
        configured: config.is_configured(),
        enabled: config.enabled,
        cloud_sync_enabled: config.cloud_sync_enabled,
        plan_code: config.plan_code,
        plan_status: config.plan_status,
        device_id,
        pending_app_changes,
        failed_app_changes,
        last_sync_at: config.last_sync_at,
    })
}

fn empty_to_none(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn open_app_sync_conn(app_dir: &Path) -> AppResult<Connection> {
    std::fs::create_dir_all(app_dir)
        .map_err(|e| AppError::IoError(format!("Failed to create app data dir: {e}")))?;

    let conn = Connection::open(get_app_sync_db_path(app_dir))
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;",
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    run_app_sync_migrations(&conn)?;
    Ok(conn)
}

fn run_app_sync_migrations(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sync_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sync_entity_state (
            entity_type TEXT NOT NULL,
            entity_key TEXT NOT NULL,
            cloud_id TEXT,
            payload_hash TEXT,
            server_revision INTEGER NOT NULL DEFAULT 0,
            dirty INTEGER NOT NULL DEFAULT 0,
            last_pushed_at TEXT,
            last_pulled_at TEXT,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (entity_type, entity_key)
        );

        CREATE TABLE IF NOT EXISTS sync_outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_key TEXT NOT NULL,
            operation TEXT NOT NULL CHECK(operation IN ('upsert', 'delete')),
            payload_json TEXT NOT NULL DEFAULT '{}',
            idempotency_key TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            available_at TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            locked_at TEXT,
            synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sync_tombstones (
            entity_type TEXT NOT NULL,
            entity_key TEXT NOT NULL,
            deleted_at TEXT NOT NULL,
            payload_json TEXT NOT NULL DEFAULT '{}',
            source_outbox_id INTEGER,
            PRIMARY KEY (entity_type, entity_key)
        );

        CREATE INDEX IF NOT EXISTS idx_sync_entity_state_dirty ON sync_entity_state(dirty, updated_at);
        CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(synced_at, available_at, id);
        CREATE INDEX IF NOT EXISTS idx_sync_outbox_entity ON sync_outbox(entity_type, entity_key);
        CREATE TABLE IF NOT EXISTS cloud_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_sync_tombstones_deleted_at ON sync_tombstones(deleted_at);",
    )
    .map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(())
}
