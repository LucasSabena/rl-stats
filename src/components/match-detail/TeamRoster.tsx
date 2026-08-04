import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PlayerLink } from "@/components/ui/PlayerLink";
import { Crown, Medal, Rocket } from "lucide-react";
import type { PlayerStats } from "@/lib/types";
import { useFriends } from "@/hooks/useFriends";

interface TeamRosterProps {
  players: PlayerStats[];
  teamNum: 0 | 1;
  teamName: string;
  teamColorClass: "blue" | "orange";
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
}: TeamRosterProps) {
  const { t } = useTranslation(["matchDetail", "players"]);
  const { data: friends } = useFriends();

  const sortedAllPlayers = useMemo(
    () => [...players].sort((a, b) => b.score - a.score),
    [players]
  );

  const teamPlayers = useMemo(
    () => players.filter((p) => p.team === teamNum),
    [players, teamNum]
  );

  const isBlue = teamColorClass === "blue";
  const colorText = isBlue ? "text-team-blue" : "text-team-orange";
  const colorBg = isBlue ? "bg-team-blue" : "bg-team-orange";
  const colorBgSoft = isBlue ? "bg-team-blue-bg" : "bg-team-orange-bg";

  if (teamPlayers.length === 0) return null;

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface p-5 shadow-level-1">
      <div className="mb-4 flex items-center gap-2">
        <div className={cn("h-3 w-3 rounded-full", colorBg)} />
        <h3 className={cn("font-display text-sm font-bold", colorText)}>
          {teamName}
        </h3>
        <span className="ml-auto text-xs text-text-tertiary">
          {t("roster.playerCount", { count: teamPlayers.length })}
        </span>
      </div>

      <div className="space-y-2">
        {teamPlayers.map((player) => {
          const rank = sortedAllPlayers.findIndex((p) => p.id === player.id) + 1;
          const isTop3 = rank <= 3;
          const isMVP = rank === 1;
          const headToHeadLabel = player.head_to_head
            ? `Comp ${player.head_to_head.wins_together}-${player.head_to_head.losses_together} · Rival ${player.head_to_head.wins_against}-${player.head_to_head.losses_against}`
            : null;

          return (
            <div
              key={player.id}
              className="flex items-center gap-3 rounded-lg bg-bg-panel/80 p-3 transition-colors hover:bg-surface-hover/80"
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                  colorBgSoft,
                  colorText
                )}
              >
                {getInitials(player.name)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <PlayerLink
                    player={player.id}
                    name={player.name}
                    className="text-sm font-medium text-text-primary"
                  />
                  
                  {isMVP && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-warning/15 border border-accent-warning/20 px-1.5 py-0.5 text-[10px] font-bold text-accent-warning">
                      <Crown size={10} />
                      MVP
                    </span>
                  )}

                  {isTop3 && (
                    <div 
                      className={cn(
                        "flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-bold",
                        rank === 1 ? "text-yellow-400 bg-yellow-400/10" :
                        rank === 2 ? "text-gray-300 bg-gray-300/10" :
                        "text-orange-400 bg-orange-400/10"
                      )}
                      title={rank === 1 ? "Oro" : rank === 2 ? "Plata" : "Bronce"}
                    >
                      <Medal size={10} />
                      {rank}º
                    </div>
                  )}

                  {friends?.some((f) => f.primary_id === player.id) && (
                    <span className="shrink-0 rounded-full bg-accent-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-primary">
                      {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                    </span>
                  )}
                </div>
                {headToHeadLabel && (
                  <div className="mt-1 text-[10px] font-medium text-text-tertiary">
                    {headToHeadLabel}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-secondary">
                  <Stat value={player.score} label={t("roster.pts")} />
                  <Stat value={player.goals} label={t("roster.gol")} />
                  <Stat value={player.assists} label={t("roster.ast")} />
                  <Stat value={player.saves} label={t("roster.par")} />
                  {player.kickoffGoals ? (
                    <span className="inline-flex items-center gap-0.5 rounded bg-accent-success/10 px-1 py-0.5 text-[10px] font-medium text-accent-success">
                      <Rocket size={10} />
                      {player.kickoffGoals} {t("roster.kg")}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <span className="font-semibold text-text-primary">{value}</span>{" "}
      <span className="text-text-tertiary">{label}</span>
    </span>
  );
}
