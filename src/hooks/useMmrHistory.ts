import { useQuery } from "@tanstack/react-query";
import { getMmrHistory } from "@/lib/api";
import type { AnalyticsPeriod } from "@/lib/types";
import { QUERY_STALE_TIME } from "@/lib/constants";

export function useMmrHistory(
  playerId: string | null,
  playlist: string | null,
  period: AnalyticsPeriod,
) {
  return useQuery({
    queryKey: ["mmr-history", playerId, playlist, period],
    queryFn: () => getMmrHistory(playerId, playlist, period),
    staleTime: QUERY_STALE_TIME.analytics,
  });
}
