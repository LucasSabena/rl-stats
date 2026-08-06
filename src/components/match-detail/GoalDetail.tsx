import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn, formatDuration } from "@/lib/utils";
import { Zap } from "lucide-react";
import { useFriends } from "@/hooks/useFriends";
import type { Goal as GoalType } from "@/lib/types";

interface GoalDetailProps {
  goals: GoalType[];
}

export const GoalDetail = memo(function GoalDetail({ goals }: GoalDetailProps) {
  const { t } = useTranslation(["matchDetail", "players"]);
  const { data: friends } = useFriends();

  if (goals.length === 0) return null;

  const team0Count = goals.filter((g) => g.scorerTeam === 0).length;
  const team1Count = goals.length - team0Count;

  return (
    <section className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
      <header className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
        <h3 className="micro-label">{t("matchDetail:goals.title")}</h3>
        <span className="flex items-baseline gap-1.5 text-sm">
          <span className="numeral text-team-blue">{team0Count}</span>
          <span aria-hidden="true" className="text-text-muted">·</span>
          <span className="numeral text-team-orange">{team1Count}</span>
        </span>
      </header>

      <div className="stagger-in divide-y divide-border-subtle/50">
        {goals.map((goal, index) => {
          const isBlue = goal.scorerTeam === 0;
          const isScorerFriend = friends?.some((f) => f.primary_id === goal.scorerId);

          return (
            <div
              key={goal.id || index}
              style={{ "--stagger-i": Math.min(index, 10) } as React.CSSProperties}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span
                aria-hidden="true"
                className={cn("h-2 w-2 shrink-0 rounded-full", isBlue ? "bg-team-blue" : "bg-team-orange")}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                  <span className="truncate">{goal.scorerName}</span>
                  {isScorerFriend && (
                    <span className="shrink-0 text-[10px] text-accent-primary">
                      {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                    </span>
                  )}
                </p>
                {goal.assisterName && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-text-secondary">
                    <Zap size={10} aria-hidden="true" className="text-accent-purple" />
                    <span className="truncate">{goal.assisterName}</span>
                  </p>
                )}
              </div>
              <span className="tabular shrink-0 text-[11px] text-text-tertiary">
                {formatDuration(goal.time)}
              </span>
              {goal.ballSpeed > 0 && (
                <span className="tabular hidden w-20 shrink-0 text-right text-[11px] text-text-tertiary sm:block">
                  {Math.round(goal.ballSpeed)} uu/s
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
});
