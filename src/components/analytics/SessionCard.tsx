import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { Card } from "@/components/ui/Card";
import {
  Clock,
  Calendar,
  Trophy,
  Swords,
  ChevronRight,
  Zap,
  Flame,
} from "lucide-react";
import type { MatchSession } from "@/lib/types";

export function SessionCard({
  session,
  onClick,
}: {
  session: MatchSession;
  onClick: () => void;
}) {
  const { t } = useTranslation(["analytics", "common"]);
  const startDate = new Date(session.start_time);
  const dateStr = startDate.toLocaleDateString(i18n.language, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const durationMin = Math.round(session.duration_seconds / 60);
  const winRate =
    session.match_count > 0
      ? Math.round((session.wins / session.match_count) * 100)
      : 0;
  const goalDiff = session.goals_scored - session.goals_conceded;

  return (
    <Card
      className="cursor-pointer p-4 transition-all hover:shadow-level-2"
      onClick={onClick}
      aria-label={t("analytics:sessions.ariaLabel", { date: dateStr, count: session.match_count, winRate })}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-text-tertiary" />
          <span className="text-xs text-text-secondary">{dateStr}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <Clock size={12} />
          <span>{durationMin}m</span>
          <ChevronRight size={14} className="text-accent-primary" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center">
          <p className="text-[10px] text-text-tertiary">{t("analytics:sessions.kpi.matches")}</p>
          <p className="numeral text-lg font-bold text-text-primary">{session.match_count}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-text-tertiary">{t("analytics:sessions.kpi.wr")}</p>
          <p className={`font-mono text-lg font-bold ${winRate >= 50 ? "text-accent-success" : "text-accent-danger"}`}>
            {winRate}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-text-tertiary">{t("analytics:sessions.kpi.goals")}</p>
          <p className="numeral text-lg font-bold text-text-primary">
            {goalDiff > 0 ? `+${goalDiff}` : goalDiff}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-text-tertiary">{t("analytics:sessions.kpi.shots")}</p>
          <p className="numeral text-lg font-bold text-text-primary">{session.total_shots}</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border-subtle pt-2.5 text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-accent-success">
            <Trophy size={12} /> {session.wins}{t("analytics:sessions.winsLabel")}
          </span>
          <span className="flex items-center gap-1 text-accent-danger">
            <Swords size={12} /> {session.losses}{t("analytics:sessions.lossesLabel")}
          </span>
          {session.unknown > 0 && (
            <span className="text-text-tertiary">? {session.unknown}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-text-tertiary">
          <span className="flex items-center gap-1" title={t("analytics:sessions.assistsTitle")}>
            <Zap size={12} className="text-accent-purple" />
            <span className="text-text-secondary">{session.total_assists}</span>
          </span>
          <span className="flex items-center gap-1" title={t("analytics:sessions.demosTitle")}>
            <Flame size={12} className="text-accent-secondary" />
            <span className="text-text-secondary">{session.total_demos}</span>
          </span>
        </div>
      </div>
    </Card>
  );
}
