use crate::core::storage::DbPool;
use crate::error::{AppError, AppResult};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::info;

/// Application settings persisted in the database.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub player_name: String,
    pub local_primary_id: Option<String>,
    pub auto_start: bool,
    pub port: u16,
    pub data_retention_days: i32,
    pub rl_path: Option<String>,
    pub platform: Option<String>,
    pub theme: String,
    pub language: String,
    pub default_match_type: Option<String>,
    pub tracker_api_key: Option<String>,
    pub tracker_platform: Option<String>,
    pub tracker_username: Option<String>,
    pub rapidapi_key: Option<String>,
    pub rapidapi_enabled: bool,
    pub tracker_auto_refresh: bool,
    pub tracker_refresh_interval_min: u32,
    pub session_gap_minutes: u32,
    pub kickoff_goal_threshold_seconds: i32,
    // ─── Overlay window settings ─────────────────────────────────────────
    pub overlay_enabled: bool,
    pub overlay_opacity: f64,
    pub overlay_position_x: i32,
    pub overlay_position_y: i32,
    pub overlay_width: i32,
    pub overlay_height: i32,
    pub overlay_show_score: bool,
    pub overlay_show_players: bool,
    pub overlay_show_stats: bool,
    pub overlay_show_timer: bool,
    pub overlay_font_scale: String,
    pub overlay_clickthrough: bool,
    pub overlay_player_scope: String,
    pub overlay_show_names: bool,
    pub overlay_show_player_score: bool,
    pub overlay_show_boost: bool,
    pub overlay_show_mmr: bool,
    pub overlay_show_speed: bool,
    pub game_running: bool,
    pub warn_on_profile_mismatch: bool,
    pub auto_switch_profile_on_exact_match: bool,
    pub auto_sync_on_match_end: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            player_name: String::new(),
            local_primary_id: None,
            auto_start: true,
            port: 49123,
            data_retention_days: 90,
            rl_path: None,
            platform: None,
            theme: "dark".to_string(),
            language: "es".to_string(),
            default_match_type: Some("ranked".to_string()),
            tracker_api_key: None,
            tracker_platform: None,
            tracker_username: None,
            rapidapi_key: None,
            rapidapi_enabled: false,
            tracker_auto_refresh: true,
            tracker_refresh_interval_min: 5,
            session_gap_minutes: 30,
            kickoff_goal_threshold_seconds: 7,
            overlay_enabled: false,
            overlay_opacity: 0.75,
            overlay_position_x: 40,
            overlay_position_y: 80,
            overlay_width: 420,
            overlay_height: 320,
            overlay_show_score: true,
            overlay_show_players: true,
            overlay_show_stats: true,
            overlay_show_timer: true,
            overlay_font_scale: "medium".to_string(),
            overlay_clickthrough: true,
            overlay_player_scope: "all".to_string(),
            overlay_show_names: true,
            overlay_show_player_score: true,
            overlay_show_boost: false,
            overlay_show_mmr: false,
            overlay_show_speed: false,
            game_running: false,
            warn_on_profile_mismatch: true,
            auto_switch_profile_on_exact_match: false,
            auto_sync_on_match_end: true,
        }
    }
}

impl AppSettings {
    fn to_kv(&self) -> Vec<(&str, String)> {
        vec![
            ("player_name", self.player_name.clone()),
            (
                "local_primary_id",
                self.local_primary_id.clone().unwrap_or_default(),
            ),
            ("auto_start", self.auto_start.to_string()),
            ("port", self.port.to_string()),
            ("data_retention_days", self.data_retention_days.to_string()),
            ("rl_path", self.rl_path.clone().unwrap_or_default()),
            ("platform", self.platform.clone().unwrap_or_default()),
            ("theme", self.theme.clone()),
            ("language", self.language.clone()),
            (
                "default_match_type",
                self.default_match_type.clone().unwrap_or_default(),
            ),
            (
                "tracker_api_key",
                self.tracker_api_key.clone().unwrap_or_default(),
            ),
            (
                "tracker_platform",
                self.tracker_platform.clone().unwrap_or_default(),
            ),
            (
                "tracker_username",
                self.tracker_username.clone().unwrap_or_default(),
            ),
            (
                "rapidapi_key",
                self.rapidapi_key.clone().unwrap_or_default(),
            ),
            ("rapidapi_enabled", self.rapidapi_enabled.to_string()),
            (
                "tracker_auto_refresh",
                self.tracker_auto_refresh.to_string(),
            ),
            (
                "tracker_refresh_interval_min",
                self.tracker_refresh_interval_min.to_string(),
            ),
            ("session_gap_minutes", self.session_gap_minutes.to_string()),
            (
                "kickoff_goal_threshold_seconds",
                self.kickoff_goal_threshold_seconds.to_string(),
            ),
            ("overlay_enabled", self.overlay_enabled.to_string()),
            ("overlay_opacity", self.overlay_opacity.to_string()),
            ("overlay_position_x", self.overlay_position_x.to_string()),
            ("overlay_position_y", self.overlay_position_y.to_string()),
            ("overlay_width", self.overlay_width.to_string()),
            ("overlay_height", self.overlay_height.to_string()),
            ("overlay_show_score", self.overlay_show_score.to_string()),
            (
                "overlay_show_players",
                self.overlay_show_players.to_string(),
            ),
            ("overlay_show_stats", self.overlay_show_stats.to_string()),
            ("overlay_show_timer", self.overlay_show_timer.to_string()),
            ("overlay_font_scale", self.overlay_font_scale.clone()),
            (
                "overlay_clickthrough",
                self.overlay_clickthrough.to_string(),
            ),
            ("overlay_player_scope", self.overlay_player_scope.clone()),
            ("overlay_show_names", self.overlay_show_names.to_string()),
            (
                "overlay_show_player_score",
                self.overlay_show_player_score.to_string(),
            ),
            ("overlay_show_boost", self.overlay_show_boost.to_string()),
            ("overlay_show_mmr", self.overlay_show_mmr.to_string()),
            ("overlay_show_speed", self.overlay_show_speed.to_string()),
            ("game_running", self.game_running.to_string()),
            (
                "warn_on_profile_mismatch",
                self.warn_on_profile_mismatch.to_string(),
            ),
            (
                "auto_switch_profile_on_exact_match",
                self.auto_switch_profile_on_exact_match.to_string(),
            ),
            (
                "auto_sync_on_match_end",
                self.auto_sync_on_match_end.to_string(),
            ),
        ]
    }
}

/// Load settings from the database, returning defaults if none exist.
pub fn get_settings(pool: &DbPool) -> AppResult<AppSettings> {
    let conn = pool
        .get()
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    let mut settings = AppSettings::default();

    let mut stmt = conn
        .prepare("SELECT key, value FROM app_settings")
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            let key: String = row.get(0)?;
            let value: String = row.get(1)?;
            Ok((key, value))
        })
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    for row in rows {
        let (key, value) = row.map_err(|e| AppError::StorageError(e.to_string()))?;
        match key.as_str() {
            "player_name" => settings.player_name = value,
            "local_primary_id" => {
                settings.local_primary_id = if value.is_empty() { None } else { Some(value) };
            }
            "auto_start" => settings.auto_start = value.parse().unwrap_or(true),
            "port" => settings.port = value.parse().unwrap_or(49123),
            "data_retention_days" => settings.data_retention_days = value.parse().unwrap_or(90),
            "rl_path" => {
                settings.rl_path = if value.is_empty() { None } else { Some(value) };
            }
            "platform" => {
                settings.platform = if value.is_empty() { None } else { Some(value) };
            }
            "theme" => settings.theme = value,
            "language" => settings.language = value,
            "default_match_type" => {
                settings.default_match_type = if value.is_empty() { None } else { Some(value) };
            }
            "tracker_api_key" => {
                settings.tracker_api_key = if value.is_empty() { None } else { Some(value) };
            }
            "tracker_platform" => {
                settings.tracker_platform = if value.is_empty() { None } else { Some(value) };
            }
            "tracker_username" => {
                settings.tracker_username = if value.is_empty() { None } else { Some(value) };
            }
            "rapidapi_key" => {
                settings.rapidapi_key = if value.is_empty() { None } else { Some(value) };
            }
            "rapidapi_enabled" => settings.rapidapi_enabled = value.parse().unwrap_or(false),
            "tracker_auto_refresh" => settings.tracker_auto_refresh = value.parse().unwrap_or(true),
            "tracker_refresh_interval_min" => {
                settings.tracker_refresh_interval_min = value.parse().unwrap_or(5)
            }
            "session_gap_minutes" => settings.session_gap_minutes = value.parse().unwrap_or(30),
            "kickoff_goal_threshold_seconds" => {
                settings.kickoff_goal_threshold_seconds = value.parse().unwrap_or(7)
            }
            "overlay_enabled" => settings.overlay_enabled = value.parse().unwrap_or(false),
            "overlay_opacity" => settings.overlay_opacity = value.parse::<f64>().unwrap_or(0.75),
            "overlay_position_x" => settings.overlay_position_x = value.parse().unwrap_or(40),
            "overlay_position_y" => settings.overlay_position_y = value.parse().unwrap_or(80),
            "overlay_width" => settings.overlay_width = value.parse().unwrap_or(420),
            "overlay_height" => settings.overlay_height = value.parse().unwrap_or(320),
            "overlay_show_score" => settings.overlay_show_score = value.parse().unwrap_or(true),
            "overlay_show_players" => settings.overlay_show_players = value.parse().unwrap_or(true),
            "overlay_show_stats" => settings.overlay_show_stats = value.parse().unwrap_or(true),
            "overlay_show_timer" => settings.overlay_show_timer = value.parse().unwrap_or(true),
            "overlay_font_scale" => settings.overlay_font_scale = value,
            "overlay_clickthrough" => settings.overlay_clickthrough = value.parse().unwrap_or(true),
            "overlay_player_scope" => settings.overlay_player_scope = value,
            "overlay_show_names" => settings.overlay_show_names = value.parse().unwrap_or(true),
            "overlay_show_player_score" => {
                settings.overlay_show_player_score = value.parse().unwrap_or(true)
            }
            "overlay_show_boost" => settings.overlay_show_boost = value.parse().unwrap_or(false),
            "overlay_show_mmr" => settings.overlay_show_mmr = value.parse().unwrap_or(false),
            "overlay_show_speed" => settings.overlay_show_speed = value.parse().unwrap_or(false),
            "game_running" => settings.game_running = value.parse().unwrap_or(false),
            "warn_on_profile_mismatch" => {
                settings.warn_on_profile_mismatch = value.parse().unwrap_or(true)
            }
            "auto_switch_profile_on_exact_match" => {
                settings.auto_switch_profile_on_exact_match = value.parse().unwrap_or(false)
            }
            "auto_sync_on_match_end" => {
                settings.auto_sync_on_match_end = value.parse().unwrap_or(true)
            }
            _ => {}
        }
    }

    Ok(settings)
}

/// Save settings to the database.
pub fn set_settings(pool: &DbPool, settings: &AppSettings) -> AppResult<()> {
    let conn = pool
        .get()
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    for (key, value) in settings.to_kv() {
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    }

    crate::core::storage::sync::enqueue_upsert_conn(
        &conn,
        "app_settings",
        "all",
        serde_json::to_value(settings)
            .map_err(|e| AppError::ParseError(format!("Failed to serialize settings: {e}")))?,
    )?;

    info!("Settings saved");
    Ok(())
}

pub fn configure_rl_ini(game_root: &str, port: u16) -> AppResult<()> {
    let root = PathBuf::from(game_root);
    if !root.exists() {
        return Err(AppError::ConfigError("La ruta del juego no existe.".into()));
    }

    let ini_path = root.join("TAGame/Config/DefaultStatsAPI.ini");

    if let Some(parent) = ini_path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::ConfigError(e.to_string()))?;
    }

    let content = format!(
        "[TAGame.MatchStatsExporter_TA]\n\n; Port the client will listen for connections on\nPort={}\n\n; How many times per second the game sends the update state (capped at 120, 0 disables this feature)\nPacketSendRate=60\n",
        port
    );

    fs::write(&ini_path, content).map_err(|e| AppError::ConfigError(e.to_string()))?;

    info!(path = %ini_path.display(), "Wrote Rocket League Stats API INI");
    Ok(())
}

/// Find all candidate paths for DefaultStatsAPI.ini across known Steam/Epic installations.
/// This is intentionally fast: only checks known paths + Steam libraryfolders.vdf.
fn find_rl_ini_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    // Discover Steam library folders from libraryfolders.vdf
    let mut steam_root_candidates: Vec<PathBuf> = vec![
        PathBuf::from("C:/Program Files (x86)/Steam"),
        PathBuf::from("C:/Program Files/Steam"),
        PathBuf::from("D:/Steam"),
        PathBuf::from("D:/SteamLibrary"),
        PathBuf::from("E:/Steam"),
        PathBuf::from("E:/SteamLibrary"),
    ];
    if let Some(data_dir) = dirs::data_dir() {
        steam_root_candidates.push(data_dir.join("Steam"));
    }

    for steam_root in &steam_root_candidates {
        let vdf = steam_root.join("steamapps/libraryfolders.vdf");
        if vdf.exists() {
            if let Ok(text) = fs::read_to_string(&vdf) {
                for line in text.lines() {
                    let trimmed = line.trim();
                    // Match line like: "path"		"A:\\SteamLibrary"
                    if trimmed.starts_with("\"path\"") {
                        let parts: Vec<&str> = trimmed.split('"').collect();
                        if parts.len() >= 4 {
                            let path_str = parts[3];
                            let path = PathBuf::from(path_str.replace("\\\\", "/"));
                            if path.is_absolute() {
                                candidates.push(path.join("steamapps/common/rocketleague/TAGame/Config/DefaultStatsAPI.ini"));
                            }
                        }
                    }
                }
            }
        }

        // Always include the default steamapps/common under this root
        candidates.push(
            steam_root.join("steamapps/common/rocketleague/TAGame/Config/DefaultStatsAPI.ini"),
        );
    }

    // Epic Games common paths
    let epic_candidates = [
        "C:/Program Files/Epic Games/RocketLeague/TAGame/Config/DefaultStatsAPI.ini",
        "C:/Program Files/Epic Games/Rocket League/TAGame/Config/DefaultStatsAPI.ini",
        "D:/Epic Games/RocketLeague/TAGame/Config/DefaultStatsAPI.ini",
        "D:/Epic Games/Rocket League/TAGame/Config/DefaultStatsAPI.ini",
        "E:/Epic Games/RocketLeague/TAGame/Config/DefaultStatsAPI.ini",
        "E:/Epic Games/Rocket League/TAGame/Config/DefaultStatsAPI.ini",
    ];
    for path in &epic_candidates {
        candidates.push(PathBuf::from(path));
    }

    // Remove duplicates while preserving order
    let mut seen = std::collections::HashSet::new();
    candidates.retain(|p| seen.insert(p.clone()));

    candidates
}

/// Check if a discovered path actually looks like a valid Rocket League installation
/// by verifying the executable exists.
fn validate_rl_installation(game_root: &Path) -> bool {
    // Common executable locations
    let exe_candidates = [
        game_root.join("RocketLeague.exe"),
        game_root.join("Binaries/Win64/RocketLeague.exe"),
    ];
    exe_candidates.iter().any(|p| p.exists())
}

/// Given a path like ".../rocketleague/TAGame/Config/DefaultStatsAPI.ini",
/// return the game root directory (e.g., ".../rocketleague").
fn extract_game_root(ini_path: &Path) -> Option<PathBuf> {
    let mut current = ini_path.to_path_buf();

    // Walk up 3 levels: file -> Config -> TAGame -> game root
    current = current.parent()?.to_path_buf();
    current = current.parent()?.to_path_buf();
    current = current.parent()?.to_path_buf();

    Some(current)
}

/// Detected installation info returned to the frontend.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RlInstallation {
    pub path: String,
    pub platform: String, // "steam" or "epic"
    pub valid: bool,
}

/// Extract unique Rocket League installation root paths from INI candidates.
/// Optionally filter by platform ("steam" or "epic").
/// Validates that the installation looks real by checking for the executable.
pub fn get_rl_installation_paths(platform_filter: Option<&str>) -> Vec<RlInstallation> {
    let mut seen = HashSet::new();
    let mut installations = Vec::new();

    for ini_path in find_rl_ini_candidates() {
        let Some(root) = extract_game_root(&ini_path) else {
            continue;
        };

        // If the game root doesn't exist on disk, don't even return it.
        // This stops garbage paths from cluttering the UI.
        if !root.exists() {
            continue;
        }

        let normalized = root.to_string_lossy().to_string().to_ascii_lowercase();
        if !seen.insert(normalized.clone()) {
            continue;
        }

        // Infer platform from path
        let path_lower = root.to_string_lossy().to_ascii_lowercase();
        let inferred_platform = if path_lower.contains("epic") {
            "epic"
        } else {
            "steam"
        };

        // Apply platform filter if provided
        if let Some(filter) = platform_filter {
            if filter.to_ascii_lowercase() != inferred_platform {
                continue;
            }
        }

        let valid_root = root.clone();

        // Si es una ruta configurada desde Documents/OneDrive, intentamos derivar
        // donde está realmente el juego basándonos en si el ejecutable existe,
        // pero esto normalmente falla porque los documentos no contienen el .exe.
        // Así que usamos nuestro validador.
        let valid = validate_rl_installation(&valid_root);

        // Si la validación falla y la ruta contiene "Documents" o "OneDrive",
        // significa que extrajimos "My Games/Rocket League" como game root,
        // pero el ejecutable obviamente no está ahí. En este caso no es una
        // instalación real del juego que podamos reportar como válida.
        if !valid
            && (valid_root.to_string_lossy().contains("Documents")
                || valid_root.to_string_lossy().contains("OneDrive"))
        {
            continue;
        }

        installations.push(RlInstallation {
            path: valid_root.to_string_lossy().to_string().replace("\\", "/"),
            platform: inferred_platform.to_string(),
            valid,
        });
    }

    // Filter out completely invalid installations to clean up the UI
    // Only return ones where the executable was found
    installations.retain(|inst| inst.valid);

    // Sort by path
    installations.sort_by(|a, b| a.path.cmp(&b.path));

    installations
}
