use crate::core::app_sync::{get_cloud_config, get_cloud_sync_status, set_cloud_config};
use crate::core::cloud::{build_push_request, CloudConfig, CloudPushRequest, CloudSyncStatus};
use crate::core::storage::enqueue_existing_history_for_sync;
use crate::core::storage::sync::{
    get_pending_hydrated_changes, get_sync_status, mark_change_failed, mark_change_synced,
    SyncStatus,
};
use crate::error::{AppError, AppResult};
use crate::AppState;
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
