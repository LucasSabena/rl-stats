import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PlayerLink } from "@/components/ui/PlayerLink";
import { RankInsignia } from "@/components/ui/RankInsignia";
import { deriveRank } from "@/lib/rank";
import { Crown, Medal, Rocket } from "lucide-react";
import type { PlayerStats } from "@/lib/types";
import { useFriends } from "@/hooks/useFriends";

interface TeamRosterProps {
  players: PlayerStats[];
  teamNum: 0 | 1;
  teamName: string;
  teamColorClass: "blue" | "orange";
  /** Match playlist, so rank is derived on the right ladder. */
  playlist?: string | null;
}

function getInitials(name: string): string {
  return name
    .split(/[\s_]+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export const TeamRoster = memo(function TeamRoster({
  players,
  teamNum,
  teamName,
  teamColorClass,
  playlist,
}: TeamRosterProps) {
  const { t } = useTranslation(["matchDetail", "players"]);
  const { data: friends } = useFriends();

  const sortedAllPlayers = useMemo(
    () => [...players].sort((a, b) => b.score - a.score),
    [players]
  );

  const teamPlayers = useMemo(
    () =>
      players
        .filter((p) => p.team === teamNum)
        .sort((a, b) => b.score - a.score),
    [players, teamNum]
  );

  const isBlue = teamColorClass === "blue";
  const colorText = isBlue ? "text-team-blue" : "text-team-orange";
  const colorBg = isBlue ? "bg-team-blue" : "bg-team-orange";
  const colorBgSoft = isBlue ? "bg-team-blue-bg" : "bg-team-orange-bg";

  if (teamPlayers.length === 0) return null;

  return (
    <div className="min-w-0">
      <header className="flex items-baseline gap-2 border-b border-border-subtle px-4 py-2.5">
        <span aria-hidden="true" className={cn("h-2 w-2 self-center rounded-full", colorBg)} />
        <h3 className={cn("micro-label", colorText)}>{teamName}</h3>
        <span className="ml-auto text-[11px] text-text-tertiary">
          {t("roster.playerCount", { count: teamPlayers.length })}
        </span>
      </header>

      <div className="divide-y divide-border-subtle">
        {teamPlayers.map((player) => {
          const rank = sortedAllPlayers.findIndex((p) => p.id === player.id) + 1;
          const isTop3 = rank <= 3;
          const isMVP = rank === 1;
          const playerRank = deriveRank(player.mmr ?? null, playlist);

          return (
            <div key={player.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-hover">
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-md text-[11px] font-bold",
                  colorBgSoft,
                  colorText,
                )}
              >
                {getInitials(player.name)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                  <PlayerLink player={player.id} name={player.name} className="truncate" />

                  {isTop3 && (
                    <span
                      title={isMVP ? "MVP" : `#${rank}`}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold leading-none",
                        rank === 1
                          ? "text-accent-warning"
                          : rank === 2
                            ? "text-text-secondary"
                            : "text-accent-secondary",
                      )}
                    >
                      {isMVP ? <Crown size={10} aria-hidden="true" /> : <Medal size={10} aria-hidden="true" />}
                      {isMVP ? "MVP" : `${rank}\u00ba`}
                    </span>
                  )}

                  {friends?.some((f) => f.primary_id === player.id) && (
                    <span className="shrink-0 text-[10px] text-accent-primary">
                      {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                    </span>
                  )}
                </p>

                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-text-tertiary">
                  {playerRank && (
                    <span className="flex items-center gap-1">
                      <RankInsignia rank={playerRank} size={13} />
                      <span className="tabular text-text-secondary">
                        {player.mmr != null ? `${player.mmr} · ` : ""}
                        {playerRank.label}
                      </span>
                    </span>
                  )}
                  {player.kickoffGoals ? (
                    <span className="inline-flex items-center gap-0.5 text-accent-success">
                      <Rocket size={10} aria-hidden="true" />
                      {player.kickoffGoals} {t("roster.kg")}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="numeral text-lg leading-none text-text-primary">{player.score}</p>
                <p className="tabular mt-0.5 text-[10px] text-text-tertiary">
                  {player.goals} {t("roster.gol")} · {player.assists} {t("roster.ast")} · {player.saves} {t("roster.par")}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
