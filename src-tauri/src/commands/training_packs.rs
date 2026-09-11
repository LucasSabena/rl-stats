use crate::core::storage::training_packs::{self, TrainingPackInput, TrainingPackRecord};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_training_packs(
    state: State<'_, AppState>,
) -> Result<Vec<TrainingPackRecord>, String> {
    let pool = state.db_pool.clone();
    tauri::async_runtime::spawn_blocking(move || {
        training_packs::list_training_packs(&pool).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

#[tauri::command]
pub async fn upsert_training_pack(
    state: State<'_, AppState>,
    pack: TrainingPackInput,
) -> Result<TrainingPackRecord, String> {
    let pool = state.db_pool.clone();
    tauri::async_runtime::spawn_blocking(move || {
        training_packs::upsert_training_pack(&pool, pack).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

#[tauri::command]
pub async fn delete_training_pack(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let pool = state.db_pool.clone();
    tauri::async_runtime::spawn_blocking(move || {
        training_packs::delete_training_pack(&pool, &id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}
