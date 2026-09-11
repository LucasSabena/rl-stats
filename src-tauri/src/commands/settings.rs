use crate::core::autostart::configure_autostart;
use crate::core::models::PlayerStats;
use crate::core::settings::{
    configure_rl_ini, configure_rl_ini_for_all, get_settings, set_settings, sync_rl_installations,
    AppSettings, InstallSyncResult,
};
use crate::core::storage::{self, clear_all_data, MatchPlayerRow, MatchQuery, MatchUpsert};
use crate::AppState;
use tauri::State;
use tracing::{error, info, warn};

#[tauri::command]
pub async fn get_settings_cmd(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let pool = &state.db_pool;
    match get_settings(pool) {
        Ok(s) => Ok(s),
        Err(e) => {
            error!(error = %e, "Failed to get settings");
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn set_settings_cmd(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    mut settings: AppSettings,
) -> Result<(), String> {
    let pool = &state.db_pool;
    let existing = get_settings(pool).ok();
    let auto_start_changed = existing
        .as_ref()
        .map(|s| s.auto_start != settings.auto_start)
        .unwrap_or(false);
    let language_changed = existing
        .as_ref()
        .map(|s| s.language != settings.language)
        .unwrap_or(false);
    // Retention is only written through `set_data_retention_cmd`; a generic
    // settings save must never re-arm the (previously destructive) prune.
    if let Some(existing) = &existing {
        settings.data_retention_days = existing.data_retention_days;
    }
    match set_settings(pool, &settings) {
        Ok(()) => {
            if auto_start_changed {
                configure_autostart(settings.auto_start);
            }
            if language_changed {
                crate::apply_tray_language(&app, &settings.language);
            }
            // Push the kickoff window to the live session manager: it used to
            // be read once at startup, so changing it here did nothing until
            // the app restarted.
            state
                .session_manager
                .write()
                .await
                .set_kickoff_threshold_seconds(settings.kickoff_goal_threshold_seconds);
            let player_names = identity_candidate_names(&settings);
            if let Err(e) = storage::rebuild_daily_rollups_for_identity(
                pool,
                settings.local_primary_id.as_deref(),
                &player_names,
            ) {
                error!(error = %e, "Failed to rebuild daily rollups after saving settings");
            }
            Ok(())
        }
        Err(e) => {
            error!(error = %e, "Failed to save settings");
            Err(e.to_string())
        }
    }
}

fn identity_candidate_names(settings: &AppSettings) -> Vec<String> {
    let mut names = Vec::new();

    if !settings.player_name.trim().is_empty() {
        names.push(settings.player_name.trim().to_string());
    }

    if let Some(username) = &settings.tracker_username {
        let username = username.trim();
        if !username.is_empty() && !names.iter().any(|name| name.eq_ignore_ascii_case(username)) {
            names.push(username.to_string());
        }
    }

    names
}

fn settings_app_data_dir(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    app_handle.path().app_data_dir().map_err(|e| e.to_string())
}

/// Saves the retention window WITHOUT deleting anything.
///
/// Deletion only happens through `apply_data_retention_cmd`, after the UI's
/// double confirmation. There is no automatic pruning anywhere in the app.
#[tauri::command]
pub async fn set_data_retention_cmd(state: State<'_, AppState>, days: i32) -> Result<(), String> {
    let pool = &state.db_pool;
    let mut settings = get_settings(pool).map_err(|e| e.to_string())?;
    settings.data_retention_days = days.max(0);
    set_settings(pool, &settings).map_err(|e| e.to_string())
}

/// How many matches a retention run would delete, for the confirmation modal.
#[tauri::command]
pub async fn preview_data_retention_cmd(
    state: State<'_, AppState>,
    days: i32,
) -> Result<storage::RetentionPreview, String> {
    storage::preview_data_retention(&state.db_pool, days.max(0).into()).map_err(|e| e.to_string())
}

/// Deletes matches older than `days`. Only called after the two-step
/// confirmation; a database backup is taken by the UI beforehand.
#[tauri::command]
pub async fn apply_data_retention_cmd(
    state: State<'_, AppState>,
    days: i32,
) -> Result<u32, String> {
    let pool = &state.db_pool;
    let mut settings = get_settings(pool).map_err(|e| e.to_string())?;
    settings.data_retention_days = days.max(0);
    set_settings(pool, &settings).map_err(|e| e.to_string())?;

    if settings.data_retention_days == 0 {
        return Ok(0);
    }

    storage::apply_data_retention(pool, settings.data_retention_days.into())
        .map(|deleted| deleted as u32)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_database_backups_cmd(
    app_handle: tauri::AppHandle,
) -> Result<Vec<storage::DatabaseBackupInfo>, String> {
    let app_dir = settings_app_data_dir(&app_handle)?;
    storage::list_database_backups(&app_dir).map_err(|e| e.to_string())
}

/// Stages a backup for restore. The app must be relaunched to apply it; the
/// swap happens at startup, before SQLite opens.
#[tauri::command]
pub async fn restore_database_backup_cmd(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let app_dir = settings_app_data_dir(&app_handle)?;

    // A backup of another profile must not be swapped into this one: the
    // account would end up with the wrong history.
    if let Some(name) = std::path::Path::new(&path)
        .file_name()
        .and_then(|name| name.to_str())
    {
        if let Some(backup_profile) = storage::backup_profile_id(name) {
            let active = crate::core::profiles::get_active_profile(&app_dir)
                .map(|profile| profile.id)
                .unwrap_or_default();
            if !active.is_empty() && backup_profile != active {
                return Err(format!(
                    "Esta copia pertenece al perfil '{backup_profile}'. Cambiá a ese perfil (Ajustes → Perfiles) y volvé a intentar."
                ));
            }
        }
    }

    if let Ok(conn) = state.db_pool.get() {
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }
    storage::stage_database_restore(&app_dir, std::path::Path::new(&path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn configure_rl_ini_cmd(path: String, port: u16) -> Result<(), String> {
    match configure_rl_ini(&path, port) {
        Ok(()) => Ok(()),
        Err(e) => {
            error!(error = %e, "Failed to configure RL INI");
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn configure_rl_ini_all_cmd(
    paths: Vec<String>,
    port: u16,
) -> Result<Vec<String>, String> {
    let failures = configure_rl_ini_for_all(&paths, port);
    if !failures.is_empty() {
        warn!(
            failures = failures.len(),
            "Some RL INI configurations failed"
        );
    }
    Ok(failures)
}

#[tauri::command]
pub async fn sync_rl_installations_cmd(
    state: State<'_, AppState>,
) -> Result<InstallSyncResult, String> {
    let pool = &state.db_pool;
    let port = get_settings(pool).map(|s| s.port).unwrap_or(49123);
    match sync_rl_installations(pool, port) {
        Ok(result) => {
            info!(installs = result.paths.len(), "Install sync completed");
            Ok(result)
        }
        Err(e) => {
            error!(error = %e, "Failed to sync RL installations");
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn export_data_json(state: State<'_, AppState>) -> Result<String, String> {
    export_data_json_internal(&state.db_pool)
}

fn export_data_json_internal(pool: &storage::DbPool) -> Result<String, String> {
    // Export all data necessary for a complete backup/restore.
    let match_count = storage::get_match_count(pool).map_err(|e| e.to_string())?;
    let matches = storage::get_matches(
        pool,
        MatchQuery {
            limit: match_count.max(1),
            offset: 0,
            arena: None,
            match_type: None,
            playlist: None,
            result: None,
            date_from: None,
            date_to: None,
            search: None,
            local_primary_id: None,
            local_player_names: &[],
        },
    )
    .map_err(|e| e.to_string())?;
    let players = storage::get_all_players(pool).map_err(|e| e.to_string())?;
    let match_players = storage::get_all_match_players(pool).map_err(|e| e.to_string())?;
    let match_events = storage::get_all_match_events(pool).map_err(|e| e.to_string())?;
    let sessions = storage::get_all_sessions(pool).map_err(|e| e.to_string())?;
    let daily_rollups = storage::get_all_daily_rollups_all(pool).map_err(|e| e.to_string())?;
    let app_settings = get_settings(pool)
        .map(|settings| settings.for_sync())
        .map_err(|e| e.to_string())?;
    let user_presets = storage::list_user_presets(pool).map_err(|e| e.to_string())?;

    let export = serde_json::json!({
        "version": "1.0",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "app_settings": app_settings,
        "matches": matches,
        "players": players,
        "match_players": match_players,
        "match_events": match_events,
        "sessions": sessions,
        "daily_rollups": daily_rollups,
        "user_presets": user_presets,
    });

    serde_json::to_string_pretty(&export).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_data_json(state: State<'_, AppState>, content: String) -> Result<(), String> {
    import_data_json_internal(&state.db_pool, &content, None)
}

fn import_data_json_internal(
    pool: &storage::DbPool,
    content: &str,
    source_path: Option<&str>,
) -> Result<(), String> {
    let import: serde_json::Value =
        serde_json::from_str(content).map_err(|e| format!("Invalid JSON: {e}"))?;

    let version = import
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    info!(path = source_path.unwrap_or("memory"), %version, "Importing data");

    let imported_settings = import
        .get("app_settings")
        .cloned()
        .map(serde_json::from_value::<AppSettings>)
        .transpose()
        .map_err(|e| format!("Invalid app_settings payload: {e}"))?;

    let conn = storage::get_conn(pool).map_err(|e| e.to_string())?;

    // Wrap the entire import in a transaction for atomicity. BEGIN IMMEDIATE
    // takes the write lock up front instead of failing mid-import on upgrade.
    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| e.to_string())?;

    let result: Result<(), String> = (|| {
        // ── 1. Players ──
        let mut imported_players = 0u32;
        let mut player_name_by_primary_id: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        if let Some(players) = import.get("players").and_then(|v| v.as_array()) {
            for player in players {
                let primary_id = match player.get("primary_id").and_then(|v| v.as_str()) {
                    Some(id) => id,
                    None => {
                        warn!("Skipping player with missing primary_id");
                        continue;
                    }
                };
                let name = player
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown");
                storage::upsert_player_by_primary_id(&conn, primary_id, name)
                    .map_err(|e| e.to_string())?;
                player_name_by_primary_id.insert(primary_id.to_string(), name.to_string());
                imported_players += 1;
            }
        }
        info!(imported_players, "Players imported");

        // ── 2. Matches (upsert by guid) ──
        let mut imported_matches = 0u32;
        let mut guid_to_id: std::collections::HashMap<String, i64> =
            std::collections::HashMap::new();

        if let Some(matches) = import.get("matches").and_then(|v| v.as_array()) {
            for m in matches {
                let guid = match m.get("guid").and_then(|v| v.as_str()) {
                    Some(g) => g,
                    None => {
                        warn!("Skipping match with missing guid");
                        continue;
                    }
                };
                let start_time = m.get("start_time").and_then(|v| v.as_str()).unwrap_or("");
                let end_time = m.get("end_time").and_then(|v| v.as_str());
                let arena = m.get("arena").and_then(|v| v.as_str());
                let score_blue = m.get("score_blue").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let score_orange =
                    m.get("score_orange").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let winner = m.get("winner").and_then(|v| v.as_i64()).map(|v| v as i32);
                let is_online = m
                    .get("is_online")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let is_overtime = m
                    .get("is_overtime")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let duration_seconds = m
                    .get("duration_seconds")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32;
                let match_type = m.get("match_type").and_then(|v| v.as_str());
                let playlist = m.get("playlist").and_then(|v| v.as_str());
                let mood = m.get("mood").and_then(|v| v.as_str());

                let match_id = storage::upsert_match_by_guid(
                    &conn,
                    MatchUpsert {
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
                        mood,
                    },
                )
                .map_err(|e| e.to_string())?;

                guid_to_id.insert(guid.to_string(), match_id);
                imported_matches += 1;
            }
        }
        info!(imported_matches, "Matches imported");

        // ── 3. Match_players (upsert by match_guid + player_id) ──
        let mut imported_match_players = 0u32;
        if let Some(mps) = import.get("match_players").and_then(|v| v.as_array()) {
            for mp in mps {
                let match_guid = match mp.get("match_guid").and_then(|v| v.as_str()) {
                    Some(g) => g,
                    None => {
                        warn!("Skipping match_player with missing match_guid");
                        continue;
                    }
                };
                let match_id = match guid_to_id.get(match_guid) {
                    Some(id) => *id,
                    None => {
                        warn!(
                            match_guid,
                            "match_guid not found in imported matches, skipping"
                        );
                        continue;
                    }
                };

                let player_id = match mp.get("player_primary_id").and_then(|v| v.as_str()) {
                    Some(primary_id) => {
                        let name = player_name_by_primary_id
                            .get(primary_id)
                            .map(String::as_str)
                            .unwrap_or(primary_id);
                        storage::upsert_player_by_primary_id(&conn, primary_id, name)
                            .map_err(|e| e.to_string())?
                    }
                    None => mp.get("player_id").and_then(|v| v.as_i64()).unwrap_or(0),
                };
                let team_num = mp.get("team_num").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let score = mp.get("score").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let goals = mp.get("goals").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let shots = mp.get("shots").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let assists = mp.get("assists").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let saves = mp.get("saves").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let touches = mp.get("touches").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let car_touches =
                    mp.get("car_touches").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let demos = mp.get("demos").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let speed = mp.get("speed").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let boost = mp.get("boost").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let kickoff_goals = mp
                    .get("kickoff_goals")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32;

                storage::upsert_match_player_row(
                    &conn,
                    match_id,
                    MatchPlayerRow {
                        player_id,
                        team_num,
                        stats: PlayerStats {
                            score,
                            goals,
                            shots,
                            assists,
                            saves,
                            touches,
                            car_touches,
                            demos,
                            speed,
                            boost,
                            mmr: None,
                            kickoff_goals,
                            head_to_head: None,
                        },
                        head_to_head_json: None,
                    },
                )
                .map_err(|e| e.to_string())?;
                imported_match_players += 1;
            }
        }
        info!(imported_match_players, "Match players imported");

        // ── 4. Match_events (append, dedup by content) ──
        let mut imported_events = 0u32;
        if let Some(events) = import.get("match_events").and_then(|v| v.as_array()) {
            for evt in events {
                let match_guid = match evt.get("match_guid").and_then(|v| v.as_str()) {
                    Some(g) => g,
                    None => {
                        warn!("Skipping match_event with missing match_guid");
                        continue;
                    }
                };
                let match_id = match guid_to_id.get(match_guid) {
                    Some(id) => *id,
                    None => {
                        warn!(match_guid, "match_guid not found, skipping event");
                        continue;
                    }
                };
                let event_type = evt
                    .get("event_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown");
                let event_data = evt
                    .get("event_data")
                    .and_then(|v| v.as_str())
                    .unwrap_or("{}");
                let occurred_at = evt
                    .get("occurred_at")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                storage::insert_match_event_if_not_exists(
                    &conn,
                    match_id,
                    event_type,
                    event_data,
                    occurred_at,
                )
                .map_err(|e| e.to_string())?;
                imported_events += 1;
            }
        }
        info!(imported_events, "Match events imported");

        // ── 5. Sessions ──
        let mut imported_sessions = 0u32;
        if let Some(sessions) = import.get("sessions").and_then(|v| v.as_array()) {
            for sess in sessions {
                let match_guid = match sess.get("match_guid").and_then(|v| v.as_str()) {
                    Some(g) => g,
                    None => {
                        warn!("Skipping session with missing match_guid");
                        continue;
                    }
                };
                let match_id = match guid_to_id.get(match_guid) {
                    Some(id) => *id,
                    None => {
                        warn!(match_guid, "match_guid not found, skipping session");
                        continue;
                    }
                };
                let summary_json = sess
                    .get("summary_json")
                    .and_then(|v| v.as_str())
                    .unwrap_or("{}");
                let created_at = sess
                    .get("created_at")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                storage::insert_session_if_not_exists(&conn, match_id, summary_json, created_at)
                    .map_err(|e| e.to_string())?;
                imported_sessions += 1;
            }
        }
        info!(imported_sessions, "Sessions imported");

        // ── 6. User Presets ──
        let mut imported_presets = 0u32;
        if let Some(presets) = import.get("user_presets").and_then(|v| v.as_array()) {
            for p in presets {
                let name = p
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Imported Preset");
                let description = p.get("description").and_then(|v| v.as_str());
                let camera: Option<crate::core::models::CameraSettings> = p
                    .get("camera")
                    .and_then(|v| serde_json::from_value(v.clone()).ok());
                let controls: Option<crate::core::models::ControlSettings> = p
                    .get("controls")
                    .and_then(|v| serde_json::from_value(v.clone()).ok());
                let deadzone: Option<crate::core::models::DeadzoneSettings> = p
                    .get("deadzone")
                    .and_then(|v| serde_json::from_value(v.clone()).ok());
                let hardware: Option<crate::core::models::HardwareSettings> = p
                    .get("hardware")
                    .and_then(|v| serde_json::from_value(v.clone()).ok());

                storage::insert_user_preset_conn(
                    &conn,
                    name,
                    description,
                    &camera,
                    &controls,
                    &deadzone,
                    &hardware,
                )
                .map_err(|e| e.to_string())?;
                imported_presets += 1;
            }
        }
        info!(imported_presets, "User presets imported");

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Some(settings) = imported_settings {
                // Exports redact secrets and carry device-local paths from
                // another machine; merge_remote keeps this machine's values
                // and imports everything else.
                let mut merged = get_settings(pool).map_err(|e| e.to_string())?;
                merged.merge_remote(&settings);
                set_settings(pool, &merged).map_err(|e| e.to_string())?;
                let player_names = identity_candidate_names(&merged);
                storage::rebuild_daily_rollups_for_identity(
                    pool,
                    merged.local_primary_id.as_deref(),
                    &player_names,
                )
                .map_err(|e| e.to_string())?;
            } else {
                let current_settings = get_settings(pool).map_err(|e| e.to_string())?;
                let player_names = identity_candidate_names(&current_settings);
                storage::rebuild_daily_rollups_for_identity(
                    pool,
                    current_settings.local_primary_id.as_deref(),
                    &player_names,
                )
                .map_err(|e| e.to_string())?;
            }
            info!(
                path = source_path.unwrap_or("memory"),
                version, "Data import completed successfully"
            );
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            error!(path = source_path.unwrap_or("memory"), error = %e, "Data import failed and rolled back");
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn get_storage_stats_cmd(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let pool = &state.db_pool;
    match storage::get_storage_stats(pool) {
        Ok(stats) => Ok(stats),
        Err(e) => {
            error!(error = %e, "Failed to get storage stats");
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn clear_all_data_cmd(state: State<'_, AppState>) -> Result<(), String> {
    let pool = &state.db_pool;
    match clear_all_data(pool) {
        Ok(()) => Ok(()),
        Err(e) => {
            error!(error = %e, "Failed to clear data");
            Err(e.to_string())
        }
    }
}
