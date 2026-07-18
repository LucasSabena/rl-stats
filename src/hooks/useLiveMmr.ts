import { useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { fetchLiveMmrSnapshot, setSessionMmrSnapshot } from "@/lib/api";
import { useLiveStore } from "@/stores/liveStore";
import type { LiveMmrSnapshot, RlEvent } from "@/lib/types";

export function useLiveMmr() {
  const currentMatch = useLiveStore((state) => state.currentMatch);
  const matchGuid = currentMatch?.matchGuid ?? "no-match";

  const roster = useMemo(() => currentMatch?.players ?? [], [currentMatch?.players]);

  const playerIds = useMemo(() => {
    return roster.map((player) => player.id).sort();
  }, [roster]);

  const rosterSignature = useMemo(() => {
    return roster
      .map((player) => `${player.team}:${player.id}`)
      .sort()
      .join(",");
  }, [roster]);

  const teamCounts = useMemo(() => {
    return roster.reduce(
      (counts, player) => {
        if (player.team === 0) counts.blue += 1;
        if (player.team === 1) counts.orange += 1;
        return counts;
      },
      { blue: 0, orange: 0 }
    );
  }, [roster]);

  const isBalancedLobby =
    teamCounts.blue > 0 &&
    teamCounts.orange > 0 &&
    teamCounts.blue === teamCounts.orange &&
    playerIds.length >= 2;

  const canAutoFetch = currentMatch?.matchType === "online" && isBalancedLobby;

  const lastRequestedSignatureRef = useRef<string | null>(null);
  const stableFetchTimerRef = useRef<number | null>(null);
  const forceNextFetchRef = useRef(false);

  const clearStableFetchTimer = useCallback(() => {
    if (stableFetchTimerRef.current !== null) {
      window.clearTimeout(stableFetchTimerRef.current);
      stableFetchTimerRef.current = null;
    }
  }, []);

  const query = useQuery<LiveMmrSnapshot, Error>({
    queryKey: ["live-mmr", matchGuid, rosterSignature],
    queryFn: async () => {
      const forceRefresh = forceNextFetchRef.current;
      forceNextFetchRef.current = false;
      return fetchLiveMmrSnapshot(forceRefresh);
    },
    enabled: false,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const { data, refetch } = query;

  useEffect(() => {
    if (data) {
      const mmrMap: Record<string, number | null> = {};
      for (const player of data.players) {
        if (!player.estimated) {
          mmrMap[player.primaryId] = player.mmr;
        }
      }
      void setSessionMmrSnapshot(mmrMap).catch(() => {});
    }
  }, [data]);

  const prevMatchGuidRef = useRef(matchGuid);

  useEffect(() => {
    if (matchGuid !== prevMatchGuidRef.current) {
      prevMatchGuidRef.current = matchGuid;
      lastRequestedSignatureRef.current = null;
      clearStableFetchTimer();
    }
  }, [clearStableFetchTimer, matchGuid]);

  useEffect(() => {
    clearStableFetchTimer();

    if (!canAutoFetch || !rosterSignature) {
      return;
    }

    if (lastRequestedSignatureRef.current === rosterSignature) {
      return;
    }

    stableFetchTimerRef.current = window.setTimeout(() => {
      lastRequestedSignatureRef.current = rosterSignature;
      void refetch({ cancelRefetch: true });
    }, 1500);

    return clearStableFetchTimer;
  }, [canAutoFetch, clearStableFetchTimer, refetch, rosterSignature]);

  useEffect(() => {
    let disposed = false;

    const attach = async () => {
      const unlisten = await listen<RlEvent>("live-event", (event) => {
        // CountdownBegin means the room is full and the match is about to start.
        // match-started fires too early when the room is still being created.
        if (event.payload.type === "CountdownBegin" && rosterSignature) {
          clearStableFetchTimer();
          lastRequestedSignatureRef.current = rosterSignature;
          void refetch({ cancelRefetch: true });
        }
      });

      if (disposed) {
        unlisten();
      }

      return unlisten;
    };

    const unlistenPromise = attach();

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [clearStableFetchTimer, refetch, rosterSignature]);

  useEffect(() => {
    return clearStableFetchTimer;
  }, [clearStableFetchTimer]);

  const forceRefresh = useCallback(() => {
    if (rosterSignature) {
      lastRequestedSignatureRef.current = rosterSignature;
    }
    forceNextFetchRef.current = true;
    void refetch({ cancelRefetch: true });
  }, [refetch, rosterSignature]);

  return { ...query, forceRefresh };
}
