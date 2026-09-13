import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getPlayerDirectory, getPlayerDetail } from "@/lib/api";
import { QUERY_STALE_TIME } from "@/lib/constants";

export const PLAYER_DIRECTORY_PAGE_SIZE = 50;

export function usePlayerDirectory(filters?: {
  search?: string;
  relationship?: string;
  sortBy?: string;
}) {
  const limit = PLAYER_DIRECTORY_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: ["player-directory", filters ?? {}],
    queryFn: ({ pageParam }) =>
      getPlayerDirectory({ ...filters, limit, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === limit ? allPages.length * limit : undefined,
    staleTime: QUERY_STALE_TIME.matches,
    placeholderData: keepPreviousData,
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
