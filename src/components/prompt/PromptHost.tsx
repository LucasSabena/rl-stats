import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MoodPrompt } from "@/components/prompt/MoodPrompt";
import { useSettings } from "@/hooks/useSettings";

interface PromptOpenPayload {
  kind: string;
  match_id?: number;
  matchId?: number;
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
          setPayload(event.payload);
        });
        unlistenClose = await listen("prompt-close", () => {
          if (cancelled) return;
          setPayload(null);
        });
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
