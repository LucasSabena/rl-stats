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
  /** Playlist of the current match, so rank is derived on the right ladder. */
  playlist?: string | null;
}

export const TeamPanel = memo(function TeamPanel({
  team,
  players,
  mmrByPlayerId,
  headToHeadByPlayerId,
  localPrimaryId,
  mmrLoading,
  isLocalMatch,
  playlist,
}: TeamPanelProps) {
  const { t } = useTranslation(["live", "common"]);
  const isBlue = team === "blue";

  const averageMmr = (() => {
    const values = players
      .map((player) => mmrByPlayerId?.[player.id]?.mmr)
      .filter((value): value is number => typeof value === "number");
    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  })();

  const totalScore = players.reduce((sum, p) => sum + p.score, 0);

  return (
    <div className="min-w-0">
      <header className="flex items-baseline gap-2 border-b border-border-subtle px-4 py-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "h-2 w-2 shrink-0 self-center rounded-full",
            isBlue ? "bg-team-blue" : "bg-team-orange",
          )}
        />
        <h3 className={cn("micro-label", isBlue ? "text-team-blue" : "text-team-orange")}>
          {isBlue ? t("live:teams.blue") : t("live:teams.orange")}
        </h3>
        {averageMmr !== null && (
          <span className="tabular text-[11px] text-text-tertiary">
            {t("live:mmr.average")} {averageMmr}
          </span>
        )}
        {mmrLoading && averageMmr === null && (
          <span className="text-[11px] text-text-tertiary">{t("live:mmr.searching")}</span>
        )}
        <span className="numeral ml-auto text-base text-text-primary">{totalScore}</span>
      </header>

      <div className="divide-y divide-border-subtle">
        {players.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] text-text-muted">
            {isLocalMatch ? t("live:players.bots") : t("live:players.none")}
          </p>
        ) : (
          players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              playlist={playlist}
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
