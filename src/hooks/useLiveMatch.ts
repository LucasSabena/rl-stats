import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import {
  getConnectionStatus,
  getLiveState,
  mapLiveState,
  type RawLiveMatchState,
} from "@/lib/api";
import { useLiveStore } from "@/stores/liveStore";
import type { SessionSummary, RlEventType } from "@/lib/types";

interface RawSessionSummary {
  match_guid: string;
  duration_seconds: number;
  score_blue: number;
  score_orange: number;
  winner: number | null;
  local_primary_id?: string | null;
  local_team_num?: number | null;
  players: {
    id: number;
    primary_id: string;
    name: string;
    team_num: number;
    stats: Record<string, unknown>;
  }[];
}

interface RawLiveEvent {
  id: string;
  type: RlEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

function mapSessionSummary(raw: RawSessionSummary): SessionSummary {
  return {
    ...raw,
    local_primary_id: raw.local_primary_id ?? null,
    local_team_num: raw.local_team_num ?? null,
  };
}

export function useLiveMatch() {
  const queryClient = useQueryClient();
  const setMatch = useLiveStore((state) => state.setMatch);
  const setConnectionStatus = useLiveStore((state) => state.setConnectionStatus);
  const setMatchSummary = useLiveStore((state) => state.setMatchSummary);
  const addEvent = useLiveStore((state) => state.addEvent);
  const reset = useLiveStore((state) => state.reset);

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;
    let unlisten2: UnlistenFn | null = null;
    let unlisten3: UnlistenFn | null = null;
    let timeoutId: number | null = null;

    async function setup() {
      // Initial load
      try {
        const [match, connection] = await Promise.all([getLiveState(), getConnectionStatus()]);
        if (cancelled) return;
        setConnectionStatus(connection);
        setMatch(match);
        if (!match) {
          reset();
          setConnectionStatus(connection);
        }
      } catch {
        if (!cancelled) {
          reset();
          setConnectionStatus("disconnected");
        }
      }

      // Listen for real-time Tauri events from the Rust backend
      try {
        const un = await listen<RawLiveMatchState>("live-update", (event) => {
          if (cancelled) return;
          const liveState = mapLiveState(event.payload);
          if (liveState) setMatch(liveState);
        });
        if (cancelled) un();
        else unlisten = un;
      } catch {
        // Event listening failed — fall back to polling
      }

      // Listen for match-summary events
      try {
        const un = await listen<RawSessionSummary>("match-summary", (event) => {
          if (cancelled) return;
          const summary = mapSessionSummary(event.payload);
          setMatchSummary(summary);
          void queryClient.invalidateQueries({ queryKey: ["matches"] });
          void queryClient.invalidateQueries({ queryKey: ["analytics"] });
          void queryClient.invalidateQueries({ queryKey: ["sessions"] });
          void queryClient.invalidateQueries({ queryKey: ["rollups"] });
          void queryClient.invalidateQueries({ queryKey: ["insights"] });
          void queryClient.invalidateQueries({ queryKey: ["storageStats"] });
        });
        if (cancelled) un();
        else unlisten2 = un;
      } catch {
        // match-summary listening failed — non-critical
      }

      try {
        const un = await listen<RawLiveEvent>("live-event", (event) => {
          if (cancelled) return;
          addEvent(event.payload);
        });
        if (cancelled) un();
        else unlisten3 = un;
      } catch {
        // live-event listening failed — non-critical
      }
    }

    setup();

    // Poll connection status only (match data comes from events).
    // Use chained timeouts so slow responses never overlap.
    const pollConnection = async () => {
      if (cancelled) return;
      try {
        const connection = await getConnectionStatus();
        if (!cancelled) {
          setConnectionStatus(connection);
        }
      } catch {
        if (!cancelled) {
          setConnectionStatus("disconnected");
        }
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(() => {
            void pollConnection();
          }, 2000);
        }
      }
    };

    void pollConnection();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (unlisten) unlisten();
      if (unlisten2) unlisten2();
      if (unlisten3) unlisten3();
    };
  }, [addEvent, queryClient, reset, setConnectionStatus, setMatch, setMatchSummary]);
}
