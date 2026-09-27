import { useQuery } from "@tanstack/react-query";
import { getTrainingAnalytics } from "@/lib/api";
import type { AnalyticsPeriod, DateRange } from "@/lib/types";
import { QUERY_STALE_TIME } from "@/lib/constants";

export function useTrainingAnalytics(
  period: AnalyticsPeriod,
  dateRange?: DateRange,
) {
  return useQuery({
    queryKey: ["training-analytics", period, dateRange],
    queryFn: () => getTrainingAnalytics(period, dateRange),
    staleTime: QUERY_STALE_TIME.analytics,
    // The session view has no meaning for training, but an explicit season
    // range does — the backend treats it as a normal date window.
    enabled: period !== "session" || !!dateRange,
  });
}
