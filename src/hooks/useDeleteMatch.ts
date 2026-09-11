import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteMatch } from "@/lib/api";

export function useDeleteMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matchId: number) => deleteMatch(matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["rollups"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      queryClient.invalidateQueries({ queryKey: ["sessionMatches"] });
      queryClient.invalidateQueries({ queryKey: ["session-curve"] });
      queryClient.invalidateQueries({ queryKey: ["teammate-stats"] });
      queryClient.invalidateQueries({ queryKey: ["custom-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["player-analytics-summary"] });
      queryClient.invalidateQueries({ queryKey: ["player-analytics-matches"] });
      queryClient.invalidateQueries({ queryKey: ["player-directory"] });
      queryClient.invalidateQueries({ queryKey: ["player-detail"] });
      queryClient.invalidateQueries({ queryKey: ["training-analytics"] });
    },
  });
}
