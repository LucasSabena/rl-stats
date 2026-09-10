import { useInfiniteQuery } from "@tanstack/react-query";
import { getMatches } from "@/lib/api";
import type { MatchFilters } from "@/lib/types";
import { QUERY_STALE_TIME } from "@/lib/constants";

export const MATCH_HISTORY_PAGE_SIZE = 50;

export function useMatchHistory(filters?: MatchFilters) {
  return useInfiniteQuery({
    queryKey: ["matches", filters ?? {}],
    queryFn: ({ pageParam }) =>
      getMatches({ ...filters, limit: MATCH_HISTORY_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === MATCH_HISTORY_PAGE_SIZE
        ? allPages.length * MATCH_HISTORY_PAGE_SIZE
        : undefined,
    staleTime: QUERY_STALE_TIME.matches,
  });
}
