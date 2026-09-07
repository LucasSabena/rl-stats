import { useQuery } from "@tanstack/react-query";
import { getTrainingAnalytics } from "@/lib/api";
import type { AnalyticsPeriod } from "@/lib/types";
import { QUERY_STALE_TIME } from "@/lib/constants";

export function useTrainingAnalytics(period: AnalyticsPeriod) {
  return useQuery({
    queryKey: ["training-analytics", period],
    queryFn: () => getTrainingAnalytics(period),
    staleTime: QUERY_STALE_TIME.analytics,
    enabled: period !== "session",
  });
}