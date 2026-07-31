import { memo } from "react";
import { cn } from "@/lib/utils";
import { PlayerCard } from "./PlayerCard";
import type { HeadToHeadRecord, LiveMmrPlayer, Player } from "@/lib/types";
import { useTranslation } from "react-i18next";

interface TeamPanelProps {
  team: "blue" | "orange";
  players: Player[];
  mmrByPlayerId?: Record<string, LiveMmrPlayer>;
  headToHeadByPlayerId?: Record<string, HeadToHeadRecord>;
  localPrimaryId?: string | null;
  mmrLoading?: boolean;
  isLocalMatch?: boolean;
}

export const TeamPanel = memo(function TeamPanel({ team, players, mmrByPlayerId, headToHeadByPlayerId, localPrimaryId, mmrLoading, isLocalMatch }: TeamPanelProps) {
  const { t } = useTranslation(["live", "common"]);
  const isBlue = team === "blue";
  const averageMmr = (() => {
    const values = players
      .map((player) => mmrByPlayerId?.[player.id]?.mmr)
      .filter((value): value is number => typeof value === "number");

    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  })();

  return (
    <div
      className={cn(
        "rounded-lg border p-2 transition-all duration-200",
        isBlue
          ? "border-team-blue/15 bg-team-blue-bg"
          : "border-team-orange/15 bg-team-orange-bg"
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <div
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            isBlue
              ? "bg-team-blue shadow-[0_0_6px_var(--color-team-blue-glow)]"
              : "bg-team-orange shadow-[0_0_6px_var(--color-team-orange-glow)]"
          )}
        />
        <h3
          className={cn(
            "font-display text-[10px] font-bold uppercase tracking-wide",
            isBlue ? "text-team-blue" : "text-team-orange"
          )}
        >
          {isBlue ? t("live:teams.blue") : t("live:teams.orange")}
        </h3>
        {averageMmr !== null && (
          <span className="text-[9px] text-text-tertiary">
            {t("live:mmr.average")} <span className="font-mono font-semibold text-text-secondary">{averageMmr}</span>
          </span>
        )}
        {mmrLoading && averageMmr === null && (
          <span className="text-[9px] text-text-tertiary">{t("live:mmr.searching")}</span>
        )}
        <span className="ml-auto font-mono text-sm font-bold text-text-primary">
          {players.reduce((sum, p) => sum + p.score, 0)}
        </span>
      </div>

      <div className="space-y-1">
        {players.length === 0 ? (
          <p className="py-2 text-center text-[10px] text-text-muted">
            {isLocalMatch ? t("live:players.bots") : t("live:players.none")}
          </p>
        ) : (
          players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isCurrentUser={player.id === localPrimaryId}
              mmr={mmrByPlayerId?.[player.id] ?? null}
              headToHead={headToHeadByPlayerId?.[player.id] ?? null}
              mmrLoading={mmrLoading}
            />
          ))
        )}
      </div>
    </div>
  );
});
