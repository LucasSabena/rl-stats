import { useQuery } from "@tanstack/react-query";
import { getMmrHistory } from "@/lib/api";
import type { AnalyticsPeriod, DateRange } from "@/lib/types";
import { QUERY_STALE_TIME } from "@/lib/constants";

export function useMmrHistory(
  playerId: string | null,
  series: string | null,
  period: AnalyticsPeriod,
  dateRange?: DateRange,
) {
  return useQuery({
    queryKey: ["mmr-history", playerId, series, period, dateRange],
    queryFn: () => getMmrHistory(playerId, series, period, dateRange),
    staleTime: QUERY_STALE_TIME.analytics,
  });
}
