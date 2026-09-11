import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { getSettings } from "@/lib/api";
import { useLiveMatch } from "@/hooks/useLiveMatch";
import { useLiveMmr } from "@/hooks/useLiveMmr";
import { useLiveStore } from "@/stores/liveStore";
import { OverlayDismissButton } from "@/components/overlay/OverlayDismissButton";
import { MatchContent } from "@/components/overlay/MatchContent";
import { FONT_SCALE } from "@/components/overlay/fontScale";
import { cn } from "@/lib/utils";
import type { OverlayDisplaySettings } from "@/lib/types";

const DEFAULT_DISPLAY: OverlayDisplaySettings = {
  showScore: true,
  showPlayers: true,
  showStats: true,
  showTimer: true,
  fontScale: "medium",
  opacity: 0.85,
  playerScope: "all",
  showNames: true,
  showPlayerScore: true,
  showBoost: true,
  showMmr: true,
  showSpeed: true,
};

export function OverlayView() {
  useLiveMatch();
  const mmrData = useLiveMmr();

  const mmrMap = React.useMemo(() => {
    const map: Record<string, number | null> = {};
    if (mmrData.data?.players) {
      for (const p of mmrData.data.players) {
        map[p.primaryId] = p.mmr;
      }
    }
    return map;
  }, [mmrData.data]);

  const mmrErrorMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    if (mmrData.data?.players) {
      for (const p of mmrData.data.players) {
        if (p.error) {
          map[p.primaryId] = p.error;
        }
      }
    }
    return map;
  }, [mmrData.data]);

  const currentMatch = useLiveStore((s) => s.currentMatch);
  const connectionStatus = useLiveStore((s) => s.connectionStatus);

  const [display, setDisplay] = useState<OverlayDisplaySettings>(DEFAULT_DISPLAY);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    // Cargar configuracion inicial (por si el evento de creacion llego antes de montar)
    getSettings().then((settings) => {
      setDisplay({
        showScore: settings.overlayShowScore ?? true,
        showPlayers: settings.overlayShowPlayers ?? true,
        showStats: settings.overlayShowStats ?? true,
        showTimer: settings.overlayShowTimer ?? true,
        fontScale: (settings.overlayFontScale as OverlayDisplaySettings["fontScale"]) ?? "medium",
        opacity: settings.overlayOpacity ?? 0.85,
        playerScope: (settings.overlayPlayerScope as OverlayDisplaySettings["playerScope"]) ?? "all",
        showNames: settings.overlayShowNames ?? true,
        showPlayerScore: settings.overlayShowPlayerScore ?? true,
        showBoost: settings.overlayShowBoost ?? true,
        showMmr: settings.overlayShowMmr ?? true,
        showSpeed: settings.overlayShowSpeed ?? true,
      });
    }).catch(console.error);

    // Escuchar cambios desde la UI
    const unlisteners: Array<() => void> = [];

    listen<OverlayDisplaySettings>("overlay-settings-updated", (e) => {
      setDisplay(e.payload);
    }).then((fn) => unlisteners.push(fn));

    listen<number>("overlay-opacity-changed", (e) => {
      setDisplay((prev) => ({ ...prev, opacity: e.payload }));
    }).then((fn) => unlisteners.push(fn));

    listen<boolean>("overlay-interactive-mode", (e) => {
      setInteractive(e.payload);
    }).then((fn) => unlisteners.push(fn));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  const fs = FONT_SCALE[display.fontScale];

  return (
    <div
      className={cn(
        "overlay-mode flex h-screen w-screen flex-col overflow-hidden font-sans text-text-primary p-2",
        fs.root,
        interactive && "pointer-events-auto bg-accent-primary/5 rounded-xl border border-accent-primary/20"
      )}
      style={{ opacity: display.opacity }}
    >
      {interactive && (
        <>
          <div 
            className="absolute inset-0 z-40 cursor-move" 
            data-tauri-drag-region="true"
          />
          <div className="z-50 relative">
            <OverlayDismissButton />
          </div>
        </>
      )}

      {currentMatch ? (
        <MatchContent
          match={currentMatch}
          connectionStatus={connectionStatus}
          display={display}
          fontScale={fs}
          mmrMap={mmrMap}
          mmrErrorMap={mmrErrorMap}
        />
      ) : (
        <WaitingState connectionStatus={connectionStatus} />
      )}
    </div>
  );
}

// ─── Waiting State ──────────────────────────────────────────────────────────

function WaitingState({ connectionStatus }: { connectionStatus: string }) {
  const { t } = useTranslation(["overlay", "common"]);
  const label =
    connectionStatus === "game_not_running"
      ? t("overlay:waitingState.noGame")
      : t("overlay:waitingState.noMatch");

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex items-center gap-3 rounded-2xl bg-bg-surface/80 backdrop-blur-md px-5 py-3 border border-border-subtle shadow-xl">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            connectionStatus === "connected"
              ? "bg-accent-success animate-pulse-subtle shadow-[0_0_8px_rgba(16,185,129,0.8)]"
              : "bg-accent-warning animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]"
          )}
        />
        <p className="text-sm font-medium text-text-primary tracking-wide">{label}</p>
      </div>
    </div>
  );
}
