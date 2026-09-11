import { invoke } from "@tauri-apps/api/core";
import {
  type LiveMatchState,
  type ConnectionStatus,
  type Player,
  type MatchSummary,
  type PlayerStats,
  type Goal,
  type RlEvent,
  type MatchType,
  type AnalyticsData,
  type AnalyticsPeriod,
  type DailyRollup,
} from "../types";

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

export interface RawConnectionStatus {
  connected: boolean;
  address: string;
  last_error: string | null;
  reconnect_attempts: number;
  game_running: boolean;
}

export interface RawLivePlayer {
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

export interface RawLiveMatchState {
  match_guid: string | null;
  arena: string | null;
  is_online: boolean;
  is_overtime: boolean;
  time_remaining: number;
  score_blue: number;
  score_orange: number;
  players: RawLivePlayer[];
  ball_speed: number;
  training_elapsed_seconds?: number | null;
}

export interface RawMatchSummary {
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

export interface RawPlayerStats {
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

export interface RawMatchPlayer {
  id: number;
  primary_id: string;
  name: string;
  team_num: number;
  stats: RawPlayerStats;
}

export interface RawRlEvent {
  id: string;
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface RawGoal {
  id: string;
  scorerId: string;
  scorerName: string;
  scorerTeam: number;
  assisterId?: string;
  assisterName?: string;
  time: number;
  ballSpeed: number;
}

export interface RawDailyRollup {
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
  kickoff_goals_scored?: number;
  kickoff_goals_conceded?: number;
}

export interface RawAnalyticsSummary {
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

export function mapConnectionStatus(status: RawConnectionStatus): ConnectionStatus {
  if (!status.game_running) return "game_not_running";
  if (status.connected) return "connected";
  if (status.reconnect_attempts > 0) return "connecting";
  return "disconnected";
}

export function mapPlayer(player: RawLivePlayer): Player {
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

export function mapLiveState(state: RawLiveMatchState | null): LiveMatchState | null {
  if (!state) return null;
  let mappedPlayers = state.players.map(mapPlayer);
  // Free Play reports a single player with team 1; force blue so the live
  // panel and overlay render the stint instead of an empty orange side.
  if (mappedPlayers.length === 1) {
    mappedPlayers = mappedPlayers.map((player) => ({ ...player, team: 0 as const }));
  }
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
    trainingElapsedSeconds: state.training_elapsed_seconds ?? null,
  };
}

export function mapMatchSummary(match: RawMatchSummary): MatchSummary {
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

export function mapPlayerStats(player: RawMatchPlayer): PlayerStats {
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

export function mapRlEvent(event: RawRlEvent): RlEvent {
  return {
    id: event.id,
    type: event.type as RlEvent["type"],
    timestamp: event.timestamp,
    data: event.data,
  };
}

export function mapGoal(goal: RawGoal): Goal {
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

export function periodToDays(period: AnalyticsPeriod): number {
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

export function mapRollup(rollup: RawDailyRollup): DailyRollup {
  return {
    date: rollup.date,
    matchesPlayed: rollup.matches_played,
    wins: rollup.wins,
    losses: rollup.losses,
    avgScore: rollup.avg_score ?? 0,
    totalGoals: rollup.goals_scored,
    goalsConceded: rollup.goals_conceded ?? 0,
    totalShots: rollup.total_shots,
    totalSaves: rollup.total_saves,
    totalDemos: rollup.total_demos,
    totalAssists: rollup.total_assists,
    avgDurationSeconds: rollup.avg_duration_seconds ?? 0,
    kickoffGoalsScored: rollup.kickoff_goals_scored ?? 0,
    kickoffGoalsConceded: rollup.kickoff_goals_conceded ?? 0,
  };
}

export function mapSummaryToAnalyticsData(
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
  "export_history_csv",
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
