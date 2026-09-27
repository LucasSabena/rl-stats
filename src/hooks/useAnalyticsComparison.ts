import { useQuery } from "@tanstack/react-query";
import { getAnalyticsComparison } from "@/lib/api";
import type { AnalyticsPeriod, DateRange, MatchTypeFilter, PlaylistFilter } from "@/lib/types";
import { QUERY_STALE_TIME } from "@/lib/constants";

export function useAnalyticsComparison(
  mode: "players" | "periods",
  playerId: string | null,
  rivalId: string | null,
  period: AnalyticsPeriod,
  filters?: {
    playlist?: PlaylistFilter;
    matchType?: MatchTypeFilter;
    dateRange?: DateRange;
  },
) {
  return useQuery({
    queryKey: [
      "analytics-comparison",
      mode,
      playerId,
      rivalId,
      period,
      filters?.playlist,
      filters?.matchType,
      filters?.dateRange,
    ],
    queryFn: () =>
      getAnalyticsComparison(mode, playerId, rivalId, period, filters),
    staleTime: QUERY_STALE_TIME.analytics,
    enabled: mode === "periods" || !!rivalId,
  });
}
