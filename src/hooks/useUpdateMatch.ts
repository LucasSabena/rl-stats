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
      // the pre-aggregated rollups, so all of them must be refetched. Moving a
      // match to training must also drop it from the player directory,
      // head-to-head records and the training-time card.
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      queryClient.invalidateQueries({ queryKey: ["rollups"] });
      queryClient.invalidateQueries({ queryKey: ["session-curve"] });
      queryClient.invalidateQueries({ queryKey: ["sessionMatches"] });
      queryClient.invalidateQueries({ queryKey: ["teammate-stats"] });
      queryClient.invalidateQueries({ queryKey: ["custom-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["player-analytics-summary"] });
      queryClient.invalidateQueries({ queryKey: ["player-analytics-matches"] });
      queryClient.invalidateQueries({ queryKey: ["player-directory"] });
      queryClient.invalidateQueries({ queryKey: ["player-detail"] });
      queryClient.invalidateQueries({ queryKey: ["liveHeadToHead"] });
      queryClient.invalidateQueries({ queryKey: ["training-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-comparison"] });
    },
  });
}
