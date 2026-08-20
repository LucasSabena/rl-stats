import { useQuery } from "@tanstack/react-query";
import {
  getAnalytics,
  getDailyRollups,
  getSessionMatches,
  getInsights,
  getPlayerAnalyticsMatches,
  getPlayerAnalyticsSummary,
} from "@/lib/api";
import type {
  AnalyticsData,
  AnalyticsPeriod,
  DailyRollup,
  MatchSession,
  InsightsData,
  PlayerAnalyticsMatch,
  PlaylistFilter,
  MatchTypeFilter,
  DataScope,
} from "@/lib/types";
import { QUERY_STALE_TIME } from "@/lib/constants";

interface AnalyticsResult {
  data: AnalyticsData;
  rollups: DailyRollup[];
  sessions: MatchSession[];
}

interface AnalyticsFiltersState {
  playlist?: PlaylistFilter;
  matchType?: MatchTypeFilter;
  scope?: DataScope;
  playerId?: string | null;
}

export function useAnalytics(period: AnalyticsPeriod, filters?: AnalyticsFiltersState) {
  return useQuery<AnalyticsResult>({
    queryKey: ["analytics", period, filters],
    queryFn: async () => {
      const result = await getAnalytics(period, filters);
      return {
        data: result.data,
        rollups: result.rollups ?? [],
        sessions: result.sessions ?? [],
      };
    },
    staleTime: QUERY_STALE_TIME.analytics,
  });
}

export function useDailyRollups(period: AnalyticsPeriod, filters?: AnalyticsFiltersState) {
  return useQuery({
    queryKey: ["rollups", period, filters],
    queryFn: () => getDailyRollups(period, filters),
    staleTime: QUERY_STALE_TIME.analytics,
    enabled: period !== "session",
  });
}

export function useSessionMatches(startTime?: string, endTime?: string) {
  return useQuery({
    queryKey: ["sessionMatches", startTime, endTime],
    queryFn: () => getSessionMatches(startTime!, endTime!),
    enabled: !!startTime && !!endTime,
    staleTime: QUERY_STALE_TIME.analytics,
  });
}

export function useInsights(period: AnalyticsPeriod, filters?: AnalyticsFiltersState) {
  return useQuery<InsightsData>({
    queryKey: ["insights", period, filters],
    queryFn: () => getInsights(period, filters),
    staleTime: QUERY_STALE_TIME.analytics,
  });
}

export function usePlayerAnalyticsMatches(
  playerId: string | null,
  period: AnalyticsPeriod,
  filters?: AnalyticsFiltersState,
) {
  return useQuery<PlayerAnalyticsMatch[]>({
    queryKey: ["player-analytics-matches", playerId, period, filters],
    queryFn: () =>
      getPlayerAnalyticsMatches(playerId!, period, {
        playlist: filters?.playlist,
        matchType: filters?.matchType,
        limit: 50,
      }),
    enabled: !!playerId,
    staleTime: QUERY_STALE_TIME.analytics,
  });
}

export function usePlayerAnalyticsSummary(
  playerId: string | null,
  period: AnalyticsPeriod,
  filters?: AnalyticsFiltersState,
) {
  return useQuery<AnalyticsData>({
    queryKey: ["player-analytics-summary", playerId, period, filters],
    queryFn: () =>
      getPlayerAnalyticsSummary(playerId!, period, {
        playlist: filters?.playlist,
        matchType: filters?.matchType,
      }),
    enabled: !!playerId,
    staleTime: QUERY_STALE_TIME.analytics,
  });
}
