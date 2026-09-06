import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setMatchMood } from "@/lib/api";

export function useSetMatchMood() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ matchId, mood }: { matchId: number; mood: string | null }) =>
      setMatchMood(matchId, mood),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["match-detail", variables.matchId] });
      queryClient.invalidateQueries({ queryKey: ["sessionMatches"] });
      queryClient.invalidateQueries({ queryKey: ["player-analytics-matches"] });
      queryClient.invalidateQueries({ queryKey: ["session-curve"] });
      queryClient.invalidateQueries({ queryKey: ["custom-breakdown"] });
    },
  });
}
