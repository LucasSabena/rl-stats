use crate::error::{AppError, AppResult};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{debug, info, warn};

/// A user profile representing an isolated stats database.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub player_name: Option<String>,
    pub local_primary_id: Option<String>,
}

/// Manifest that tracks all profiles and the currently active one.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProfilesManifest {
    pub profiles: Vec<Profile>,
    pub active_profile_id: String,
}

/// Returns the path to the profiles manifest JSON file.
pub fn get_profiles_manifest_path(app_dir: &Path) -> PathBuf {
    app_dir.join("profiles.json")
}

/// Returns the database path for a given profile ID.
pub fn get_db_path_for_profile(app_dir: &Path, profile_id: &str) -> PathBuf {
    app_dir.join(format!("rl_stats_{}.db", profile_id))
}

/// Look for a legacy rl_stats.db in sibling app-data directories.
/// This handles Tauri identifier changes (e.g., com.example.old -> com.example.new).
fn find_legacy_db_in_sibling_dirs(app_dir: &Path) -> Option<PathBuf> {
    let parent = app_dir.parent()?;
    let mut best_candidate: Option<PathBuf> = None;
    let mut best_size: u64 = 0;

    for entry in fs::read_dir(parent).ok()? {
        let entry = entry.ok()?;
        let path = entry.path();
        if !path.is_dir() || path == app_dir {
            continue;
        }
        let legacy_db = path.join("rl_stats.db");
        if legacy_db.exists() {
            if let Ok(meta) = fs::metadata(&legacy_db) {
                let size = meta.len();
                // Only consider databases that actually have data (> 8KB = more than just empty schema)
                if size > 8192 && size > best_size {
                    best_size = size;
                    best_candidate = Some(legacy_db);
                }
            }
        }
    }

    best_candidate
}

/// Copy a legacy database (and its WAL/SHM siblings) from a sibling directory
/// into the current app data dir as the default profile database.
fn copy_legacy_db_from_sibling(app_dir: &Path, legacy_db: &Path) -> AppResult<()> {
    let default_db = get_db_path_for_profile(app_dir, "default");
    let legacy_parent = legacy_db
        .parent()
        .ok_or_else(|| AppError::ConfigError("Legacy DB has no parent directory".into()))?;

    info!(from = %legacy_db.display(), to = %default_db.display(), "Copying legacy database from sibling directory");

    fs::copy(legacy_db, &default_db)
        .map_err(|e| AppError::IoError(format!("Failed to copy legacy DB: {e}")))?;

    // Copy WAL and SHM if they exist — these may contain uncheckpointed data.
    let legacy_wal = legacy_parent.join("rl_stats.db-wal");
    let legacy_shm = legacy_parent.join("rl_stats.db-shm");
    if legacy_wal.exists() {
        fs::copy(&legacy_wal, app_dir.join("rl_stats_default.db-wal"))
            .map_err(|e| AppError::IoError(format!("Failed to copy legacy WAL: {e}")))?;
    }
    if legacy_shm.exists() {
        fs::copy(&legacy_shm, app_dir.join("rl_stats_default.db-shm"))
            .map_err(|e| AppError::IoError(format!("Failed to copy legacy SHM: {e}")))?;
    }

    info!("Legacy database copied successfully");
    Ok(())
}

/// Attempt to migrate data from a legacy app-data directory when the Tauri
/// identifier has changed. This should be called even if profiles.json already
/// exists, in case the default profile was created empty before the legacy DB
/// was discovered.
pub fn try_migrate_from_legacy(app_dir: &Path) -> AppResult<bool> {
    let default_db = get_db_path_for_profile(app_dir, "default");

    // If the default DB already has real data (> 8KB), assume migration is done.
    if default_db.exists() {
        if let Ok(meta) = fs::metadata(&default_db) {
            if meta.len() > 8192 {
                return Ok(false);
            }
        }
    }

    if let Some(legacy_db) = find_legacy_db_in_sibling_dirs(app_dir) {
        copy_legacy_db_from_sibling(app_dir, &legacy_db)?;
        return Ok(true);
    }

    Ok(false)
}

/// Reads the manifest from disk.
fn read_manifest(path: &Path) -> AppResult<ProfilesManifest> {
    let content = fs::read_to_string(path)?;
    let manifest = serde_json::from_str(&content)?;
    Ok(manifest)
}

/// Writes the manifest atomically (temp file + rename).
fn write_manifest(path: &Path, manifest: &ProfilesManifest) -> AppResult<()> {
    let json = serde_json::to_string_pretty(manifest)?;
    let tmp_path = path.with_extension("tmp");
    fs::write(&tmp_path, json)?;
    fs::rename(&tmp_path, path)?;

    if let Some(app_dir) = path.parent() {
        crate::core::app_sync::enqueue_profiles_manifest_snapshot_best_effort(app_dir, manifest);
    }

    Ok(())
}

/// Initializes the profile system.
///
/// - If `profiles.json` exists, reads it and returns the active profile ID.
/// - If not, checks for a legacy `rl_stats.db` and migrates it to `rl_stats_default.db`.
/// - Creates a default profile if none exist.
pub fn init_profiles(app_dir: &Path) -> AppResult<String> {
    let manifest_path = get_profiles_manifest_path(app_dir);

    if manifest_path.exists() {
        let manifest = read_manifest(&manifest_path)?;
        let active_id = manifest.active_profile_id.clone();
        crate::core::app_sync::enqueue_profiles_manifest_snapshot_best_effort(app_dir, &manifest);

        if manifest.profiles.iter().any(|p| p.id == active_id) {
            debug!(active_profile = %active_id, "Profiles manifest loaded");
            return Ok(active_id);
        }

        warn!(
            active_profile = %active_id,
            "Active profile not found in manifest, falling back to first profile"
        );

        if let Some(first) = manifest.profiles.first() {
            return Ok(first.id.clone());
        }

        return Err(AppError::ConfigError(
            "Profiles manifest exists but contains no profiles".into(),
        ));
    }

    let legacy_db = app_dir.join("rl_stats.db");
    let default_db = get_db_path_for_profile(app_dir, "default");

    if legacy_db.exists() {
        info!("Migrating legacy database to default profile");
        fs::rename(&legacy_db, &default_db)?;
    } else {
        // If no local legacy DB, search sibling directories (Tauri identifier may have changed).
        let _ = try_migrate_from_legacy(app_dir)?;
    }

    let default_profile = Profile {
        id: "default".to_string(),
        name: "Default".to_string(),
        created_at: Utc::now().to_rfc3339(),
        player_name: None,
        local_primary_id: None,
    };

    let manifest = ProfilesManifest {
        profiles: vec![default_profile],
        active_profile_id: "default".to_string(),
    };

    write_manifest(&manifest_path, &manifest)?;
    info!("Created default profile");

    Ok("default".to_string())
}

/// Lists all profiles.
pub fn list_profiles(app_dir: &Path) -> AppResult<Vec<Profile>> {
    let manifest_path = get_profiles_manifest_path(app_dir);
    let manifest = read_manifest(&manifest_path)?;
    Ok(manifest.profiles)
}

/// Returns the currently active profile.
pub fn get_active_profile(app_dir: &Path) -> AppResult<Profile> {
    let manifest_path = get_profiles_manifest_path(app_dir);
    let manifest = read_manifest(&manifest_path)?;

    manifest
        .profiles
        .into_iter()
        .find(|p| p.id == manifest.active_profile_id)
        .ok_or_else(|| {
            AppError::ConfigError(format!(
                "Active profile '{}' not found",
                manifest.active_profile_id
            ))
        })
}

/// Sanitizes a user-provided name into a valid profile ID.
fn sanitize_profile_id(name: &str) -> String {
    name.to_ascii_lowercase()
        .chars()
        .map(|c| if c == ' ' { '_' } else { c })
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .collect()
}

/// Creates a new profile with the given name.
pub fn create_profile(app_dir: &Path, name: &str) -> AppResult<Profile> {
    let manifest_path = get_profiles_manifest_path(app_dir);
    let mut manifest = read_manifest(&manifest_path)?;

    let mut id = sanitize_profile_id(name);
    if id.is_empty() {
        id = "profile".to_string();
    }

    let original_id = id.clone();
    let mut counter = 1;
    while manifest.profiles.iter().any(|p| p.id == id) {
        id = format!("{}_{}", original_id, counter);
        counter += 1;
    }

    let profile = Profile {
        id: id.clone(),
        name: name.to_string(),
        created_at: Utc::now().to_rfc3339(),
        player_name: None,
        local_primary_id: None,
    };

    let db_path = get_db_path_for_profile(app_dir, &id);
    if !db_path.exists() {
        let _ = fs::File::create(&db_path)?;
        debug!(profile_id = %id, db_path = %db_path.display(), "Created empty profile database");
    }

    manifest.profiles.push(profile.clone());
    write_manifest(&manifest_path, &manifest)?;

    info!(profile_id = %id, profile_name = %name, "Created new profile");
    Ok(profile)
}

/// Deletes a profile by ID.
///
/// Prevents deleting the last profile or the currently active profile.
pub fn delete_profile(app_dir: &Path, id: &str) -> AppResult<()> {
    let manifest_path = get_profiles_manifest_path(app_dir);
    let mut manifest = read_manifest(&manifest_path)?;

    if manifest.profiles.len() <= 1 {
        return Err(AppError::ConfigError(
            "Cannot delete the last remaining profile".into(),
        ));
    }

    if manifest.active_profile_id == id {
        return Err(AppError::ConfigError(
            "Cannot delete the currently active profile".into(),
        ));
    }

    let idx = manifest
        .profiles
        .iter()
        .position(|p| p.id == id)
        .ok_or_else(|| AppError::ConfigError(format!("Profile '{}' not found", id)))?;

    let profile = manifest.profiles.remove(idx);

    let db_path = get_db_path_for_profile(app_dir, id);
    if db_path.exists() {
        fs::remove_file(&db_path)?;
        debug!(profile_id = %id, db_path = %db_path.display(), "Deleted profile database");
    } else {
        warn!(profile_id = %id, db_path = %db_path.display(), "Profile database not found for deletion");
    }

    write_manifest(&manifest_path, &manifest)?;
    info!(profile_id = %id, "Deleted profile '{}'", profile.name);

    Ok(())
}

/// Switches the active profile to the given ID.
pub fn switch_profile(app_dir: &Path, id: &str) -> AppResult<()> {
    let manifest_path = get_profiles_manifest_path(app_dir);
    let mut manifest = read_manifest(&manifest_path)?;

    if !manifest.profiles.iter().any(|p| p.id == id) {
        return Err(AppError::ConfigError(format!("Profile '{}' not found", id)));
    }

    manifest.active_profile_id = id.to_string();
    write_manifest(&manifest_path, &manifest)?;

    info!(profile_id = %id, "Switched active profile");
    Ok(())
}

/// Renames an existing profile.
pub fn rename_profile(app_dir: &Path, id: &str, new_name: &str) -> AppResult<()> {
    let manifest_path = get_profiles_manifest_path(app_dir);
    let mut manifest = read_manifest(&manifest_path)?;

    let profile = manifest
        .profiles
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| AppError::ConfigError(format!("Profile '{}' not found", id)))?;

    profile.name = new_name.to_string();
    write_manifest(&manifest_path, &manifest)?;

    info!(profile_id = %id, new_name = %new_name, "Renamed profile");
    Ok(())
}

/// Returns all profiles with their respective settings.
pub fn get_all_profile_settings(
    app_dir: &Path,
) -> AppResult<Vec<(Profile, crate::core::settings::AppSettings)>> {
    let manifest_path = get_profiles_manifest_path(app_dir);
    let manifest = read_manifest(&manifest_path)?;
    let mut result = Vec::new();

    for profile in &manifest.profiles {
        let db_path = get_db_path_for_profile(app_dir, &profile.id);
        if !db_path.exists() {
            continue;
        }
        let pool = crate::core::storage::init_storage(&db_path)?;
        let settings = crate::core::settings::get_settings(&pool)?;
        result.push((profile.clone(), settings));
    }

    Ok(result)
}

/// Finds a profile whose `local_primary_id` exactly matches the given identity.
pub fn find_profile_by_primary_id(app_dir: &Path, primary_id: &str) -> AppResult<Option<Profile>> {
    let all = get_all_profile_settings(app_dir)?;

    for (profile, settings) in &all {
        if settings.local_primary_id.as_deref() == Some(primary_id) {
            return Ok(Some(profile.clone()));
        }
    }

    Ok(None)
}

/// Finds a profile whose `local_primary_id` or `player_name` matches the given identity.
pub fn find_matching_profile(
    app_dir: &Path,
    primary_id: &str,
    player_name: &str,
) -> AppResult<Option<Profile>> {
    let all = get_all_profile_settings(app_dir)?;

    for (profile, settings) in &all {
        if let Some(ref stored_pid) = settings.local_primary_id {
            if stored_pid == primary_id {
                return Ok(Some(profile.clone()));
            }
        }
        if !player_name.is_empty()
            && !settings.player_name.trim().is_empty()
            && settings
                .player_name
                .trim()
                .eq_ignore_ascii_case(player_name.trim())
        {
            return Ok(Some(profile.clone()));
        }
    }

    Ok(None)
}

/// Updates a profile's player identity in both the manifest and its settings DB.
pub fn update_profile_player_identity(
    app_dir: &Path,
    profile_id: &str,
    primary_id: &str,
    player_name: &str,
) -> AppResult<()> {
    let manifest_path = get_profiles_manifest_path(app_dir);
    let mut manifest = read_manifest(&manifest_path)?;

    let profile = manifest
        .profiles
        .iter_mut()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| AppError::ConfigError(format!("Profile '{}' not found", profile_id)))?;

    profile.player_name = Some(player_name.to_string());
    profile.local_primary_id = Some(primary_id.to_string());

    write_manifest(&manifest_path, &manifest)?;

    let db_path = get_db_path_for_profile(app_dir, profile_id);
    if db_path.exists() {
        let pool = crate::core::storage::init_storage(&db_path)?;
        let mut settings = crate::core::settings::get_settings(&pool).unwrap_or_default();
        settings.local_primary_id = Some(primary_id.to_string());
        if !player_name.is_empty() {
            settings.player_name = player_name.to_string();
        }
        crate::core::settings::set_settings(&pool, &settings)?;
    }

    info!(profile_id = %profile_id, primary_id = %primary_id, player_name = %player_name, "Updated profile player identity");
    Ok(())
}
