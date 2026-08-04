import { useQuery } from "@tanstack/react-query";
import { getPlayerDirectory, getPlayerDetail } from "@/lib/api";
import { QUERY_STALE_TIME } from "@/lib/constants";

export function usePlayerDirectory(filters?: {
  search?: string;
  relationship?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["player-directory", filters ?? {}],
    queryFn: () => getPlayerDirectory(filters),
    staleTime: QUERY_STALE_TIME.matches,
  });
}

export function usePlayerDetail(player: number | string) {
  const enabled = typeof player === "number" ? player > 0 : player.length > 0;

  return useQuery({
    queryKey: ["player-detail", player],
    queryFn: () => getPlayerDetail(player),
    staleTime: QUERY_STALE_TIME.matches,
    enabled,
  });
}
