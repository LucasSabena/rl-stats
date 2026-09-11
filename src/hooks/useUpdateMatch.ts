import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateMatch } from "@/lib/api";

export function useUpdateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      matchId,
      data,
    }: {
      matchId: number;
      data: { matchType?: string | null; playlist?: string | null };
    }) => updateMatch(matchId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["match-detail", variables.matchId] });
      // match_type/playlist take part in every analytics aggregation and in
      // the pre-aggregated rollups, so all of them must be refetched.
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      queryClient.invalidateQueries({ queryKey: ["rollups"] });
      queryClient.invalidateQueries({ queryKey: ["session-curve"] });
      queryClient.invalidateQueries({ queryKey: ["teammate-stats"] });
      queryClient.invalidateQueries({ queryKey: ["custom-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["player-analytics-summary"] });
      queryClient.invalidateQueries({ queryKey: ["player-analytics-matches"] });
    },
  });
}
