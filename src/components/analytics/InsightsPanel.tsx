import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { HeatmapPanel } from "@/components/analytics/HeatmapPanel";
import { HoursWheel } from "@/components/analytics/HoursWheel";
import {
  Clock,
  Trophy,
  Target,
  Gauge,
  Sparkles,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { AnalyticsData, InsightsData } from "@/lib/types";

export function InsightsPanel({
  insights,
  isLoading,
  summary,
}: {
  insights?: InsightsData;
  isLoading: boolean;
  summary?: AnalyticsData;
}) {
  const { t } = useTranslation(["analytics", "common"]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <Sparkles size={18} className="text-accent-primary" />
          {t("analytics:insights.title")}
        </h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!insights?.available) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <Sparkles size={18} className="text-accent-primary" />
        {t("analytics:insights.title")}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {insights.playlists && insights.playlists.length > 0 && (
          <Card className="p-4">
            <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold text-text-tertiary">
              <Trophy size={14} /> {t("analytics:insights.byPlaylist")}
            </h4>
            <div className="space-y-2">
              {insights.playlists.slice(0, 5).map((p) => (
                <div key={p.name} className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-text-tertiary">{t("analytics:insights.gamesPlayed", { count: p.played })}</span>
                    <span className={p.winRate >= 50 ? "text-accent-success" : "text-accent-danger"}>
                      {p.winRate}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {insights.byHour && insights.byHour.length > 0 && (
          <Card className="p-4 sm:col-span-2">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-2">
              <h4 className="text-sm font-medium text-text-primary">
                {t("analytics:insights.bestHour")}
              </h4>
              <p className="text-sm text-text-secondary">
                {t("analytics:insights.bestHourDetail", { hour: insights.bestHour })}
                <span className="text-accent-success">{insights.bestHourWR}%</span>
              </p>
            </div>
            <HoursWheel data={insights.byHour} minSample={insights.minSample ?? 3} />
          </Card>
        )}

        {insights.byArena && insights.byArena.length > 0 && (
          <Card className="p-4">
            <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold text-text-tertiary">
              <Trophy size={14} /> {t("analytics:insights.byArena")}
            </h4>
            <div className="space-y-2">
              {insights.byArena.slice(0, 5).map((a) => (
                <div key={a.name} className="flex items-center justify-between text-xs">
                  <span className="max-w-[60%] truncate text-text-secondary">{a.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-text-tertiary">{t("analytics:insights.gamesPlayed", { count: a.played })}</span>
                    <span className={a.winRate >= 50 ? "text-accent-success" : "text-accent-danger"}>
                      {a.winRate}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold text-text-tertiary">
            <Gauge size={14} /> {t("analytics:insights.situational")}
          </h4>
          <div className="space-y-3 text-xs">
            {insights.otGames && insights.otGames > 0 ? (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <Clock size={12} className="text-accent-warning" />
                    {t("analytics:insights.overtime", { count: insights.otGames })}
                  </span>
                  <span className={(insights.otWinRate ?? 0) >= 50 ? "text-accent-success" : "text-accent-danger"}>
                    {insights.otWinRate ?? 0}%
                  </span>
                </div>
                <div className="flex gap-3 pl-5 text-[10px] text-text-tertiary">
                  <span className="text-accent-success">{t("analytics:insights.wonCount", { count: insights.otWins ?? 0 })}</span>
                  <span className="text-accent-danger">{t("analytics:insights.lostCount", { count: insights.otLosses ?? 0 })}</span>
                </div>
              </div>
            ) : null}
            {insights.closeGames && insights.closeGames > 0 ? (
              <div className="flex justify-between">
                <span className="text-text-secondary">{t("analytics:insights.closeGames", { count: insights.closeGames })}</span>
                <span className={(insights.closeWinRate ?? 0) >= 50 ? "text-accent-success" : "text-accent-danger"}>
                  {insights.closeWinRate ?? 0}%
                </span>
              </div>
            ) : null}
            {insights.blowoutGames && insights.blowoutGames > 0 ? (
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-text-secondary">{t("analytics:insights.blowouts", { count: insights.blowoutGames })}</span>
                  <span className={(insights.blowoutWinRate ?? 0) >= 50 ? "text-accent-success" : "text-accent-danger"}>
                    {insights.blowoutWinRate ?? 0}%
                  </span>
                </div>
                <div className="flex gap-3 pl-0 text-[10px] text-text-tertiary">
                  <span className="flex items-center gap-1 text-accent-success">
                    <TrendingUp size={11} /> {t("analytics:insights.wonCount", { count: insights.blowoutWins ?? 0 })}
                  </span>
                  <span className="flex items-center gap-1 text-accent-danger">
                    <TrendingDown size={11} /> {t("analytics:insights.lostCount", { count: insights.blowoutLosses ?? 0 })}
                  </span>
                </div>
              </div>
            ) : null}
            {insights.comebackWins && insights.comebackWins > 0 ? (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <TrendingUp size={12} className="text-accent-success" />
                  {t("analytics:insights.comebacks", { count: insights.comebackWins })}
                </span>
                <span className="text-accent-success">{t("analytics:insights.wonCount", { count: insights.comebackWins })}</span>
              </div>
            ) : null}
            {insights.collapseLosses && insights.collapseLosses > 0 ? (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <TrendingDown size={12} className="text-accent-danger" />
                  {t("analytics:insights.collapses", { count: insights.collapseLosses })}
                </span>
                <span className="text-accent-danger">{t("analytics:insights.lostCount", { count: insights.collapseLosses })}</span>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <HeatmapPanel insights={insights} />

      {insights.contrib && (
        <Card className="p-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold text-text-tertiary">
            <Target size={14} /> {t("analytics:insights.contribution")}
          </h4>
          <div className="space-y-2">
            {[
              { labelKey: "analytics:insights.contrib.goals", pct: insights.contrib.goalsPct, color: "bg-accent-primary" },
              { labelKey: "analytics:insights.contrib.assists", pct: insights.contrib.assistsPct, color: "bg-accent-secondary" },
              { labelKey: "analytics:insights.contrib.saves", pct: insights.contrib.savesPct, color: "bg-accent-warning" },
              { labelKey: "analytics:insights.contrib.shots", pct: insights.contrib.shotsPct, color: "bg-accent-purple" },
              { labelKey: "analytics:insights.contrib.demos", pct: insights.contrib.demosPct, color: "bg-accent-danger" },
            ].map((c) => (
              <div key={c.labelKey}>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-text-tertiary">{t(c.labelKey)}</span>
                  <span className="text-text-secondary">{c.pct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-bg-panel">
                  <div className={`h-full rounded-full ${c.color}`} style={{ width: `${Math.min(c.pct, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {summary && (
        <Card className="p-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold text-text-tertiary">
            <Gauge size={14} /> {t("analytics:insights.records")}
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-text-secondary">{t("analytics:stats.peakSpeed")}</span>
              <span className="font-mono font-bold text-accent-success">{Math.round(summary.peakSpeed)} km/h</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-text-secondary">{t("analytics:stats.avgDuration")}</span>
              <span className="font-mono font-bold text-text-primary">{Math.round(summary.avgDuration / 60)}m</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
