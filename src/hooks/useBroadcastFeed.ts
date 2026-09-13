import { useEffect, useMemo, useRef, useState } from "react";
import {
  type BroadcastScene,
  type ChatMessage,
  type OverlayMatchState,
  type OverlayServerStatus,
  type SeriesSnapshot,
} from "@/lib/types";

/** Scene payload broadcast by the engine (`scene` event / `/api/v2/scene`). */
export interface ScenePayload {
  scene: { id: string; name: string; state: string; packId: string } | null;
  state: string;
  pack: { id: string; name: string; tokens: Record<string, unknown> };
  layout: Record<string, { module: string } & Record<string, unknown>>;
  series: SeriesSnapshot;
  teams: unknown[];
  fonts: unknown[];
}

export interface BroadcastFeed {
  connected: boolean;
  match: OverlayMatchState | null;
  series: SeriesSnapshot | null;
  scene: ScenePayload | null;
  chat: ChatMessage[];
  activeState: string;
  delaySeconds: number;
  lastTimer: { running: boolean; label?: string; endsAt?: number } | null;
}

/**
 * Connects the Control Room to the overlay WebSocket so panels react to the
 * same live feed OBS sees (state, series, scene and chat) without polling.
 */
export function useBroadcastFeed(
  status: OverlayServerStatus | undefined,
): BroadcastFeed {
  const [connected, setConnected] = useState(false);
  const [match, setMatch] = useState<OverlayMatchState | null>(null);
  const [series, setSeries] = useState<SeriesSnapshot | null>(null);
  const [scene, setScene] = useState<ScenePayload | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [activeState, setActiveState] = useState("waiting");
  const [delaySeconds, setDelaySeconds] = useState(0);
  const [lastTimer, setLastTimer] = useState<BroadcastFeed["lastTimer"]>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const url = useMemo(() => {
    if (!status?.running || !status.token) return null;
    const port = status.port || 9528;
    return `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(status.token)}`;
  }, [status?.running, status?.port, status?.token]);

  useEffect(() => {
    if (!url) {
      setConnected(false);
      return;
    }
    let disposed = false;
    let retry = 1000;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(url);
      socketRef.current = socket;
      socket.onopen = () => {
        retry = 1000;
        setConnected(true);
      };
      socket.onmessage = (event) => {
        let message: { type: string; data?: unknown };
        try {
          message = JSON.parse(event.data as string) as typeof message;
        } catch {
          return;
        }
        handleMessage(message);
      };
      socket.onclose = () => {
        setConnected(false);
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, retry);
          retry = Math.min(retry * 2, 10000);
        }
      };
      socket.onerror = () => socket?.close();
    };

    const handleMessage = (message: { type: string; data?: unknown }) => {
      switch (message.type) {
        case "state":
          setMatch(message.data as OverlayMatchState);
          break;
        case "scene": {
          const payload = message.data as ScenePayload;
          setScene(payload);
          setActiveState(payload.state || "waiting");
          break;
        }
        case "series":
          setSeries(message.data as SeriesSnapshot);
          break;
        case "chat":
          setChat((previous) => [
            ...previous.slice(-79),
            message.data as ChatMessage,
          ]);
          break;
        case "timer":
          setLastTimer(message.data as BroadcastFeed["lastTimer"]);
          break;
        case "delay": {
          const data = message.data as { seconds?: number };
          if (typeof data.seconds === "number") setDelaySeconds(data.seconds);
          break;
        }
        default:
          break;
      }
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
      socketRef.current = null;
    };
  }, [url]);

  return {
    connected,
    match,
    series,
    scene,
    chat,
    activeState,
    delaySeconds,
    lastTimer,
  };
}

export type { BroadcastScene };
