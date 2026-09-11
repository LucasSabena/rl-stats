use crate::core::profiles::{
    create_profile, delete_profile, find_matching_profile, get_active_profile,
    get_db_path_for_profile, list_profiles, rename_profile, switch_profile,
    update_profile_player_identity, Profile,
};
use crate::core::settings::{set_settings, AppSettings};
use crate::core::storage::init_storage;
use crate::error::AppResult;
use rusqlite::{params, OpenFlags};
use serde::Serialize;
use tauri::Manager;
use tracing::info;

fn app_data_dir(app_handle: &tauri::AppHandle) -> AppResult<std::path::PathBuf> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError::IoError(e.to_string()))
}

/// Aggregate stats for one profile, shown in the cross-profile comparison.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileComparisonRow {
    pub id: String,
    pub name: String,
    pub is_active: bool,
    pub player_name: Option<String>,
    pub matches: i64,
    pub wins: i64,
    pub win_rate: Option<f64>,
    pub last_match_at: Option<String>,
    pub training_sessions: i64,
}

/// Summarizes every configured profile by reading its database read-only.
///
/// This is the only way to compare "my accounts" without switching profiles.
#[tauri::command]
pub async fn get_profile_comparison_cmd(
    app_handle: tauri::AppHandle,
) -> AppResult<Vec<ProfileComparisonRow>> {
    let app_dir = app_data_dir(&app_handle)?;
    let profiles = list_profiles(&app_dir)?;
    let active_id = get_active_profile(&app_dir).ok().map(|p| p.id);

    let mut rows = Vec::with_capacity(profiles.len());
    for profile in profiles {
        let mut row = ProfileComparisonRow {
            id: profile.id.clone(),
            name: profile.name.clone(),
            is_active: active_id.as_deref() == Some(profile.id.as_str()),
            player_name: profile.player_name.clone(),
            matches: 0,
            wins: 0,
            win_rate: None,
            last_match_at: None,
            training_sessions: 0,
        };

        let db_path = get_db_path_for_profile(&app_dir, &profile.id);
        if !db_path.exists() {
            rows.push(row);
            continue;
        }

        // Read-only: never run migrations or open a pool against another
        // profile just to read two counters.
        let Ok(conn) =
            rusqlite::Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        else {
            rows.push(row);
            continue;
        };

        let identity = profile.local_primary_id.clone().or_else(|| {
            crate::core::settings::get_settings_from_path(&db_path)
                .ok()
                .and_then(|settings| settings.local_primary_id)
        });

        row.player_name = row.player_name.or_else(|| {
            crate::core::settings::get_settings_from_path(&db_path)
                .ok()
                .map(|settings| settings.player_name)
                .filter(|name| !name.trim().is_empty())
        });

        row.matches = conn
            .query_row(
                "SELECT COUNT(*) FROM matches
                 WHERE LOWER(COALESCE(match_type, '')) != 'training'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        row.training_sessions = conn
            .query_row(
                "SELECT COUNT(*) FROM matches
                 WHERE LOWER(COALESCE(match_type, '')) = 'training'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        row.last_match_at = conn
            .query_row("SELECT MAX(start_time) FROM matches", [], |r| r.get(0))
            .ok()
            .flatten();
        row.wins = conn
            .query_row(
                "SELECT COUNT(*) FROM matches m
                 JOIN match_players mp ON mp.match_id = m.id
                 JOIN players p ON p.id = mp.player_id
                 WHERE m.winner IS NOT NULL
                   AND mp.team_num = m.winner
                   AND LOWER(COALESCE(m.match_type, '')) != 'training'
                   AND (?1 IS NULL OR p.primary_id = ?1)",
                params![identity],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if row.matches > 0 && identity.is_some() {
            row.win_rate = Some(row.wins as f64 / row.matches as f64);
        }

        rows.push(row);
    }

    Ok(rows)
}

#[tauri::command]
pub async fn list_profiles_cmd(app_handle: tauri::AppHandle) -> AppResult<Vec<Profile>> {
    let app_dir = app_data_dir(&app_handle)?;
    list_profiles(&app_dir)
}

#[tauri::command]
pub async fn get_active_profile_cmd(app_handle: tauri::AppHandle) -> AppResult<Profile> {
    let app_dir = app_data_dir(&app_handle)?;
    get_active_profile(&app_dir)
}

#[tauri::command]
pub async fn create_profile_cmd(
    name: String,
    player_name: Option<String>,
    app_handle: tauri::AppHandle,
) -> AppResult<Profile> {
    let app_dir = app_data_dir(&app_handle)?;
    let profile = create_profile(&app_dir, &name)?;

    let db_path = get_db_path_for_profile(&app_dir, &profile.id);
    let pool = init_storage(&db_path)?;
    let settings = AppSettings {
        player_name: player_name.unwrap_or_default(),
        ..Default::default()
    };
    set_settings(&pool, &settings)?;

    info!(profile_id = %profile.id, profile_name = %profile.name, "Created profile and initialized settings");
    Ok(profile)
}

#[tauri::command]
pub async fn delete_profile_cmd(id: String, app_handle: tauri::AppHandle) -> AppResult<()> {
    let app_dir = app_data_dir(&app_handle)?;
    delete_profile(&app_dir, &id)?;
    info!(profile_id = %id, "Deleted profile");
    Ok(())
}

#[tauri::command]
pub async fn switch_profile_cmd(id: String, app_handle: tauri::AppHandle) -> AppResult<()> {
    let app_dir = app_data_dir(&app_handle)?;
    switch_profile(&app_dir, &id)?;
    info!(profile_id = %id, "Switched profile");
    Ok(())
}

#[tauri::command]
pub async fn rename_profile_cmd(
    id: String,
    new_name: String,
    app_handle: tauri::AppHandle,
) -> AppResult<()> {
    let app_dir = app_data_dir(&app_handle)?;
    rename_profile(&app_dir, &id, &new_name)?;
    info!(profile_id = %id, new_name = %new_name, "Renamed profile");
    Ok(())
}

#[tauri::command]
pub async fn find_matching_profile_cmd(
    primary_id: String,
    player_name: String,
    app_handle: tauri::AppHandle,
) -> AppResult<Option<Profile>> {
    let app_dir = app_data_dir(&app_handle)?;
    find_matching_profile(&app_dir, &primary_id, &player_name)
}

#[tauri::command]
pub async fn update_profile_player_identity_cmd(
    profile_id: String,
    primary_id: String,
    player_name: String,
    app_handle: tauri::AppHandle,
) -> AppResult<()> {
    let app_dir = app_data_dir(&app_handle)?;
    update_profile_player_identity(&app_dir, &profile_id, &primary_id, &player_name)
}
