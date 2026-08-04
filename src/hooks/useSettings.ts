import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSettings, setSettings } from "@/lib/api";
import { QUERY_STALE_TIME } from "@/lib/constants";

/**
 * Queries whose results are computed from settings on the Rust side, so they
 * go stale the moment settings change.
 *
 * `sessionGapMinutes` decides how matches group into sessions and
 * `kickoffGoalThresholdSeconds` decides what counts as a kickoff goal — both
 * are applied server-side. Invalidating only ["settings"] meant changing
 * either one left every analytics screen showing numbers from the old value
 * until the cache happened to expire.
 */
const SETTINGS_DERIVED_QUERIES = [
  ["analytics"],
  ["sessions"],
  ["rollups"],
  ["insights"],
  ["matches"],
  ["match-detail"],
] as const;

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
    staleTime: QUERY_STALE_TIME.settings,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: setSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      for (const queryKey of SETTINGS_DERIVED_QUERIES) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
