import { memo } from "react";
import { cn } from "@/lib/utils";
import type { Player, OverlayDisplaySettings } from "@/lib/types";
import type { FontScale } from "./fontScale";
import { MmrBadge } from "./MmrBadge";
import { SpeedBadge } from "./SpeedBadge";

export const OverlayPlayerRow = memo(function OverlayPlayerRow({
  player,
  display,
  mmr,
  mmrError,
  fontScale,
  isBlue,
}: {
  player: Player;
  display: OverlayDisplaySettings;
  mmr: number | null;
  mmrError: string | null;
  fontScale: FontScale;
  isBlue: boolean;
}) {
  const teamColor = isBlue ? "text-team-blue" : "text-team-orange";

  return (
    <div className="flex flex-col">
      {/* Main row data */}
      <div className="flex items-center gap-2 px-1.5 py-1">
        <span
          aria-hidden="true"
          className={cn("h-3 w-0.5 shrink-0 rounded-full", isBlue ? "bg-team-blue" : "bg-team-orange")}
        />

        {/* Player Name */}
        {display.showNames && (
          <span className={cn("truncate text-white", fontScale.name)}>
            {player.name}
          </span>
        )}

        {/* Puntos */}
        {display.showPlayerScore && (
          <span className={cn("tabular-nums", fontScale.playerScore, teamColor)}>
            {player.score}
          </span>
        )}

        {/* Stats (G/A/S) */}
        {display.showStats && (
          <div className={cn(
            "flex items-center gap-2 ml-auto",
            fontScale.stats
          )}>
            <StatPill value={player.goals} icon="G" />
            <StatPill value={player.assists} icon="A" />
            <StatPill value={player.saves} icon="S" />
          </div>
        )}

        {/* MMR */}
        {display.showMmr && mmr !== null && (
          <MmrBadge mmr={mmr} fontScale={fontScale} />
        )}

        {/* MMR Error — compact badge with tooltip */}
        {display.showMmr && mmrError && mmr === null && (
          <span
            className={cn(
              "ml-2 flex items-center justify-center rounded px-2 py-0.5 font-bold tracking-wide border bg-accent-warning/15 text-accent-warning border-accent-warning/20",
              fontScale.mmr
            )}
            title={mmrError}
          >
            !
          </span>
        )}

        {/* Speed */}
        {display.showSpeed && (
          <SpeedBadge speed={player.speed} fontScale={fontScale} />
        )}
      </div>

      {/* Boost Bar (always bottom inside the card) */}
      {display.showBoost && (
        <div className="w-full bg-black/60 h-1.5 relative z-10">
          <div
            className={cn(
              "h-full transition-all duration-300 ease-out",
              player.boostAmount > 60 ? "bg-accent-success shadow-[0_0_6px_rgba(16,185,129,0.5)]" :
              player.boostAmount > 25 ? "bg-accent-warning" : "bg-accent-danger"
            )}
            style={{ width: `${Math.min(100, Math.max(0, player.boostAmount))}%` }}
          />
        </div>
      )}
    </div>
  );
});

// ─── Stat Pill ──────────────────────────────────────────────────────────────

function StatPill({ value, icon }: { value: number; icon: string }) {
  const active = value > 0;
  return (
    <div className={cn(
      "flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 border border-white/5",
      active ? "text-white" : "text-text-muted/40"
    )}>
      <span className="font-mono font-semibold tabular-nums">{value}</span>
      <span className={cn("text-[10px] font-black", active ? "text-text-muted" : "text-text-muted/30")}>{icon}</span>
    </div>
  );
}
