import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { getConnectionStatus, getLiveState } from "@/lib/api";
import { useLiveStore } from "@/stores/liveStore";
import type { LiveMatchState, Player, SessionSummary, RlEventType } from "@/lib/types";

interface RawPlayer {
  id: string;
  name: string;
  team: number;
  score: number;
  goals: number;
  shots: number;
  assists: number;
  saves: number;
  touches: number;
  demos: number;
  speed: number;
  boost: number;
}

interface RawLiveUpdate {
  match_guid: string | null;
  arena: string | null;
  is_online: boolean;
  is_overtime: boolean;
  time_remaining: number;
  score_blue: number;
  score_orange: number;
  players: RawPlayer[];
  ball_speed: number;
}

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

function mapPlayer(raw: RawPlayer): Player {
  return {
    id: raw.id ?? "unknown",
    name: raw.name ?? "Unknown",
    team: raw.team === 0 ? (0 as const) : raw.team === 1 ? (1 as const) : (-1 as const),
    score: raw.score,
    goals: raw.goals,
    shots: raw.shots,
    assists: raw.assists,
    saves: raw.saves,
    demos: raw.demos,
    touches: raw.touches,
    boostAmount: raw.boost,
    speed: raw.speed,
  };
}

function mapLiveUpdate(raw: RawLiveUpdate): LiveMatchState {
  const playersArray = Array.isArray(raw.players) ? raw.players : [];
  let mappedPlayers = playersArray.map(mapPlayer);

  // En entrenamiento (1 jugador), forzar team 0 para que aparezca en el panel azul
  if (mappedPlayers.length === 1) {
    mappedPlayers = mappedPlayers.map((p) => ({ ...p, team: 0 as const }));
  }

  return {
    matchGuid: raw.match_guid,
    players: mappedPlayers,
    gameState: {
      timeRemaining: raw.time_remaining,
      isOvertime: raw.is_overtime,
      isReplay: false,
      arena: raw.arena,
      ballSpeed: raw.ball_speed,
      ballPosition: null,
    },
    teamBlueScore: raw.score_blue,
    teamOrangeScore: raw.score_orange,
    playerCount: mappedPlayers.length,
    matchType: raw.is_online ? "online" : "local",
  };
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
        unlisten = await listen<RawLiveUpdate>("live-update", (event) => {
          if (cancelled) return;
          const liveState = mapLiveUpdate(event.payload);
          setMatch(liveState);
        });
      } catch {
        // Event listening failed — fall back to polling
      }

      // Listen for match-summary events
      try {
        unlisten2 = await listen<RawSessionSummary>("match-summary", (event) => {
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
      } catch {
        // match-summary listening failed — non-critical
      }

      try {
        unlisten3 = await listen<RawLiveEvent>("live-event", (event) => {
          if (cancelled) return;
          addEvent(event.payload);
        });
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
