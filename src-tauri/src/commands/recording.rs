//! Tauri commands for match recording and replay ("retransmisión").

use crate::core::broadcast::recording::RecordingSummary;
use crate::AppState;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub async fn start_recording(
    state: State<'_, AppState>,
    label: Option<String>,
) -> Result<RecordingSummary, String> {
    state.recordings.start(label.as_deref().unwrap_or_default())
}

#[tauri::command]
pub async fn stop_recording(
    state: State<'_, AppState>,
) -> Result<Option<RecordingSummary>, String> {
    state.recordings.stop()
}

#[tauri::command]
pub async fn list_recordings(state: State<'_, AppState>) -> Result<Vec<RecordingSummary>, String> {
    state.recordings.list()
}

#[tauri::command]
pub async fn delete_recording(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.recordings.delete(&id)
}

/// Re-emits a recording on the overlay feed with the original pacing.
#[tauri::command]
pub async fn replay_recording(
    state: State<'_, AppState>,
    id: String,
    speed: Option<f64>,
    loop_events: Option<bool>,
) -> Result<(), String> {
    state.recordings.replay(
        state.broadcast_hub.clone(),
        &id,
        speed.unwrap_or(1.0),
        loop_events.unwrap_or(false),
    )
}

#[tauri::command]
pub async fn stop_replay(state: State<'_, AppState>) -> Result<(), String> {
    state.recordings.stop_replay();
    Ok(())
}

#[tauri::command]
pub async fn get_recording_status(state: State<'_, AppState>) -> Result<Value, String> {
    Ok(json!({
        "recording": state.recordings.is_recording(),
        "replaying": state.recordings.is_replaying(),
    }))
}
