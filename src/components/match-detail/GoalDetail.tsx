import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Goal, UserCheck, Timer, Zap } from "lucide-react";
import { useFriends } from "@/hooks/useFriends";
import type { Goal as GoalType } from "@/lib/types";

interface GoalDetailProps {
  goals: GoalType[];
}

export const GoalDetail = memo(function GoalDetail({ goals }: GoalDetailProps) {
  const { t } = useTranslation(["matchDetail", "players"]);
  const { data: friends } = useFriends();

  if (goals.length === 0) return null;

  const team0Goals = goals.filter((g) => g.scorerTeam === 0);
  const team1Goals = goals.filter((g) => g.scorerTeam === 1);

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface p-5 shadow-level-1">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-1.5">
          <Goal size={18} className="text-yellow-400" />
          <h3 className="text-sm font-semibold text-text-primary">{t("matchDetail:goals.title")}</h3>
        </div>
        <div className="flex items-center gap-4 ml-auto">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-team-blue" />
            <span className="text-xs font-mono font-bold text-text-primary">{team0Goals.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-team-orange" />
            <span className="text-xs font-mono font-bold text-text-primary">{team1Goals.length}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {goals.map((goal, idx) => {
          const isBlue = goal.scorerTeam === 0;
          const goalNumber = (isBlue ? team0Goals.indexOf(goal) : team1Goals.indexOf(goal)) + 1;
          const teamLabel = isBlue ? t("matchDetail:teams.blueShort") : t("matchDetail:teams.orangeShort");
          
          const isScorerFriend = friends?.some(f => f.primary_id === goal.scorerId);
          const isAssisterFriend = goal.assisterId ? friends?.some(f => f.primary_id === goal.assisterId) : false;

          return (
            <Card
              key={goal.id || idx}
              className={cn(
                "group flex items-center gap-4 border-l-[3px] p-4 transition-all hover:border-l-[5px]",
                isBlue ? "border-l-team-blue" : "border-l-team-orange"
              )}
            >
              {/* Left: shooter avatar + number */}
              <div className="flex shrink-0 items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    isBlue
                      ? "bg-team-blue/15 text-team-blue"
                      : "bg-team-orange/15 text-team-orange"
                  )}
                >
                  <Goal size={18} />
                </div>
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "text-xl font-bold font-mono leading-none",
                      isBlue ? "text-team-blue" : "text-team-orange"
                    )}
                  >
                    {goalNumber}
                  </span>
                  <span className="text-[10px] font-semibold text-text-muted">{teamLabel}</span>
                </div>
              </div>

              {/* Center: scorer + assister */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {goal.scorerName}
                  </p>
                  {isScorerFriend && (
                    <span className="shrink-0 rounded-full bg-accent-primary/15 px-1 py-0.5 text-[10px] font-bold text-accent-primary">
                      {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                    </span>
                  )}
                </div>
                {goal.assisterName && (
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="flex items-center gap-1 text-xs text-text-secondary">
                      <UserCheck size={11} className="text-text-tertiary" />
                      <span className="font-medium text-text-primary">{goal.assisterName}</span>
                    </p>
                    {isAssisterFriend && (
                      <span className="shrink-0 rounded-full bg-accent-primary/15 px-1 py-0.5 text-[10px] font-bold text-accent-primary">
                        {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Right: time + ball speed */}
              <div className="flex shrink-0 items-center gap-4 text-right">
                <div className="flex items-center gap-1.5">
                  <Timer size={13} className="text-text-muted" />
                  <span className="font-mono text-xs font-semibold text-text-secondary">
                    {formatDuration(goal.time)}
                  </span>
                </div>
                {goal.ballSpeed > 0 && (
                  <div className="flex items-center gap-1">
                    <Zap size={13} className="text-yellow-500/60" />
                    <span className="font-mono text-xs font-semibold text-text-secondary">
                      {Math.round(goal.ballSpeed)} uu/s
                    </span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
});