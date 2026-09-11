use crate::core::app_sync::{get_cloud_config, get_cloud_sync_status, set_cloud_config};
use crate::core::cloud::{build_push_request, CloudConfig, CloudPushRequest, CloudSyncStatus};
use crate::core::storage::cloud_pull::{apply_remote_changes, ApplySummary, RemoteChange};
use crate::core::storage::enqueue_existing_history_for_sync;
use crate::core::storage::sync::{
    get_last_pulled_revision, get_pending_hydrated_changes, get_sync_status, mark_change_failed,
    mark_change_synced, prune_synced_outbox, scrub_settings_secrets, set_last_pulled_revision,
    SyncStatus,
};
use crate::error::{AppError, AppResult};
use crate::AppState;
use rusqlite::params;
use tauri::{Manager, State};

fn app_data_dir(app_handle: &tauri::AppHandle) -> AppResult<std::path::PathBuf> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::IoError(e.to_string()))
}

#[tauri::command]
pub async fn get_cloud_config_cmd(app_handle: tauri::AppHandle) -> AppResult<CloudConfig> {
    let app_dir = app_data_dir(&app_handle)?;
    get_cloud_config(&app_dir)
}

#[tauri::command]
pub async fn set_cloud_config_cmd(
    app_handle: tauri::AppHandle,
    config: CloudConfig,
) -> AppResult<()> {
    let app_dir = app_data_dir(&app_handle)?;
    set_cloud_config(&app_dir, &config)
}

#[tauri::command]
pub async fn get_cloud_sync_status_cmd(app_handle: tauri::AppHandle) -> AppResult<CloudSyncStatus> {
    let app_dir = app_data_dir(&app_handle)?;
    get_cloud_sync_status(&app_dir)
}

#[tauri::command]
pub async fn get_profile_sync_status_cmd(state: State<'_, AppState>) -> AppResult<SyncStatus> {
    get_sync_status(&state.db_pool)
}

#[tauri::command]
pub async fn prepare_cloud_push_batch_cmd(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> AppResult<Option<CloudPushRequest>> {
    let app_dir = app_data_dir(&app_handle)?;
    let config = get_cloud_config(&app_dir)?;

    if !config.enabled || !config.is_configured() {
        return Ok(None);
    }

    let device_id = get_sync_status(&state.db_pool)?.device_id;
    let changes = get_pending_hydrated_changes(&state.db_pool, limit.unwrap_or(250))?;

    if changes.is_empty() {
        return Ok(None);
    }

    let request = build_push_request(
        &device_id,
        config.device_name,
        std::env::consts::OS,
        env!("CARGO_PKG_VERSION"),
        config.cloud_profile_id,
        changes,
    )?;

    Ok(Some(request))
}

#[tauri::command]
pub async fn mark_cloud_push_succeeded_cmd(
    state: State<'_, AppState>,
    outbox_ids: Vec<i64>,
    server_revision: Option<i64>,
) -> AppResult<()> {
    let revision = server_revision.unwrap_or(0);
    for outbox_id in outbox_ids {
        mark_change_synced(&state.db_pool, outbox_id, revision)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn mark_cloud_push_failed_cmd(
    state: State<'_, AppState>,
    outbox_ids: Vec<i64>,
    error: String,
) -> AppResult<()> {
    for outbox_id in outbox_ids {
        mark_change_failed(&state.db_pool, outbox_id, &error)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn enqueue_existing_profile_history_for_sync_cmd(
    state: State<'_, AppState>,
) -> AppResult<i64> {
    enqueue_existing_history_for_sync(&state.db_pool)
}

/// Applies one page of `sync_pull` results to the local database.
///
/// The whole page lands in a single transaction. Rows written this way are
/// never re-enqueued, so pulling cannot echo changes back to the server.
#[tauri::command]
pub async fn apply_cloud_pull_batch_cmd(
    state: State<'_, AppState>,
    changes: Vec<RemoteChange>,
) -> AppResult<ApplySummary> {
    let pool = &state.db_pool;
    let conn = pool
        .get()
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    let touched_settings = changes.iter().any(|c| c.entity_type == "app_settings");

    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    let applied = apply_remote_changes(&conn, &changes);
    match applied {
        Ok(summary) => {
            conn.execute("COMMIT", [])
                .map_err(|e| AppError::StorageError(e.to_string()))?;

            if touched_settings {
                pool.invalidate_settings_cache();
            }

            if summary.max_revision > 0 {
                set_last_pulled_revision(pool, summary.max_revision)?;
            }

            if summary.touched_matches {
                let settings = crate::core::settings::get_settings(pool)?;
                let names: Vec<String> = if settings.player_name.trim().is_empty() {
                    Vec::new()
                } else {
                    vec![settings.player_name.clone()]
                };
                crate::core::storage::rebuild_daily_rollups_for_identity(
                    pool,
                    settings.local_primary_id.as_deref(),
                    &names,
                )?;
            }

            Ok(summary)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn get_last_pulled_revision_cmd(state: State<'_, AppState>) -> AppResult<i64> {
    get_last_pulled_revision(&state.db_pool)
}

#[tauri::command]
pub async fn set_last_pulled_revision_cmd(
    state: State<'_, AppState>,
    revision: i64,
) -> AppResult<()> {
    set_last_pulled_revision(&state.db_pool, revision)
}

/// Deletes flushed outbox rows; keeps `sync_outbox` from growing forever.
#[tauri::command]
pub async fn prune_sync_outbox_cmd(
    state: State<'_, AppState>,
    older_than_days: Option<i64>,
) -> AppResult<u64> {
    prune_synced_outbox(&state.db_pool, older_than_days.unwrap_or(30))
}

/// Rewrites queued settings payloads so they no longer carry API keys.
#[tauri::command]
pub async fn scrub_settings_secrets_cmd(state: State<'_, AppState>) -> AppResult<u64> {
    scrub_settings_secrets(&state.db_pool)
}

/// Creates a consistent SQLite copy before a destructive operation (cloud
/// pull, clear-all). Returns the backup file path.
#[tauri::command]
pub async fn create_cloud_backup_cmd(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let dir = app_data_dir(&app_handle)?.join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| AppError::IoError(e.to_string()))?;

    let file = dir.join(format!(
        "pre-sync-{}.sqlite",
        chrono::Utc::now().format("%Y%m%d-%H%M%S")
    ));
    let path = file.to_string_lossy().to_string();

    let conn = state
        .db_pool
        .get()
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    // VACUUM INTO produces a consistent snapshot even while WAL is active.
    conn.execute("VACUUM INTO ?1", params![path])
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    // Keep the five most recent backups so the folder cannot grow forever.
    if let Ok(entries) = std::fs::read_dir(&dir) {
        let mut backups: Vec<std::path::PathBuf> = entries
            .flatten()
            .map(|entry| entry.path())
            .filter(|p| p.extension().is_some_and(|ext| ext == "sqlite"))
            .collect();
        backups.sort();
        while backups.len() > 5 {
            let oldest = backups.remove(0);
            let _ = std::fs::remove_file(oldest);
        }
    }

    Ok(path)
}
