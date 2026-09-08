import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  availableMonitors,
  cursorPosition,
  primaryMonitor,
} from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { MoodPrompt } from "@/components/prompt/MoodPrompt";
import { useSettings } from "@/hooks/useSettings";
import { getPendingPrompt } from "@/lib/api";

interface PromptOpenPayload {
  kind: string;
  match_id?: number;
  matchId?: number;
}

/** Prompt window content size (must match the Rust builder). */
const PROMPT_W = 560;
const PROMPT_H = 480;

/**
 * Center the window on the monitor holding the mouse cursor (usually the
 * game monitor). Tauri's builder `center()` targets the primary display,
 * which strands the prompt on the wrong screen for multi-monitor players
 * (focus leaves the game, nothing visible where they look).
 */
async function placeOnCursorMonitor(): Promise<void> {
  try {
    const cursor = await cursorPosition();
    const monitors = await availableMonitors();
    const target =
      monitors.find((m) => {
        const px = m.position.x;
        const py = m.position.y;
        return (
          cursor.x >= px &&
          cursor.x < px + m.size.width &&
          cursor.y >= py &&
          cursor.y < py + m.size.height
        );
      }) ??
      (await primaryMonitor()) ??
      null;
    if (!target) return;
    const scale = target.scaleFactor || 1;
    const x = target.position.x / scale + (target.size.width / scale - PROMPT_W) / 2;
    const y = target.position.y / scale + (target.size.height / scale - PROMPT_H) / 2;
    await getCurrentWindow().setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
    console.info("[prompt] placed on cursor monitor");
  } catch {
    // Best effort: builder center() already gave a sane default.
  }
}

/**
 * Root component of the `prompt` window (see `App.tsx`).
 *
 * Generic by design: the backend opens the window with `{ kind, match_id }`
 * and the host renders the matching prompt — mood today, anything else
 * tomorrow. Unknown kinds render nothing (the window stays hidden anyway).
 * `prompt-close` (or a new `prompt-open`) resets the state.
 */
export function PromptHost() {
  const [payload, setPayload] = useState<PromptOpenPayload | null>(null);
  const { data: settings } = useSettings();

  useEffect(() => {
    let unlistenOpen: UnlistenFn | null = null;
    let unlistenClose: UnlistenFn | null = null;
    let cancelled = false;

    async function setup() {
      try {
        unlistenOpen = await listen<PromptOpenPayload>("prompt-open", (event) => {
          if (cancelled) return;
          console.info("[prompt] opened via push event", event.payload);
          setPayload(event.payload);
        });
        unlistenClose = await listen("prompt-close", () => {
          if (cancelled) return;
          setPayload(null);
        });
        // Cold-start pull: events emitted while this webview was still
        // loading are lost (Tauri drops pre-listener emits), so fetch the
        // pending payload directly. This is what makes the prompt appear at
        // all on its first open.
        void placeOnCursorMonitor();
        const pending = await getPendingPrompt().catch(() => null);
        if (!cancelled && pending && typeof pending.kind === "string") {
          console.info("[prompt] opened via pending pull", pending);
          setPayload(pending);
        }
      } catch {
        // Outside Tauri — nothing to host.
      }
    }
    void setup();

    return () => {
      cancelled = true;
      if (unlistenOpen) unlistenOpen();
      if (unlistenClose) unlistenClose();
    };
  }, []);

  const hide = () => {
    setPayload(null);
    try {
      void getCurrentWindow().hide();
    } catch {
      // Outside Tauri.
    }
  };

  if (!payload) {
    return null;
  }

  if (payload.kind === "mood") {
    const matchId = payload.match_id ?? payload.matchId;
    if (typeof matchId !== "number") return null;
    return (
      <MoodPrompt
        key={matchId}
        matchId={matchId}
        timeoutSecs={settings?.promptTimeoutSecs ?? 30}
        onDone={hide}
      />
    );
  }

  return null;
}
