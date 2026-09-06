import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  type LiveMatchState,
  type ConnectionStatus,
  type Player,
  type MatchSummary,
  type MatchDetail,
  type PlayerStats,
  type Goal,
  type RlEvent,
  type MatchFilters,
  type MatchType,
  type AnalyticsData,
  type AnalyticsPeriod,
  type DailyRollup,
  type MatchSession,
  type SessionMatch,
  type InsightsData,
  type PlayerAnalyticsMatch,
  type OverlayServerStatus,
  type OverlayUrl,
  type OverlayWindowState,
  type AppSettings,
  type StorageStats,
  type TrackerProfile,
  type LiveMmrSnapshot,
  type RlInstallation,
  type InstallSyncResult,
  type DetectedAccount,
  type PlayerDirectoryEntry,
  type PlayerDetailRecord,
  type Profile,
  type PlaylistFilter,
  type MatchTypeFilter,
  type DataScope,
  type FriendRecord,
  type CloudConfig,
  type CloudSyncStatus,
  type SyncStatus,
  type CloudPushRequest,
} from "./types";
import { formatLocalDateFromUnix } from "./utils";

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return "An unknown error occurred";
}

interface RawConnectionStatus {
  connected: boolean;
  address: string;
  last_error: string | null;
  reconnect_attempts: number;
  game_running: boolean;
}

interface RawLivePlayer {
  id: string;
  name: string;
  team: number;
  score: number;
  goals: number;
  shots: number;
  assists: number;
  saves: number;
  touches: number;
  demos: number;
  speed: number;
  boost: number;
}

interface RawLiveMatchState {
  match_guid: string | null;
  arena: string | null;
  is_online: boolean;
  is_overtime: boolean;
  time_remaining: number;
  score_blue: number;
  score_orange: number;
  players: RawLivePlayer[];
  ball_speed: number;
}

interface RawMatchSummary {
  id: number;
  guid: string;
  start_time: string;
  end_time: string | null;
  arena: string | null;
  score_blue: number;
  score_orange: number;
  winner: number | null;
  local_team_num?: number | null;
  is_online: boolean;
  is_overtime: boolean;
  duration_seconds: number;
  match_type?: string | null;
  playlist?: string | null;
  mood?: string | null;
}

interface RawPlayerStats {
  score: number;
  goals: number;
  shots: number;
  assists: number;
  saves: number;
  touches: number;
  demos: number;
  speed: number;
  boost: number;
  mmr?: number | null;
  kickoff_goals?: number;
  head_to_head?: PlayerStats["head_to_head"];
}

interface RawMatchPlayer {
  id: number;
  primary_id: string;
  name: string;
  team_num: number;
  stats: RawPlayerStats;
}

interface RawRlEvent {
  id: string;
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

interface RawGoal {
  id: string;
  scorerId: string;
  scorerName: string;
  scorerTeam: number;
  assisterId?: string;
  assisterName?: string;
  time: number;
  ballSpeed: number;
}

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
  game_running?: boolean;
  warn_on_profile_mismatch?: boolean;
  auto_switch_profile_on_exact_match?: boolean;
  auto_sync_on_match_end?: boolean;
}

interface RawDailyRollup {
  date: string;
  matches_played: number;
  wins: number;
  losses: number;
  goals_scored: number;
  goals_conceded: number;
  avg_score: number;
  total_shots: number;
  total_saves: number;
  avg_duration_seconds: number;
  total_demos: number;
  total_assists: number;
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

interface RawAnalyticsSummary {
  period?: string;
  totalMatches: number;
  wins: number;
  losses: number;
  winRate?: number;
  avgScore: number;
  avgGoals: number;
  avgAssists: number;
  avgSaves: number;
  avgShots: number;
  avgBoost: number;
  totalGoals: number;
  totalAssists: number;
  totalSaves: number;
  totalShots: number;
  totalDemos: number;
  totalConceded?: number;
  totalKickoffGoalsScored?: number;
  totalKickoffGoalsConceded?: number;
  avgKickoffGoalsScored?: number;
  avgKickoffGoalsConceded?: number;
  bestStreak: number;
  currentStreak: number;
  peakSpeed: number;
  avgDuration: number;
}

interface RawAnalyticsResponse {
  rollups?: RawDailyRollup[];
  sessions?: MatchSession[];
  summary: RawAnalyticsSummary;
}

function mapConnectionStatus(status: RawConnectionStatus): ConnectionStatus {
  if (!status.game_running) return "game_not_running";
  if (status.connected) return "connected";
  if (status.reconnect_attempts > 0) return "connecting";
  return "disconnected";
}

function mapPlayer(player: RawLivePlayer): Player {
  return {
    id: player.id,
    name: player.name,
    team: player.team === 0 ? 0 : player.team === 1 ? 1 : -1,
    score: player.score,
    goals: player.goals,
    shots: player.shots,
    assists: player.assists,
    saves: player.saves,
    demos: player.demos,
    touches: player.touches,
    boostAmount: player.boost,
    speed: player.speed,
  };
}

function mapLiveState(state: RawLiveMatchState | null): LiveMatchState | null {
  if (!state) return null;
  const mappedPlayers = state.players.map(mapPlayer);
  const playerCount = mappedPlayers.length;
  const matchType = state.is_online ? "online" : "local";
  return {
    matchGuid: state.match_guid,
    players: mappedPlayers,
    gameState: {
      timeRemaining: state.time_remaining,
      isOvertime: state.is_overtime,
      isReplay: false,
      arena: state.arena,
      ballSpeed: state.ball_speed,
      ballPosition: null,
    },
    teamBlueScore: state.score_blue,
    teamOrangeScore: state.score_orange,
    playerCount,
    matchType,
  };
}

function mapMatchSummary(match: RawMatchSummary): MatchSummary {
  return {
    id: match.id,
    matchGuid: match.guid,
    startTime: Date.parse(match.start_time) / 1000,
    endTime: match.end_time ? Date.parse(match.end_time) / 1000 : null,
    durationSeconds: match.duration_seconds,
    arena: match.arena,
    teamBlueScore: match.score_blue,
    teamOrangeScore: match.score_orange,
    winnerTeamNum: match.winner,
    localTeamNum: match.local_team_num ?? null,
    isOnline: match.is_online,
    isOvertime: match.is_overtime,
    matchType: (match.match_type as MatchType) ?? null,
    playlist: match.playlist ?? null,
    mood: match.mood ?? null,
  };
}

function mapPlayerStats(player: RawMatchPlayer): PlayerStats {
  return {
    id: player.primary_id,
    name: player.name,
    team: player.team_num === 1 ? 1 : 0,
    score: player.stats.score,
    goals: player.stats.goals,
    shots: player.stats.shots,
    assists: player.stats.assists,
    saves: player.stats.saves,
    demos: player.stats.demos,
    touches: player.stats.touches,
    boostAmount: player.stats.boost,
    speed: player.stats.speed,
    // The backend has always persisted and sent this; it was simply never
    // mapped, so per-match MMR was dropped on the floor by the frontend.
    mmr: player.stats.mmr ?? null,
    kickoffGoals: player.stats.kickoff_goals,
    head_to_head: player.stats.head_to_head ?? null,
  };
}

function mapRlEvent(event: RawRlEvent): RlEvent {
  return {
    id: event.id,
    type: event.type as RlEvent["type"],
    timestamp: event.timestamp,
    data: event.data,
  };
}

function mapGoal(goal: RawGoal): Goal {
  return {
    id: goal.id,
    scorerId: goal.scorerId,
    scorerName: goal.scorerName,
    scorerTeam: goal.scorerTeam === 1 ? 1 : 0,
    assisterId: goal.assisterId,
    assisterName: goal.assisterName,
    time: goal.time,
    ballSpeed: goal.ballSpeed,
  };
}

function periodToDays(period: AnalyticsPeriod): number {
  switch (period) {
    case "day":
      return 1;
    case "week":
      return 7;
    case "month":
      return 30;
    case "year":
      return 365;
    case "alltime":
      return 36500;
    case "session":
      return 0;
  }
}

function mapRollup(rollup: RawDailyRollup): DailyRollup {
  return {
    date: rollup.date,
    matchesPlayed: rollup.matches_played,
    wins: rollup.wins,
    losses: rollup.losses,
    avgScore: rollup.avg_score ?? 0,
    totalGoals: rollup.goals_scored,
    totalShots: rollup.total_shots,
    totalSaves: rollup.total_saves,
    totalDemos: rollup.total_demos,
    totalAssists: rollup.total_assists,
  };
}

function mapSummaryToAnalyticsData(
  period: AnalyticsPeriod,
  summary: RawAnalyticsSummary,
): AnalyticsData {
  return {
    period,
    totalMatches: summary.totalMatches,
    wins: summary.wins,
    losses: summary.losses,
    winRate:
      summary.winRate ??
      (summary.totalMatches > 0
        ? Math.round((summary.wins / summary.totalMatches) * 100)
        : 0),
    avgScore: summary.avgScore,
    avgGoals: summary.avgGoals,
    avgAssists: summary.avgAssists,
    avgSaves: summary.avgSaves,
    avgShots: summary.avgShots,
    avgBoost: summary.avgBoost,
    totalGoals: summary.totalGoals,
    totalAssists: summary.totalAssists,
    totalSaves: summary.totalSaves,
    totalShots: summary.totalShots,
    totalDemos: summary.totalDemos,
    totalKickoffGoalsScored: summary.totalKickoffGoalsScored ?? 0,
    totalKickoffGoalsConceded: summary.totalKickoffGoalsConceded ?? 0,
    avgKickoffGoalsScored: summary.avgKickoffGoalsScored ?? 0,
    avgKickoffGoalsConceded: summary.avgKickoffGoalsConceded ?? 0,
    bestStreak: summary.bestStreak,
    currentStreak: summary.currentStreak,
    peakSpeed: summary.peakSpeed,
    avgDuration: summary.avgDuration,
  };
}

/**
 * Default ceiling for a Tauri command round-trip.
 *
 * A command that never settles hangs the calling screen forever — React Query
 * stays `pending`, so the UI sits on skeletons with no error and no retry. That
 * happens whenever the Rust side panics mid-command: the response channel is
 * dropped and the JS promise is simply never resolved or rejected. Bounding the
 * wait turns a silent hang into a real error the UI can show and retry.
 */
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

/**
 * Commands that legitimately run long (network round-trips, bulk DB work) and
 * must not be cut off.
 */
const UNBOUNDED_COMMANDS = new Set([
  // Bulk database / filesystem work
  "export_data",
  "export_data_json",
  "import_data",
  "import_data_json",
  "clear_all_data_cmd",
  "enqueue_existing_profile_history_for_sync_cmd",
  // Network round-trips (tracker / RLStats / MMR providers)
  "fetch_live_mmr_snapshot",
  "fetch_tracker_profile",
  "refresh_tracker_profile",
  "fetch_rlstats_profile",
  "refresh_rlstats_profile",
  "get_player_analytics_matches",
  // Filesystem scans
  "detect_rl_path",
  "inspect_rl_path",
  "detect_local_accounts_cmd",
  "sync_rl_installations_cmd",
  "configure_rl_ini_all_cmd",
]);

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
  options?: { timeoutMs?: number },
): Promise<T> {
  const timeoutMs =
    options?.timeoutMs ??
    (UNBOUNDED_COMMANDS.has(command) ? 0 : DEFAULT_COMMAND_TIMEOUT_MS);

  try {
    const call = invoke<T>(command, args);
    if (timeoutMs <= 0) return await call;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        call,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new ApiError(
                  `El comando "${command}" no respondió en ${Math.round(timeoutMs / 1000)}s.`,
                ),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message = typeof error === "string" ? error : getErrorMessage(error);
    throw new ApiError(message);
  }
}

export async function restartApp(): Promise<void> {
  return relaunch();
}

// ─── Cloud Sync ─────────────────────────────────────────────────────────────

export async function getCloudConfig(): Promise<CloudConfig> {
  return invokeCommand<CloudConfig>("get_cloud_config_cmd");
}

export async function setCloudConfig(config: CloudConfig): Promise<void> {
  return invokeCommand<void>("set_cloud_config_cmd", { config });
}

export async function getCloudSyncStatus(): Promise<CloudSyncStatus> {
  return invokeCommand<CloudSyncStatus>("get_cloud_sync_status_cmd");
}

export async function getProfileSyncStatus(): Promise<SyncStatus> {
  return invokeCommand<SyncStatus>("get_profile_sync_status_cmd");
}

export async function prepareCloudPushBatch(
  limit?: number,
): Promise<CloudPushRequest | null> {
  return invokeCommand<CloudPushRequest | null>(
    "prepare_cloud_push_batch_cmd",
    { limit },
  );
}

export async function markCloudPushSucceeded(
  outboxIds: number[],
  serverRevision = 0,
): Promise<void> {
  return invokeCommand<void>("mark_cloud_push_succeeded_cmd", {
    outboxIds,
    serverRevision,
  });
}

export async function markCloudPushFailed(
  outboxIds: number[],
  error: string,
): Promise<void> {
  return invokeCommand<void>("mark_cloud_push_failed_cmd", {
    outboxIds,
    error,
  });
}

export async function enqueueExistingProfileHistoryForSync(): Promise<number> {
  return invokeCommand<number>("enqueue_existing_profile_history_for_sync_cmd");
}

// ─── Live ───────────────────────────────────────────────────────────────────
// Live match
export async function getLiveState(): Promise<LiveMatchState | null> {
  const state = await invokeCommand<RawLiveMatchState | null>("get_live_state");
  return mapLiveState(state);
}

export async function getLiveHeadToHead(
  opponentIds: string[],
): Promise<Record<string, NonNullable<PlayerStats["head_to_head"]>>> {
  return invokeCommand<
    Record<string, NonNullable<PlayerStats["head_to_head"]>>
  >("get_live_head_to_head", {
    opponentIds,
  });
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const status = await invokeCommand<RawConnectionStatus>(
    "get_connection_status",
  );
  return mapConnectionStatus(status);
}

// History
export async function getMatches(
  filters?: MatchFilters,
): Promise<MatchSummary[]> {
  const response = await invokeCommand<{ matches: RawMatchSummary[] }>(
    "get_matches",
    {
      filters: {
        limit: filters?.limit,
        offset: filters?.offset,
        match_type: filters?.matchType ?? undefined,
        playlist: filters?.mode ?? undefined,
        result: filters?.result ?? undefined,
        date_from: filters?.dateFrom
          ? formatLocalDateFromUnix(filters.dateFrom)
          : undefined,
        date_to: filters?.dateTo
          ? formatLocalDateFromUnix(filters.dateTo)
          : undefined,
        search: filters?.search ?? undefined,
      },
    },
  );
  return response.matches.map(mapMatchSummary);
}

export async function getMatchDetail(matchId: number): Promise<MatchDetail> {
  const response = await invokeCommand<{
    match: RawMatchSummary;
    players: RawMatchPlayer[];
    events: RawRlEvent[];
    goals: RawGoal[];
  }>("get_match_detail", {
    matchId,
  });
  return {
    ...mapMatchSummary(response.match),
    players: response.players.map(mapPlayerStats),
    events: response.events.map(mapRlEvent),
    goals: response.goals.map(mapGoal),
  };
}

export async function deleteMatch(matchId: number): Promise<void> {
  return invokeCommand<void>("delete_match_cmd", { matchId });
}

export async function updateMatch(
  matchId: number,
  data: { matchType?: string | null; playlist?: string | null },
): Promise<void> {
  return invokeCommand<void>("update_match_cmd", {
    matchId,
    matchType: data.matchType ?? null,
    playlist: data.playlist ?? null,
  });
}

export async function setMatchMood(matchId: number, mood: string | null): Promise<void> {
  return invokeCommand<void>("set_match_mood_cmd", {
    matchId,
    mood: mood ?? null,
  });
}

// Analytics
export async function getAnalytics(
  period: AnalyticsPeriod,
  filters?: {
    playlist?: PlaylistFilter;
    matchType?: MatchTypeFilter;
    scope?: DataScope;
  },
): Promise<{
  data: AnalyticsData;
  rollups?: DailyRollup[];
  sessions?: MatchSession[];
}> {
  const days = periodToDays(period);
  const args: Record<string, unknown> = { period: { days } };
  if (filters?.playlist && filters.playlist !== "all") {
    args.playlist = filters.playlist;
  }
  if (filters?.matchType && filters.matchType !== "all") {
    args.match_type = filters.matchType;
  }
  if (filters?.scope) {
    args.scope = filters.scope;
  }
  const response = await invokeCommand<RawAnalyticsResponse>(
    "get_analytics",
    args,
  );

  return {
    data: mapSummaryToAnalyticsData(period, response.summary),
    rollups: response.rollups?.map(mapRollup),
    sessions: response.sessions,
  };
}

export async function getSessions(
  gapMinutes?: number,
  filters?: {
    playlist?: PlaylistFilter;
    matchType?: MatchTypeFilter;
    scope?: DataScope;
  },
): Promise<MatchSession[]> {
  return invokeCommand<MatchSession[]>("get_sessions", {
    gapMinutes: gapMinutes ?? undefined,
    playlist:
      filters?.playlist && filters.playlist !== "all"
        ? filters.playlist
        : undefined,
    match_type:
      filters?.matchType && filters.matchType !== "all"
        ? filters.matchType
        : undefined,
    scope: filters?.scope ?? undefined,
  });
}

export async function getDailyRollups(
  period: AnalyticsPeriod,
  filters?: {
    playlist?: PlaylistFilter;
    matchType?: MatchTypeFilter;
    scope?: DataScope;
  },
): Promise<DailyRollup[]> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - periodToDays(period));
  // Local calendar dates: rollup buckets are stored in local time since v21,
  // so querying with UTC dates would shift matches around midnight.
  const toLocalDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const args: Record<string, unknown> = {
    startDate: toLocalDate(start),
    endDate: toLocalDate(end),
  };
  if (filters?.playlist && filters.playlist !== "all") {
    args.playlist = filters.playlist;
  }
  if (filters?.matchType && filters.matchType !== "all") {
    args.match_type = filters.matchType;
  }
  if (filters?.scope) {
    args.scope = filters.scope;
  }
  const response = await invokeCommand<{ rollups: RawDailyRollup[] }>(
    "get_daily_rollups",
    args,
  );
  return response.rollups.map(mapRollup);
}

export async function getSessionMatches(
  startTime: string,
  endTime: string,
): Promise<SessionMatch[]> {
  return invokeCommand<SessionMatch[]>("get_session_matches", {
    startTime,
    endTime,
  });
}

export async function getInsights(
  period: AnalyticsPeriod,
  filters?: {
    playlist?: PlaylistFilter;
    matchType?: MatchTypeFilter;
    scope?: DataScope;
    playerId?: string | null;
  },
): Promise<InsightsData> {
  const days = periodToDays(period);
  const args: Record<string, unknown> = { period: { days } };
  if (filters?.playlist && filters.playlist !== "all") {
    args.playlist = filters.playlist;
  }
  if (filters?.matchType && filters.matchType !== "all") {
    args.match_type = filters.matchType;
  }
  if (filters?.scope) {
    args.scope = filters.scope;
  }
  if (filters?.playerId) {
    args.player_id = filters.playerId;
  }
  return invokeCommand<InsightsData>("get_insights", args);
}

export async function getPlayerAnalyticsMatches(
  playerId: string,
  period: AnalyticsPeriod,
  filters?: {
    playlist?: PlaylistFilter;
    matchType?: MatchTypeFilter;
    limit?: number;
  },
): Promise<PlayerAnalyticsMatch[]> {
  const days = periodToDays(period);
  const args: Record<string, unknown> = { playerId, period: { days } };
  if (filters?.playlist && filters.playlist !== "all") {
    args.playlist = filters.playlist;
  }
  if (filters?.matchType && filters.matchType !== "all") {
    args.match_type = filters.matchType;
  }
  if (filters?.limit) {
    args.limit = filters.limit;
  }
  const response = await invokeCommand<{ matches: PlayerAnalyticsMatch[] }>(
    "get_player_analytics_matches",
    args,
  );
  return response.matches ?? [];
}

export async function getPlayerAnalyticsSummary(
  playerId: string,
  period: AnalyticsPeriod,
  filters?: {
    playlist?: PlaylistFilter;
    matchType?: MatchTypeFilter;
  },
): Promise<AnalyticsData> {
  const days = periodToDays(period);
  const args: Record<string, unknown> = { playerId, period: { days } };
  if (filters?.playlist && filters.playlist !== "all") {
    args.playlist = filters.playlist;
  }
  if (filters?.matchType && filters.matchType !== "all") {
    args.match_type = filters.matchType;
  }
  const summary = await invokeCommand<RawAnalyticsSummary>(
    "get_player_analytics_summary",
    args,
  );
  return mapSummaryToAnalyticsData(period, summary);
}

export interface PatternFilters {
  playlist?: PlaylistFilter;
  matchType?: MatchTypeFilter;
  scope?: DataScope;
  playerId?: string | null;
}

function patternArgs(
  period: AnalyticsPeriod,
  filters?: PatternFilters,
): Record<string, unknown> {
  const args: Record<string, unknown> = { period: { days: periodToDays(period) } };
  if (filters?.playlist && filters.playlist !== "all") {
    args.playlist = filters.playlist;
  }
  if (filters?.matchType && filters.matchType !== "all") {
    args.match_type = filters.matchType;
  }
  if (filters?.scope) {
    args.scope = filters.scope;
  }
  if (filters?.playerId) {
    args.player_id = filters.playerId;
  }
  return args;
}

export async function getSessionCurve(
  period: AnalyticsPeriod,
  filters?: PatternFilters,
): Promise<import("@/lib/types").SessionCurveData> {
  return invokeCommand("get_session_curve", patternArgs(period, filters));
}

export async function getTeammateStats(
  period: AnalyticsPeriod,
  filters?: PatternFilters,
): Promise<import("@/lib/types").TeammateData> {
  return invokeCommand("get_teammate_stats", patternArgs(period, filters));
}

export async function getCustomBreakdown(
  period: AnalyticsPeriod,
  dimension: string,
  filters?: PatternFilters,
): Promise<import("@/lib/types").BreakdownData> {
  return invokeCommand("get_custom_breakdown", {
    ...patternArgs(period, filters),
    dimension,
  });
}

export async function recomputeKickoffGoals(): Promise<
  import("@/lib/types").KickoffBackfillReport
> {
  return invokeCommand("recompute_kickoff_goals", {});
}

// Settings
export async function getSettings(): Promise<AppSettings> {
  const settings = await invokeCommand<RawAppSettings>("get_settings_cmd");
  return {
    playerName: settings.player_name,
    localPrimaryId: settings.local_primary_id ?? null,
    autoStart: settings.auto_start,
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
    gameRunning: settings.game_running ?? false,
    warnOnProfileMismatch: settings.warn_on_profile_mismatch ?? true,
    autoSwitchProfileOnExactMatch:
      settings.auto_switch_profile_on_exact_match ?? false,
    autoSyncOnMatchEnd: settings.auto_sync_on_match_end ?? true,
  };
}

export async function setSettings(settings: AppSettings): Promise<void> {
  return invokeCommand<void>("set_settings_cmd", {
    settings: {
      player_name: settings.playerName ?? "",
      local_primary_id: settings.localPrimaryId ?? null,
      auto_start: settings.autoStart,
      port: 49123,
      data_retention_days: 90,
      rl_path: settings.rlPath ?? null,
      rl_paths: settings.rlPaths ?? [],
      platform: settings.platform ?? null,
      active_platform: settings.activePlatform ?? null,
      theme: "dark",
      language: "es",
      default_match_type: settings.defaultMatchType,
      tracker_api_key: settings.trackerApiKey ?? null,
      tracker_platform: settings.trackerPlatform ?? null,
      tracker_username: settings.trackerUsername ?? null,
      rapidapi_key: settings.rapidApiKey ?? null,
      rapidapi_enabled: settings.rapidApiEnabled ?? false,
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
      game_running: settings.gameRunning ?? false,
      warn_on_profile_mismatch: settings.warnOnProfileMismatch ?? true,
      auto_switch_profile_on_exact_match:
        settings.autoSwitchProfileOnExactMatch ?? false,
      auto_sync_on_match_end: settings.autoSyncOnMatchEnd ?? true,
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

// Data management
export async function exportData(path: string): Promise<void> {
  return invokeCommand<void>("export_data", { path });
}

export async function importData(path: string): Promise<void> {
  return invokeCommand<void>("import_data", { path });
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

// Updates
export async function checkForUpdate(): Promise<Update | null> {
  return check();
}

// ─── Overlay / OBS Streaming ─────────────────────────────────────────────────

export async function startOverlayServer(
  port: number,
): Promise<OverlayServerStatus> {
  return invokeCommand<OverlayServerStatus>("start_overlay_server", { port });
}

export async function stopOverlayServer(): Promise<void> {
  return invokeCommand<void>("stop_overlay_server");
}

export async function getOverlayServerStatus(): Promise<OverlayServerStatus> {
  return invokeCommand<OverlayServerStatus>("get_overlay_server_status");
}

export async function getOverlayUrls(): Promise<OverlayUrl[]> {
  return invokeCommand<OverlayUrl[]>("get_overlay_urls");
}

export async function getOverlayState(): Promise<Record<string, unknown>> {
  return invokeCommand<Record<string, unknown>>("get_overlay_state");
}

// ─── Overlay Window ─────────────────────────────────────────────────────────

export async function createOverlayWindow(): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("create_overlay_window");
}

export async function destroyOverlayWindow(): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("destroy_overlay_window");
}

export async function getOverlayWindowState(): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("get_overlay_window_state");
}

export async function toggleOverlayEnabled(): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("toggle_overlay_enabled");
}

export async function updateOverlayPosition(
  x: number,
  y: number,
): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("update_overlay_position", { x, y });
}

export async function updateOverlaySize(
  width: number,
  height: number,
): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("update_overlay_size", {
    width,
    height,
  });
}

export async function updateOverlayOpacity(
  opacity: number,
): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("update_overlay_opacity", {
    opacity,
  });
}

export async function setOverlayClickthrough(
  clickthrough: boolean,
): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("set_overlay_clickthrough", {
    clickthrough,
  });
}

export async function notifyOverlaySettingsChanged(): Promise<void> {
  return invokeCommand<void>("notify_overlay_settings_changed");
}

export async function setOverlayInteractive(
  durationSecs: number,
): Promise<void> {
  return invokeCommand<void>("set_overlay_interactive", { durationSecs });
}

// ─── Tracker Network ─────────────────────────────────────────────────────────

export async function fetchTrackerProfile(): Promise<TrackerProfile> {
  return invokeCommand<TrackerProfile>("fetch_tracker_profile");
}

export async function getCachedProfile(): Promise<TrackerProfile | null> {
  return invokeCommand<TrackerProfile | null>("get_cached_profile");
}

export async function refreshTrackerProfile(): Promise<TrackerProfile> {
  return invokeCommand<TrackerProfile>("refresh_tracker_profile");
}

export async function fetchLiveMmrSnapshot(
  forceRefresh?: boolean,
): Promise<LiveMmrSnapshot> {
  return invokeCommand<LiveMmrSnapshot>("fetch_live_mmr_snapshot", {
    forceRefresh: forceRefresh ?? false,
  });
}

export async function setSessionMmrSnapshot(
  mmrByPrimaryId: Record<string, number | null>,
): Promise<void> {
  return invokeCommand<void>("set_session_mmr_snapshot", { mmrByPrimaryId });
}

export async function setLocalMmr(
  playlist: string,
  mmr: number,
): Promise<void> {
  return invokeCommand<void>("set_local_mmr", { playlist, mmr });
}

// ─── RLStats Profile ─────────────────────────────────────────────────────────

export async function fetchRlstatsProfile(): Promise<TrackerProfile> {
  return invokeCommand<TrackerProfile>("fetch_rlstats_profile");
}

export async function getCachedRlstatsProfile(): Promise<TrackerProfile | null> {
  return invokeCommand<TrackerProfile | null>("get_cached_rlstats_profile");
}

export async function refreshRlstatsProfile(): Promise<TrackerProfile> {
  return invokeCommand<TrackerProfile>("refresh_rlstats_profile");
}

// ─── Player Directory ─────────────────────────────────────────────────────────

export async function getPlayerDirectory(filters?: {
  search?: string;
  relationship?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
}): Promise<PlayerDirectoryEntry[]> {
  const response = await invokeCommand<{ players: PlayerDirectoryEntry[] }>(
    "get_player_directory",
    {
      filters: {
        search: filters?.search ?? undefined,
        relationship: filters?.relationship ?? undefined,
        sort_by: filters?.sortBy ?? undefined,
        limit: filters?.limit ?? 100,
        offset: filters?.offset ?? 0,
      },
    },
  );
  return response.players;
}

/**
 * Fetch a player by local row id, or by Rocket League PrimaryId.
 *
 * Live matches and match detail only carry the PrimaryId, so profiles have to
 * be reachable by that too — a numeric-only lookup made every player link from
 * those screens dead.
 */
export async function getPlayerDetail(
  player: number | string,
): Promise<PlayerDetailRecord | null> {
  if (typeof player === "number") {
    return invokeCommand<PlayerDetailRecord>("get_player_detail", {
      playerId: player,
    });
  }
  return invokeCommand<PlayerDetailRecord>("get_player_detail_by_primary_id", {
    primaryId: player,
  });
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export async function listProfiles(): Promise<Profile[]> {
  return invokeCommand<Profile[]>("list_profiles_cmd");
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
    player_name: playerName,
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
  return invokeCommand<void>("rename_profile_cmd", { id, new_name: newName });
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

// ─── Friends ─────────────────────────────────────────────────────────────────

export async function addFriend(playerId: number, tag?: string): Promise<void> {
  return invokeCommand<void>("add_friend_cmd", { playerId, tag });
}

export async function removeFriend(playerId: number): Promise<void> {
  return invokeCommand<void>("remove_friend_cmd", { playerId });
}

export async function getFriends(): Promise<FriendRecord[]> {
  return invokeCommand<FriendRecord[]>("get_friends_cmd");
}

export async function isFriend(playerId: number): Promise<boolean> {
  return invokeCommand<boolean>("is_friend_cmd", { playerId });
}
