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
    pub parsebot_api_key: Option<String>,
    pub parsebot_scraper_id: Option<String>,
    pub parsebot_endpoint: Option<String>,
    pub parsebot_enabled: bool,
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
            parsebot_api_key: None,
            parsebot_scraper_id: None,
            parsebot_endpoint: None,
            parsebot_enabled: false,
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
                "parsebot_api_key",
                self.parsebot_api_key.clone().unwrap_or_default(),
            ),
            (
                "parsebot_scraper_id",
                self.parsebot_scraper_id.clone().unwrap_or_default(),
            ),
            (
                "parsebot_endpoint",
                self.parsebot_endpoint.clone().unwrap_or_default(),
            ),
            ("parsebot_enabled", self.parsebot_enabled.to_string()),
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
            "parsebot_api_key" => {
                settings.parsebot_api_key = if value.is_empty() { None } else { Some(value) };
            }
            "parsebot_scraper_id" => {
                settings.parsebot_scraper_id = if value.is_empty() { None } else { Some(value) };
            }
            "parsebot_endpoint" => {
                settings.parsebot_endpoint = if value.is_empty() { None } else { Some(value) };
            }
            "parsebot_enabled" => settings.parsebot_enabled = value.parse().unwrap_or(false),
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
    let root = normalize_game_root(Path::new(game_root)).ok_or_else(|| {
        AppError::ConfigError("La ruta no contiene una instalación válida de Rocket League.".into())
    })?;

    let ini_path = root.join("TAGame/Config/DefaultStatsAPI.ini");

    if let Some(parent) = ini_path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::ConfigError(e.to_string()))?;
    }

    let existing = fs::read_to_string(&ini_path).unwrap_or_default();
    let content = merge_stats_api_config(&existing, port, 20);

    fs::write(&ini_path, content).map_err(|e| AppError::ConfigError(e.to_string()))?;

    info!(path = %ini_path.display(), "Wrote Rocket League Stats API INI");
    Ok(())
}

fn merge_stats_api_config(existing: &str, port: u16, packet_rate: u16) -> String {
    let mut lines: Vec<String> = existing.lines().map(str::to_string).collect();
    let mut in_section = false;
    let mut found_section = false;
    let mut found_port = false;
    let mut found_rate = false;

    for line in &mut lines {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_section = trimmed.eq_ignore_ascii_case("[TAGame.MatchStatsExporter_TA]");
            found_section |= in_section;
            continue;
        }
        if !in_section {
            continue;
        }
        if trimmed.to_ascii_lowercase().starts_with("port=") {
            *line = format!("Port={port}");
            found_port = true;
        } else if trimmed.to_ascii_lowercase().starts_with("packetsendrate=") {
            *line = format!("PacketSendRate={packet_rate}");
            found_rate = true;
        }
    }

    if !found_section {
        if !lines.is_empty() && !lines.last().is_some_and(String::is_empty) {
            lines.push(String::new());
        }
        lines.push("[TAGame.MatchStatsExporter_TA]".into());
        lines.push(format!("Port={port}"));
        lines.push(format!("PacketSendRate={packet_rate}"));
    } else {
        let insert_at = lines
            .iter()
            .position(|line| {
                line.trim()
                    .eq_ignore_ascii_case("[TAGame.MatchStatsExporter_TA]")
            })
            .map(|index| index + 1)
            .unwrap_or(lines.len());
        if !found_rate {
            lines.insert(insert_at, format!("PacketSendRate={packet_rate}"));
        }
        if !found_port {
            lines.insert(insert_at, format!("Port={port}"));
        }
    }

    format!("{}\n", lines.join("\n"))
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

fn normalize_game_root(path: &Path) -> Option<PathBuf> {
    let start = if path.is_file() { path.parent()? } else { path };
    start
        .ancestors()
        .take(6)
        .find(|candidate| validate_rl_installation(candidate))
        .map(Path::to_path_buf)
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
    pub source: String,
    pub configured: bool,
}

/// Extract unique Rocket League installation root paths from INI candidates.
/// Optionally filter by platform ("steam" or "epic").
/// Validates that the installation looks real by checking for the executable.
fn get_legacy_rl_installation_paths(platform_filter: Option<&str>) -> Vec<RlInstallation> {
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
            configured: valid_root
                .join("TAGame/Config/DefaultStatsAPI.ini")
                .exists(),
            path: valid_root.to_string_lossy().to_string().replace("\\", "/"),
            platform: inferred_platform.to_string(),
            valid,
            source: "known-path".into(),
        });
    }

    // Filter out completely invalid installations to clean up the UI
    // Only return ones where the executable was found
    installations.retain(|inst| inst.valid);

    // Sort by path
    installations.sort_by(|a, b| a.path.cmp(&b.path));

    installations
}

fn quoted_values(line: &str) -> Vec<&str> {
    line.split('"').skip(1).step_by(2).collect()
}

fn steam_base_paths() -> Vec<PathBuf> {
    let mut roots = vec![
        PathBuf::from("C:/Program Files (x86)/Steam"),
        PathBuf::from("C:/Program Files/Steam"),
        PathBuf::from("D:/Steam"),
        PathBuf::from("D:/SteamLibrary"),
        PathBuf::from("E:/Steam"),
        PathBuf::from("E:/SteamLibrary"),
    ];

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam") {
            if let Ok(path) = key.get_value::<String, _>("SteamPath") {
                roots.push(PathBuf::from(path));
            }
        }
    }

    roots
}

fn steam_libraries() -> Vec<PathBuf> {
    let roots = steam_base_paths();
    let mut libraries = roots.clone();
    for root in roots {
        if let Ok(text) = fs::read_to_string(root.join("steamapps/libraryfolders.vdf")) {
            for line in text.lines() {
                let values = quoted_values(line);
                if values.len() >= 2 && values[0].eq_ignore_ascii_case("path") {
                    let path = PathBuf::from(values[1].replace("\\\\", "/"));
                    if path.is_absolute() {
                        libraries.push(path);
                    }
                }
            }
        }
    }
    let mut seen = HashSet::new();
    libraries.retain(|path| seen.insert(path.to_string_lossy().to_ascii_lowercase()));
    libraries
}

fn steam_game_root(library: &Path) -> PathBuf {
    if let Ok(text) = fs::read_to_string(library.join("steamapps/appmanifest_252950.acf")) {
        for line in text.lines() {
            let values = quoted_values(line);
            if values.len() >= 2 && values[0].eq_ignore_ascii_case("installdir") {
                return library.join("steamapps/common").join(values[1]);
            }
        }
    }
    library.join("steamapps/common/rocketleague")
}

fn epic_manifest_roots() -> Vec<PathBuf> {
    let program_data = std::env::var_os("PROGRAMDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("C:/ProgramData"));
    let manifests = program_data.join("Epic/EpicGamesLauncher/Data/Manifests");
    let Ok(entries) = fs::read_dir(manifests) else {
        return Vec::new();
    };

    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("item") {
                return None;
            }
            let text = fs::read_to_string(path).ok()?;
            let manifest: serde_json::Value = serde_json::from_str(&text).ok()?;
            let name = manifest
                .get("DisplayName")
                .or_else(|| manifest.get("AppName"))
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            if !name.to_ascii_lowercase().contains("rocket league") {
                return None;
            }
            manifest
                .get("InstallLocation")
                .and_then(|value| value.as_str())
                .map(PathBuf::from)
        })
        .collect()
}

fn push_installation(
    installations: &mut Vec<RlInstallation>,
    seen: &mut HashSet<String>,
    root: PathBuf,
    platform: &str,
    source: &str,
    platform_filter: Option<&str>,
) {
    if platform_filter.is_some_and(|filter| !filter.eq_ignore_ascii_case(platform)) {
        return;
    }
    let Some(root) = normalize_game_root(&root) else {
        return;
    };
    let normalized = root.to_string_lossy().to_ascii_lowercase();
    if !seen.insert(normalized) {
        return;
    }
    installations.push(RlInstallation {
        configured: root.join("TAGame/Config/DefaultStatsAPI.ini").exists(),
        path: root.to_string_lossy().replace('\\', "/"),
        platform: platform.into(),
        valid: true,
        source: source.into(),
    });
}

pub fn get_rl_installation_paths(platform_filter: Option<&str>) -> Vec<RlInstallation> {
    let mut installations = get_legacy_rl_installation_paths(platform_filter);
    let mut seen: HashSet<String> = installations
        .iter()
        .map(|installation| installation.path.to_ascii_lowercase())
        .collect();

    for library in steam_libraries() {
        push_installation(
            &mut installations,
            &mut seen,
            steam_game_root(&library),
            "steam",
            "steam-manifest",
            platform_filter,
        );
    }
    for root in epic_manifest_roots() {
        push_installation(
            &mut installations,
            &mut seen,
            root,
            "epic",
            "epic-manifest",
            platform_filter,
        );
    }

    installations.sort_by(|left, right| {
        right
            .configured
            .cmp(&left.configured)
            .then_with(|| left.path.cmp(&right.path))
    });
    installations
}

pub fn inspect_rl_installation(path: &str, platform: Option<&str>) -> AppResult<RlInstallation> {
    let root = normalize_game_root(Path::new(path)).ok_or_else(|| {
        AppError::ConfigError("No encontramos RocketLeague.exe dentro de esa carpeta.".into())
    })?;
    let platform = platform.unwrap_or_else(|| {
        if root
            .to_string_lossy()
            .to_ascii_lowercase()
            .contains("steam")
        {
            "steam"
        } else {
            "epic"
        }
    });
    Ok(RlInstallation {
        configured: root.join("TAGame/Config/DefaultStatsAPI.ini").exists(),
        path: root.to_string_lossy().replace('\\', "/"),
        platform: platform.into(),
        valid: true,
        source: "manual".into(),
    })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DetectedAccount {
    pub primary_id: String,
    pub platform: String,
    pub display_name: String,
    pub account_name: String,
    pub active: bool,
    pub source: String,
}

fn parse_steam_loginusers(text: &str, active_account_id: Option<u32>) -> Vec<DetectedAccount> {
    const STEAM_ID_BASE: u64 = 76_561_197_960_265_728;
    let mut accounts = Vec::new();
    let mut current_id: Option<u64> = None;
    let mut display_name = String::new();
    let mut account_name = String::new();
    let mut most_recent = false;

    let flush = |accounts: &mut Vec<DetectedAccount>,
                 current_id: &mut Option<u64>,
                 display_name: &mut String,
                 account_name: &mut String,
                 most_recent: &mut bool| {
        if let Some(steam_id) = current_id.take() {
            let account_id = steam_id.saturating_sub(STEAM_ID_BASE) as u32;
            accounts.push(DetectedAccount {
                primary_id: format!("Steam|{steam_id}|0"),
                platform: "steam".into(),
                display_name: if display_name.is_empty() {
                    account_name.clone()
                } else {
                    display_name.clone()
                },
                account_name: account_name.clone(),
                active: active_account_id == Some(account_id) || *most_recent,
                source: "steam-loginusers".into(),
            });
        }
        display_name.clear();
        account_name.clear();
        *most_recent = false;
    };

    for line in text.lines() {
        let values = quoted_values(line);
        if values.len() == 1
            && values[0].len() >= 16
            && values[0]
                .chars()
                .all(|character| character.is_ascii_digit())
        {
            flush(
                &mut accounts,
                &mut current_id,
                &mut display_name,
                &mut account_name,
                &mut most_recent,
            );
            current_id = values[0].parse().ok();
        } else if values.len() >= 2 {
            match values[0].to_ascii_lowercase().as_str() {
                "personaname" => display_name = values[1].into(),
                "accountname" => account_name = values[1].into(),
                "mostrecent" => most_recent = values[1] == "1",
                _ => {}
            }
        }
    }
    flush(
        &mut accounts,
        &mut current_id,
        &mut display_name,
        &mut account_name,
        &mut most_recent,
    );
    accounts.sort_by_key(|account| !account.active);
    accounts
}

pub fn detect_local_accounts() -> Vec<DetectedAccount> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        let Ok(steam) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam")
        else {
            return Vec::new();
        };
        let steam_path = steam.get_value::<String, _>("SteamPath").ok();
        let active_user = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey("Software\\Valve\\Steam\\ActiveProcess")
            .ok()
            .and_then(|key| key.get_value::<u32, _>("ActiveUser").ok())
            .filter(|id| *id != 0);
        if let Some(path) = steam_path {
            if let Ok(text) = fs::read_to_string(PathBuf::from(path).join("config/loginusers.vdf"))
            {
                return parse_steam_loginusers(&text, active_user);
            }
        }
    }
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::{merge_stats_api_config, parse_steam_loginusers};

    #[test]
    fn merges_stats_config_without_removing_other_values() {
        let input = "[Other]\nEnabled=True\n\n[TAGame.MatchStatsExporter_TA]\nPort=1\n";
        let merged = merge_stats_api_config(input, 49_123, 20);
        assert!(merged.contains("[Other]\nEnabled=True"));
        assert!(merged.contains("Port=49123"));
        assert!(merged.contains("PacketSendRate=20"));
    }

    #[test]
    fn parses_and_prioritizes_active_steam_account() {
        let input = "\"users\"\n{\n\"76561198313604674\"\n{\n\"AccountName\" \"login\"\n\"PersonaName\" \"Si Locura\"\n\"MostRecent\" \"1\"\n}\n}";
        let accounts = parse_steam_loginusers(input, Some(353_338_946));
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].display_name, "Si Locura");
        assert!(accounts[0].active);
    }
}
