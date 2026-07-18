import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import type { AnalyticsData, DataScope } from "@/lib/types";
import type { LucideIcon } from "lucide-react";
import {
  Trophy,
  Target,
  Shield,
  Crosshair,
  Zap,
  TrendingUp,
  Swords,
  Flame,
  Rocket,
  AlertTriangle,
} from "lucide-react";

interface StatItem {
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent: "blue" | "orange" | "green" | "purple" | "default";
  trend?: "up" | "down" | "flat";
  trendValue?: string;
}

interface PrimaryStatsRowProps {
  data: AnalyticsData;
  scope?: DataScope;
}

export const PrimaryStatsRow = memo(function PrimaryStatsRow({ data, scope }: PrimaryStatsRowProps) {
  const { t } = useTranslation(["analytics", "common"]);

  const items: StatItem[] = useMemo(
    () => [
      {
        label: t("analytics:stats.totalMatches"),
        value: data.totalMatches,
        icon: Swords,
        accent: "blue",
      },
      {
        label: t("analytics:stats.winRate"),
        value: `${data.winRate}%`,
        icon: Trophy,
        accent: data.winRate >= 50 ? "green" : "orange",
        trend: data.winRate >= 50 ? "up" : "down",
        trendValue: t("analytics:stats.winLossTrend", { wins: data.wins, losses: data.losses }),
      },
      {
        label: scope === "team" ? t("analytics:stats.teamGoals") : t("analytics:stats.totalGoals"),
        value: data.totalGoals,
        icon: Target,
        accent: "orange",
        trendValue: `${data.avgGoals.toFixed(1)} ${t("analytics:stats.perMatch")}`,
      },
      {
        label: scope === "team" ? t("analytics:stats.teamScore") : t("analytics:stats.avgScore"),
        value: Math.round(data.avgScore),
        icon: TrendingUp,
        accent: "purple",
      },
    ],
    [data, t, scope]
  );

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <StatCard
          key={item.label}
          label={item.label}
          value={item.value}
          icon={item.icon}
          trend={item.trend}
          trendValue={item.trendValue}
          accent={item.accent}
        />
      ))}
    </div>
  );
});

interface SecondaryStatsRowProps {
  data: AnalyticsData;
  scope?: DataScope;
  streak: { best: number; current: number };
}

export const SecondaryStatsRow = memo(function SecondaryStatsRow({ data, scope, streak }: SecondaryStatsRowProps) {
  const { t } = useTranslation(["analytics", "common"]);

  const items: StatItem[] = useMemo(
    () => [
      {
        label: scope === "team" ? t("analytics:stats.teamAssists") : t("analytics:stats.totalAssists"),
        value: data.totalAssists,
        icon: Zap,
        accent: "purple",
        trendValue: `${data.avgAssists.toFixed(1)} ${t("analytics:stats.perMatch")}`,
      },
      {
        label: scope === "team" ? t("analytics:stats.teamSaves") : t("analytics:stats.totalSaves"),
        value: data.totalSaves,
        icon: Shield,
        accent: "blue",
        trendValue: `${data.avgSaves.toFixed(1)} ${t("analytics:stats.perMatch")}`,
      },
      {
        label: scope === "team" ? t("analytics:stats.teamShots") : t("analytics:stats.totalShots"),
        value: data.totalShots,
        icon: Crosshair,
        accent: "orange",
        trendValue: `${data.avgShots.toFixed(1)} ${t("analytics:stats.perMatch")}`,
      },
      {
        label: scope === "team" ? t("analytics:stats.teamDemos") : t("analytics:stats.totalDemos"),
        value: data.totalDemos,
        icon: Flame,
        accent: "orange",
      },
      {
        label: t("analytics:stats.totalKickoffGoalsScored"),
        value: data.totalKickoffGoalsScored,
        icon: Rocket,
        accent: "green",
        trendValue: `${data.avgKickoffGoalsScored.toFixed(1)} ${t("analytics:stats.perMatch")}`,
      },
      {
        label: t("analytics:stats.totalKickoffGoalsConceded"),
        value: data.totalKickoffGoalsConceded,
        icon: AlertTriangle,
        accent: "orange",
        trendValue: `${data.avgKickoffGoalsConceded.toFixed(1)} ${t("analytics:stats.perMatch")}`,
      },
    ],
    [data, t, scope]
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <StatCard
          key={item.label}
          label={item.label}
          value={item.value}
          icon={item.icon}
          trend={item.trend}
          trendValue={item.trendValue}
          accent={item.accent}
        />
      ))}
      <StreakCompactCard best={streak.best} current={streak.current} />
    </div>
  );
});

function StreakCompactCard({ best, current }: { best: number; current: number }) {
  const { t } = useTranslation(["analytics", "common"]);

  return (
    <Card className="flex items-center gap-4 border-l-[3px] border-l-accent-success p-4 sm:col-span-3 xl:col-span-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-success-subtle text-accent-success">
        <Flame size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">{t("analytics:streaks.label")}</p>
        <div className="mt-1 flex items-center gap-4">
          <div>
            <span className="font-mono text-xl font-bold tracking-tight text-text-primary">{current}</span>
            <span className="ml-1.5 text-[10px] text-text-tertiary">{t("analytics:streaks.current")}</span>
          </div>
          <div className="h-7 w-px bg-border-subtle" />
          <div>
            <span className="font-mono text-xl font-bold tracking-tight text-accent-success">{best}</span>
            <span className="ml-1.5 text-[10px] text-text-tertiary">{t("analytics:streaks.best")}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
