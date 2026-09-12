//! Read-only access to previously cached RLStats profiles.
//!
//! All live rlstats.net lookups go through the embedded WebView2 scraper
//! (`core/mmr/webview.rs`): the old plain-HTTP `RlstatsClient` could not clear
//! Cloudflare and its automated traffic was flagging the user's IP. This module
//! only serves whatever is already in the local cache.

use crate::core::settings::get_settings;
use crate::core::storage;
use crate::core::tracker_api::TrackerProfile;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_cached_rlstats_profile(
    state: State<'_, AppState>,
) -> Result<Option<TrackerProfile>, String> {
    let pool = &state.db_pool;
    let settings = get_settings(pool).map_err(|e| e.to_string())?;

    let platform = match settings.tracker_platform.clone() {
        Some(p) => p,
        None => return Ok(None),
    };

    let username = match settings.tracker_username.clone() {
        Some(u) => u,
        None => return Ok(None),
    };

    let cached =
        storage::get_rlstats_cache(pool, &platform, &username).map_err(|e| e.to_string())?;

    match cached {
        Some((profile_json, _fetched_at)) => {
            let profile: TrackerProfile = serde_json::from_str(&profile_json)
                .map_err(|e| format!("Failed to deserialize cached profile: {e}"))?;
            Ok(Some(profile))
        }
        None => Ok(None),
    }
}
