import {
  type AppSettings,
  type DetectedAccount,
  type InstallSyncResult,
  type MatchType,
  type Profile,
  type RlInstallation,
  type StorageStats,
} from "../types";
import { invokeCommand } from "./core";

interface RawAppSettings {
  player_name: string;
  local_primary_id?: string | null;
  auto_start: boolean;
  port: number;
  data_retention_days: number;
  rl_path?: string | null;
  rl_paths?: string[];
  platform?: string | null;
  active_platform?: string | null;
  theme?: string;
  language?: string;
  default_match_type?: string | null;
  tracker_api_key?: string | null;
  tracker_platform?: string | null;
  tracker_username?: string | null;
  rapidapi_key?: string | null;
  rapidapi_enabled?: boolean;
  parsebot_api_key?: string | null;
  parsebot_scraper_id?: string | null;
  parsebot_endpoint?: string | null;
  parsebot_enabled?: boolean;
  mmr_scraper_enabled?: boolean;
  tracker_auto_refresh?: boolean;
  tracker_refresh_interval_min?: number;
  session_gap_minutes?: number;
  kickoff_goal_threshold_seconds?: number;
  overlay_enabled?: boolean;
  overlay_opacity?: number;
  overlay_position_x?: number;
  overlay_position_y?: number;
  overlay_width?: number;
  overlay_height?: number;
  overlay_show_score?: boolean;
  overlay_show_players?: boolean;
  overlay_show_stats?: boolean;
  overlay_show_timer?: boolean;
  overlay_font_scale?: string;
  overlay_clickthrough?: boolean;
  overlay_player_scope?: string;
  overlay_show_names?: boolean;
  overlay_show_player_score?: boolean;
  overlay_show_boost?: boolean;
  overlay_show_mmr?: boolean;
  overlay_show_speed?: boolean;
  overlay_server_enabled?: boolean;
  overlay_server_port?: number;
  game_running?: boolean;
  warn_on_profile_mismatch?: boolean;
  auto_switch_profile_on_exact_match?: boolean;
  auto_sync_on_match_end?: boolean;
  prompt_focus_enabled?: boolean;
  prompt_timeout_secs?: number;
  prompt_only_when_game_running?: boolean;
  training_tracking_enabled?: boolean;
  weekly_goal_matches?: number;
  weekly_goal_wins?: number;
}

interface RawStorageStats {
  total_matches?: number;
  totalMatches?: number;
  total_events?: number;
  totalEvents?: number;
  database_size_bytes?: number;
  databaseSizeBytes?: number;
  oldest_match_date?: number | null;
  oldestMatchDate?: number | null;
  db_path?: string | null;
  dbPath?: string | null;
}

// Settings
export async function getSettings(): Promise<AppSettings> {
  const settings = await invokeCommand<RawAppSettings>("get_settings_cmd");
  return {
    playerName: settings.player_name,
    localPrimaryId: settings.local_primary_id ?? null,
    autoStart: settings.auto_start,
    port: settings.port ?? 49123,
    dataRetentionDays: settings.data_retention_days ?? 90,
    theme: settings.theme ?? "dark",
    language: settings.language ?? "es",
    rlPath: settings.rl_path ?? null,
    rlPaths: settings.rl_paths ?? (settings.rl_path ? [settings.rl_path] : []),
    platform:
      settings.platform === "epic"
        ? "epic"
        : settings.platform === "steam"
          ? "steam"
          : null,
    activePlatform:
      settings.active_platform === "epic"
        ? "epic"
        : settings.active_platform === "steam"
          ? "steam"
          : null,
    defaultMatchType: (settings.default_match_type as MatchType) ?? "ranked",
    trackerApiKey: settings.tracker_api_key ?? null,
    trackerPlatform: settings.tracker_platform ?? null,
    trackerUsername: settings.tracker_username ?? null,
    rapidApiKey: settings.rapidapi_key ?? null,
    rapidApiEnabled: settings.rapidapi_enabled ?? false,
    parsebotApiKey: settings.parsebot_api_key ?? null,
    parsebotScraperId: settings.parsebot_scraper_id ?? null,
    parsebotEndpoint: settings.parsebot_endpoint ?? null,
    parsebotEnabled: settings.parsebot_enabled ?? false,
    mmrScraperEnabled: settings.mmr_scraper_enabled ?? false,
    trackerAutoRefresh: settings.tracker_auto_refresh ?? true,
    trackerRefreshIntervalMin: settings.tracker_refresh_interval_min ?? 5,
    sessionGapMinutes: settings.session_gap_minutes ?? 30,
    kickoffGoalThresholdSeconds: settings.kickoff_goal_threshold_seconds ?? 7,
    overlayEnabled: settings.overlay_enabled ?? false,
    overlayOpacity: settings.overlay_opacity ?? 0.75,
    overlayPositionX: settings.overlay_position_x ?? 40,
    overlayPositionY: settings.overlay_position_y ?? 80,
    overlayWidth: settings.overlay_width ?? 420,
    overlayHeight: settings.overlay_height ?? 320,
    overlayShowScore: settings.overlay_show_score ?? true,
    overlayShowPlayers: settings.overlay_show_players ?? true,
    overlayShowStats: settings.overlay_show_stats ?? true,
    overlayShowTimer: settings.overlay_show_timer ?? true,
    overlayFontScale: settings.overlay_font_scale ?? "medium",
    overlayClickthrough: settings.overlay_clickthrough ?? true,
    overlayPlayerScope: (settings.overlay_player_scope ?? "all") as
      | "all"
      | "team",
    overlayShowNames: settings.overlay_show_names ?? true,
    overlayShowPlayerScore: settings.overlay_show_player_score ?? true,
    overlayShowBoost: settings.overlay_show_boost ?? false,
    overlayShowMmr: settings.overlay_show_mmr ?? false,
    overlayShowSpeed: settings.overlay_show_speed ?? false,
    overlayServerEnabled: settings.overlay_server_enabled ?? false,
    overlayServerPort: settings.overlay_server_port ?? 9528,
    gameRunning: settings.game_running ?? false,
    warnOnProfileMismatch: settings.warn_on_profile_mismatch ?? true,
    autoSwitchProfileOnExactMatch:
      settings.auto_switch_profile_on_exact_match ?? false,
    autoSyncOnMatchEnd: settings.auto_sync_on_match_end ?? true,
    promptFocusEnabled: settings.prompt_focus_enabled ?? false,
    promptTimeoutSecs: settings.prompt_timeout_secs ?? 30,
    promptOnlyWhenGameRunning: settings.prompt_only_when_game_running ?? true,
    trainingTrackingEnabled: settings.training_tracking_enabled ?? true,
    weeklyGoalMatches: settings.weekly_goal_matches ?? 0,
    weeklyGoalWins: settings.weekly_goal_wins ?? 0,
  };
}

export async function setSettings(settings: AppSettings): Promise<void> {
  return invokeCommand<void>("set_settings_cmd", {
    settings: {
      player_name: settings.playerName ?? "",
      local_primary_id: settings.localPrimaryId ?? null,
      auto_start: settings.autoStart,
      port: settings.port ?? 49123,
      data_retention_days: settings.dataRetentionDays ?? 90,
      rl_path: settings.rlPath ?? null,
      rl_paths: settings.rlPaths ?? [],
      platform: settings.platform ?? null,
      active_platform: settings.activePlatform ?? null,
      theme: settings.theme ?? "dark",
      language: settings.language ?? "es",
      default_match_type: settings.defaultMatchType,
      tracker_api_key: settings.trackerApiKey ?? null,
      tracker_platform: settings.trackerPlatform ?? null,
      tracker_username: settings.trackerUsername ?? null,
      rapidapi_key: settings.rapidApiKey ?? null,
      rapidapi_enabled: settings.rapidApiEnabled ?? false,
      parsebot_api_key: settings.parsebotApiKey ?? null,
      parsebot_scraper_id: settings.parsebotScraperId ?? null,
      parsebot_endpoint: settings.parsebotEndpoint ?? null,
      parsebot_enabled: settings.parsebotEnabled ?? false,
      mmr_scraper_enabled: settings.mmrScraperEnabled ?? false,
      tracker_auto_refresh: settings.trackerAutoRefresh ?? true,
      tracker_refresh_interval_min: settings.trackerRefreshIntervalMin ?? 5,
      session_gap_minutes: settings.sessionGapMinutes ?? 30,
      kickoff_goal_threshold_seconds: settings.kickoffGoalThresholdSeconds ?? 7,
      overlay_enabled: settings.overlayEnabled ?? false,
      overlay_opacity: settings.overlayOpacity ?? 0.75,
      overlay_position_x: settings.overlayPositionX ?? 40,
      overlay_position_y: settings.overlayPositionY ?? 80,
      overlay_width: settings.overlayWidth ?? 420,
      overlay_height: settings.overlayHeight ?? 320,
      overlay_show_score: settings.overlayShowScore ?? true,
      overlay_show_players: settings.overlayShowPlayers ?? true,
      overlay_show_stats: settings.overlayShowStats ?? true,
      overlay_show_timer: settings.overlayShowTimer ?? true,
      overlay_font_scale: settings.overlayFontScale ?? "medium",
      overlay_clickthrough: settings.overlayClickthrough ?? true,
      overlay_player_scope: settings.overlayPlayerScope ?? "all",
      overlay_show_names: settings.overlayShowNames ?? true,
      overlay_show_player_score: settings.overlayShowPlayerScore ?? true,
      overlay_show_boost: settings.overlayShowBoost ?? false,
      overlay_show_mmr: settings.overlayShowMmr ?? false,
      overlay_show_speed: settings.overlayShowSpeed ?? false,
      overlay_server_enabled: settings.overlayServerEnabled ?? false,
      overlay_server_port: settings.overlayServerPort ?? 9528,
      game_running: settings.gameRunning ?? false,
      warn_on_profile_mismatch: settings.warnOnProfileMismatch ?? true,
      auto_switch_profile_on_exact_match:
        settings.autoSwitchProfileOnExactMatch ?? false,
      auto_sync_on_match_end: settings.autoSyncOnMatchEnd ?? true,
      prompt_focus_enabled: settings.promptFocusEnabled ?? false,
      prompt_timeout_secs: settings.promptTimeoutSecs ?? 30,
      prompt_only_when_game_running: settings.promptOnlyWhenGameRunning ?? true,
      training_tracking_enabled: settings.trainingTrackingEnabled ?? true,
      weekly_goal_matches: settings.weeklyGoalMatches ?? 0,
      weekly_goal_wins: settings.weeklyGoalWins ?? 0,
    },
  });
}

export async function configureRlIni(
  path: string,
  port?: number,
): Promise<void> {
  return invokeCommand<void>("configure_rl_ini_cmd", {
    path,
    port: port ?? 49123,
  });
}

export async function configureRlIniAll(
  paths: string[],
  port?: number,
): Promise<string[]> {
  return invokeCommand<string[]>("configure_rl_ini_all_cmd", {
    paths,
    port: port ?? 49123,
  });
}

export async function syncRlInstallations(): Promise<InstallSyncResult> {
  return invokeCommand<InstallSyncResult>("sync_rl_installations_cmd");
}

export async function detectRlPath(
  platform?: "steam" | "epic" | null,
): Promise<RlInstallation[]> {
  return invokeCommand<RlInstallation[]>("detect_rl_path", { platform });
}

export async function inspectRlPath(
  path: string,
  platform?: "steam" | "epic" | null,
): Promise<RlInstallation> {
  return invokeCommand<RlInstallation>("inspect_rl_path", { path, platform });
}

export async function detectLocalAccounts(): Promise<DetectedAccount[]> {
  return invokeCommand<DetectedAccount[]>("detect_local_accounts_cmd");
}

export async function reportFrontendError(
  message: string,
  stack?: string,
): Promise<void> {
  return invokeCommand<void>("report_frontend_error", {
    message,
    stack: stack ?? null,
  });
}

export async function exportDataJson(): Promise<string> {
  return invokeCommand<string>("export_data_json");
}

export async function importDataJson(content: string): Promise<void> {
  return invokeCommand<void>("import_data_json", { content });
}

export async function getStorageStats(): Promise<StorageStats> {
  const stats = await invokeCommand<RawStorageStats>("get_storage_stats_cmd");
  return {
    totalMatches: stats.totalMatches ?? stats.total_matches ?? 0,
    totalEvents: stats.totalEvents ?? stats.total_events ?? 0,
    databaseSizeBytes:
      stats.databaseSizeBytes ?? stats.database_size_bytes ?? 0,
    oldestMatchDate: stats.oldestMatchDate ?? stats.oldest_match_date ?? null,
    dbPath: stats.dbPath ?? stats.db_path ?? null,
  };
}

export async function clearAllData(): Promise<void> {
  return invokeCommand<void>("clear_all_data_cmd");
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export async function listProfiles(): Promise<Profile[]> {
  return invokeCommand<Profile[]>("list_profiles_cmd");
}

export interface ProfileComparisonRow {
  id: string;
  name: string;
  isActive: boolean;
  playerName: string | null;
  matches: number;
  wins: number;
  winRate: number | null;
  lastMatchAt: string | null;
  trainingSessions: number;
}

export async function getProfileComparison(): Promise<ProfileComparisonRow[]> {
  return invokeCommand<ProfileComparisonRow[]>("get_profile_comparison_cmd");
}

export async function getActiveProfile(): Promise<Profile> {
  return invokeCommand<Profile>("get_active_profile_cmd");
}

export async function createProfile(
  name: string,
  playerName: string,
): Promise<Profile> {
  return invokeCommand<Profile>("create_profile_cmd", {
    name,
    playerName,
  });
}

export async function deleteProfile(id: string): Promise<void> {
  return invokeCommand<void>("delete_profile_cmd", { id });
}

export async function switchProfile(id: string): Promise<void> {
  return invokeCommand<void>("switch_profile_cmd", { id });
}

export async function renameProfile(
  id: string,
  newName: string,
): Promise<void> {
  return invokeCommand<void>("rename_profile_cmd", { id, newName });
}

export async function updateProfilePlayerIdentity(
  profileId: string,
  primaryId: string,
  playerName: string,
): Promise<void> {
  return invokeCommand<void>("update_profile_player_identity_cmd", {
    profileId,
    primaryId,
    playerName,
  });
}

export async function findMatchingProfile(
  primaryId: string,
  playerName: string,
): Promise<Profile | null> {
  return invokeCommand<Profile | null>("find_matching_profile_cmd", {
    primaryId,
    playerName,
  });
}

// ─── Data retention & backups ───────────────────────────────────────────────

/**
 * Saves the retention window. NEVER deletes anything: deletion only happens
 * through `applyDataRetention` after the UI's double confirmation.
 */
export async function setDataRetention(days: number): Promise<void> {
  return invokeCommand<void>("set_data_retention_cmd", { days });
}

export interface RetentionPreview {
  count: number;
  oldestStartTime: string | null;
  newestStartTime: string | null;
  cutoff: string;
}

/** How many matches a retention run would delete (read-only). */
export async function previewDataRetention(
  days: number,
): Promise<RetentionPreview> {
  return invokeCommand<RetentionPreview>("preview_data_retention_cmd", {
    days,
  });
}

/** Deletes matches older than `days`. Called only after double confirmation. */
export async function applyDataRetention(days: number): Promise<number> {
  return invokeCommand<number>("apply_data_retention_cmd", { days });
}

export interface DatabaseBackupInfo {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string | null;
  profileId: string | null;
  playerName: string | null;
}

export async function listDatabaseBackups(): Promise<DatabaseBackupInfo[]> {
  return invokeCommand<DatabaseBackupInfo[]>("list_database_backups_cmd");
}

/**
 * Stages a backup for restore. The app must be relaunched afterwards; the
 * swap happens at startup and the previous database is kept as a backup.
 */
export async function restoreDatabaseBackup(path: string): Promise<void> {
  return invokeCommand<void>("restore_database_backup_cmd", { path });
}
