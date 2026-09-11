import {
  type AnalyticsData,
  type AnalyticsPeriod,
  type BreakdownData,
  type DailyRollup,
  type DataScope,
  type InsightsData,
  type KickoffBackfillReport,
  type MatchSession,
  type MatchTypeFilter,
  type PlayerAnalyticsMatch,
  type PlaylistFilter,
  type SessionCurveData,
  type SessionMatch,
  type TeammateData,
  type TrainingStats,
} from "../types";
import {
  invokeCommand,
  mapRollup,
  mapSummaryToAnalyticsData,
  periodToDays,
  type RawAnalyticsSummary,
  type RawDailyRollup,
} from "./core";

interface RawAnalyticsResponse {
  rollups?: RawDailyRollup[];
  sessions?: MatchSession[];
  summary: RawAnalyticsSummary;
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
    args.matchType = filters.matchType;
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
    matchType:
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
    args.matchType = filters.matchType;
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
  // Rust takes a single `query: SessionMatchesQuery` argument (serde keeps
  // the snake_case field names inside the struct). Sending the timestamps
  // flat made the command reject every call, which is why session details
  // never loaded.
  return invokeCommand<SessionMatch[]>("get_session_matches", {
    query: { start_time: startTime, end_time: endTime },
  });
}

export interface MmrHistoryPoint {
  match_id: number;
  start_time: string;
  mmr: number;
  playlist: string | null;
  is_win: boolean;
  overtime: boolean;
}

export interface MmrHistoryData {
  available: boolean;
  points: MmrHistoryPoint[];
  playlists: string[];
  startDate?: string;
  endDate?: string;
}

export async function getMmrHistory(
  playerId: string | null,
  playlist: string | null,
  period: AnalyticsPeriod,
): Promise<MmrHistoryData> {
  const args: Record<string, unknown> = {
    period: { days: periodToDays(period) },
  };
  if (playerId) args.playerId = playerId;
  if (playlist && playlist !== "all") args.playlist = playlist;
  const response = await invokeCommand<MmrHistoryData>("get_mmr_history", args);
  return {
    available: response.available ?? false,
    points: response.points ?? [],
    playlists: response.playlists ?? [],
    startDate: response.startDate,
    endDate: response.endDate,
  };
}

export interface ComparisonSide {
  totalMatches: number;
  wins: number;
  losses: number;
  totalGoals: number;
  totalConceded: number;
  totalShots: number;
  totalSaves: number;
  totalAssists: number;
  totalDemos: number;
  avgScore: number;
  avgDuration: number;
  peakSpeed: number;
  totalKickoffGoals: number;
  totalKickoffConceded: number;
}

export interface ComparisonData {
  available: boolean;
  mode: "players" | "periods" | string;
  a: ComparisonSide;
  b: ComparisonSide;
  windowA?: { start: string; end: string };
  windowB?: { start: string; end: string };
}

export async function getAnalyticsComparison(
  mode: "players" | "periods",
  playerId: string | null,
  rivalId: string | null,
  period: AnalyticsPeriod,
  filters?: { playlist?: PlaylistFilter; matchType?: MatchTypeFilter },
): Promise<ComparisonData> {
  const args: Record<string, unknown> = {
    mode,
    period: { days: periodToDays(period) },
  };
  if (playerId) args.playerId = playerId;
  if (rivalId) args.rivalId = rivalId;
  if (filters?.playlist && filters.playlist !== "all") {
    args.playlist = filters.playlist;
  }
  if (filters?.matchType && filters.matchType !== "all") {
    args.matchType = filters.matchType;
  }
  return invokeCommand<ComparisonData>("get_analytics_comparison", args);
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
    args.matchType = filters.matchType;
  }
  if (filters?.scope) {
    args.scope = filters.scope;
  }
  if (filters?.playerId) {
    args.playerId = filters.playerId;
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
    args.matchType = filters.matchType;
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
    args.matchType = filters.matchType;
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
    args.matchType = filters.matchType;
  }
  if (filters?.scope) {
    args.scope = filters.scope;
  }
  if (filters?.playerId) {
    args.playerId = filters.playerId;
  }
  return args;
}

export async function getSessionCurve(
  period: AnalyticsPeriod,
  filters?: PatternFilters,
): Promise<SessionCurveData> {
  return invokeCommand("get_session_curve", patternArgs(period, filters));
}

export async function getTeammateStats(
  period: AnalyticsPeriod,
  filters?: PatternFilters,
): Promise<TeammateData> {
  return invokeCommand("get_teammate_stats", patternArgs(period, filters));
}

export async function getCustomBreakdown(
  period: AnalyticsPeriod,
  dimension: string,
  filters?: PatternFilters,
): Promise<BreakdownData> {
  return invokeCommand("get_custom_breakdown", {
    ...patternArgs(period, filters),
    dimension,
  });
}

export async function recomputeKickoffGoals(): Promise<KickoffBackfillReport> {
  return invokeCommand("recompute_kickoff_goals", {});
}

// Training tracking
export async function getTrainingAnalytics(
  period: AnalyticsPeriod,
): Promise<TrainingStats> {
  const days = periodToDays(period);
  return invokeCommand<TrainingStats>("get_training_analytics", {
    period: { days },
  });
}
