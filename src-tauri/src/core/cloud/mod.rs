use crate::core::storage::sync::{HydratedSyncChange, SyncOperation};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

pub const DEFAULT_SYNC_BATCH_LIMIT: i64 = 250;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CloudConfig {
    pub enabled: bool,
    pub supabase_url: Option<String>,
    pub supabase_anon_key: Option<String>,
    pub device_name: Option<String>,
    pub cloud_profile_id: Option<String>,
    pub cloud_profile_ids: HashMap<String, String>,
    pub cloud_sync_enabled: bool,
    pub plan_code: Option<String>,
    pub plan_status: Option<String>,
    pub last_sync_at: Option<String>,
}

impl CloudConfig {
    pub fn is_configured(&self) -> bool {
        self.supabase_url
            .as_deref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
            && self
                .supabase_anon_key
                .as_deref()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CloudSyncStatus {
    pub configured: bool,
    pub enabled: bool,
    pub cloud_sync_enabled: bool,
    pub plan_code: Option<String>,
    pub plan_status: Option<String>,
    pub device_id: String,
    pub pending_app_changes: i64,
    pub failed_app_changes: i64,
    pub last_sync_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CloudSyncChange {
    pub local_outbox_id: i64,
    pub entity_type: String,
    pub entity_key: String,
    pub operation: SyncOperation,
    pub payload_json: serde_json::Value,
    pub idempotency_key: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CloudPushRequest {
    pub p_local_device_id: String,
    pub p_device_name: Option<String>,
    pub p_platform: String,
    pub p_app_version: String,
    pub p_batch_idempotency_key: String,
    pub p_profile_id: Option<String>,
    pub p_changes: Vec<CloudSyncChange>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CloudPushResponse {
    pub status: String,
    pub duplicate: bool,
    pub batch_id: Option<String>,
    pub device_id: Option<String>,
    pub processed: i64,
    pub results: serde_json::Value,
}

pub fn build_push_request(
    local_device_id: &str,
    device_name: Option<String>,
    platform: &str,
    app_version: &str,
    cloud_profile_id: Option<String>,
    changes: Vec<HydratedSyncChange>,
) -> AppResult<CloudPushRequest> {
    if local_device_id.trim().is_empty() {
        return Err(AppError::ConfigError(
            "Cloud sync local device id is required".into(),
        ));
    }

    if changes.is_empty() {
        return Err(AppError::ConfigError(
            "Cannot build a cloud push request without changes".into(),
        ));
    }

    let batch_idempotency_key = format!("{}:{}", local_device_id, Uuid::new_v4());
    let p_changes = changes
        .into_iter()
        .map(|change| CloudSyncChange {
            local_outbox_id: change.id,
            entity_type: change.entity_type,
            entity_key: change.entity_key,
            operation: change.operation,
            payload_json: change.payload_json,
            idempotency_key: change.idempotency_key,
        })
        .collect();

    Ok(CloudPushRequest {
        p_local_device_id: local_device_id.to_string(),
        p_device_name: device_name,
        p_platform: platform.to_string(),
        p_app_version: app_version.to_string(),
        p_batch_idempotency_key: batch_idempotency_key,
        p_profile_id: cloud_profile_id,
        p_changes,
    })
}
