import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAnalytics, useInsights, useDailyRollups } from "@/hooks/useAnalytics";
import { useMmrHistory } from "@/hooks/useMmrHistory";
import { useMatchHistory } from "@/hooks/useMatchHistory";
import { useSettings } from "@/hooks/useSettings";
import { WeeklyGoalCard } from "@/components/analytics/WeeklyGoalCard";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sparkline } from "@/components/ui/Sparkline";
import { getArenaDisplayName } from "@/lib/arenaMap";
import { formatDuration, cn } from "@/lib/utils";
import {
  BarChart3,
  ChevronRight,
  Dumbbell,
  Flame,
  History,
  Lightbulb,
  Target,
  Trophy,
} from "lucide-react";

function greetingKey(hour: number): string {
  if (hour < 6) return "greeting.night";
  if (hour < 13) return "greeting.morning";
  if (hour < 20) return "greeting.afternoon";
  return "greeting.evening";
}

/**
 * Home hub shown on the Live page when there is no active match: today's
 * numbers, streak, weekly goal, MMR trend, an insight and the latest matches.
 */
export function HomeHub() {
  const { t, i18n } = useTranslation(["home", "analytics", "common"]);
  const navigate = useNavigate();

  const dayQuery = useAnalytics("day");
  const weekQuery = useAnalytics("week");
  const insightsQuery = useInsights("week");
  const rollupsQuery = useDailyRollups("week");
  const mmrQuery = useMmrHistory(null, null, "month");
  const historyQuery = useMatchHistory({});
  const { data: settings } = useSettings();

  const day = dayQuery.data?.data;
  const week = weekQuery.data?.data;
  const insights = insightsQuery.data;

  const recentMatches = useMemo(
    () => (historyQuery.data?.pages.flat() ?? []).slice(0, 5),
    [historyQuery.data]
  );

  const mmrSummary = useMemo(() => {
    const points = mmrQuery.data?.points ?? [];
    if (points.length === 0) return null;
    const first = points[0]?.mmr ?? 0;
    const last = points[points.length - 1]?.mmr ?? 0;
    return {
      current: last,
      delta: last - first,
      values: points.map((point) => point.mmr),
    };
  }, [mmrQuery.data]);

  const todayWinRate =
    day && day.totalMatches > 0
      ? Math.round((day.wins / day.totalMatches) * 100)
      : 0;

  const rollupValues = useMemo(
    () => (rollupsQuery.data ?? []).map((rollup) => rollup.matchesPlayed),
    [rollupsQuery.data]
  );

  const playerName = settings?.playerName?.trim();
  const greeting = t(greetingKey(new Date().getHours()));
  const dateLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const loading = dayQuery.isLoading && weekQuery.isLoading;
  const hasAnyHistory =
    (week?.totalMatches ?? 0) > 0 || recentMatches.length > 0;

  if (!loading && !hasAnyHistory) {
    return (
      <div className="py-6">
        <EmptyState
          icon={Trophy}
          title={t("home:noData.title")}
          description={t("home:noData.description")}
          actionLabel={t("home:noData.cta")}
          onAction={() => navigate("/settings?tab=game")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-text-primary">
            {greeting}
            {playerName ? `, ${playerName}` : ""}
          </h2>
          <p className="mt-0.5 text-sm capitalize text-text-muted">{dateLabel}</p>
        </div>
        <Link
          to="/records"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-panel px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <Trophy size={13} />
          {t("home:quick.records")}
          <ChevronRight size={13} />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* Today + streak */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-text-tertiary">{t("home:today.matches")}</p>
              <p className="numeral mt-1 text-2xl font-bold text-text-primary">
                {day?.totalMatches ?? 0}
              </p>
              <Sparkline
                values={rollupValues.length > 1 ? rollupValues : [0, 0]}
                width={100}
                height={22}
                className="mt-2"
                ariaLabel={t("home:today.matches")}
              />
            </Card>
            <Card className="p-4">
              <p className="text-xs text-text-tertiary">{t("home:today.winRate")}</p>
              <p
                className={cn(
                  "numeral mt-1 text-2xl font-bold",
                  todayWinRate >= 50 ? "text-accent-success" : "text-text-primary"
                )}
              >
                {todayWinRate}%
              </p>
              <p className="mt-1 text-[11px] text-text-tertiary">
                {(day?.wins ?? 0)}V · {(day?.losses ?? 0)}D
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-text-tertiary">{t("home:today.goals")}</p>
              <p className="numeral mt-1 text-2xl font-bold text-text-primary">
                {day?.totalGoals ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-text-tertiary">
                {t("home:today.playtime")}: {formatDuration(day?.avgDuration ?? 0)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-text-tertiary">{t("home:streak.label")}</p>
              <p className="numeral mt-1 flex items-center gap-1.5 text-2xl font-bold text-text-primary">
                <Flame
                  size={18}
                  className={
                    (week?.currentStreak ?? 0) > 0
                      ? "text-accent-secondary"
                      : "text-text-tertiary"
                  }
                />
                {week?.currentStreak ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-text-tertiary">
                {t("home:streak.best")}: {week?.bestStreak ?? 0}
              </p>
            </Card>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Weekly goal */}
            <WeeklyGoalCard
              matches={week?.totalMatches ?? 0}
              wins={week?.wins ?? 0}
            />

            {/* MMR */}
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t("home:mmr.title")}
                </p>
                <Link
                  to="/analytics"
                  className="text-[11px] text-accent-primary hover:underline"
                >
                  {t("home:quick.analytics")}
                </Link>
              </div>
              {mmrSummary ? (
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="numeral text-2xl font-bold text-text-primary">
                      {mmrSummary.current}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-xs font-semibold",
                        mmrSummary.delta > 0
                          ? "text-accent-success"
                          : mmrSummary.delta < 0
                            ? "text-accent-danger"
                            : "text-text-tertiary"
                      )}
                    >
                      {mmrSummary.delta > 0
                        ? t("home:mmr.deltaUp", { delta: mmrSummary.delta })
                        : mmrSummary.delta < 0
                          ? t("home:mmr.deltaDown", { delta: Math.abs(mmrSummary.delta) })
                          : t("home:mmr.flat")}
                    </p>
                  </div>
                  <Sparkline
                    values={mmrSummary.values}
                    width={140}
                    height={40}
                    ariaLabel={t("home:mmr.title")}
                  />
                </div>
              ) : (
                <p className="mt-3 text-sm text-text-tertiary">{t("home:mmr.none")}</p>
              )}
            </Card>
          </div>

          {/* Recommendation */}
          {insights?.available && (
            <Card className="flex items-start gap-3 border-accent-primary/25 bg-accent-primary-muted/20 p-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-primary text-accent-primary-fg">
                <Lightbulb size={15} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent-primary">
                  {t("home:recommendation.title")}
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {insights.bestHour != null && (insights.bestHourWR ?? 0) > 0
                    ? t("home:recommendation.bestHour", {
                        hour: insights.bestHour,
                        rate: insights.bestHourWR,
                      })
                    : t("home:recommendation.improve", {
                        delta: Math.max(0, (day?.winRate ?? 0) - 50),
                      })}
                </p>
              </div>
            </Card>
          )}

          {/* Recent matches */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t("home:recent.title")}
              </h3>
              <Link
                to="/history"
                className="text-[11px] text-accent-primary hover:underline"
              >
                {t("home:recent.viewAll")}
              </Link>
            </div>
            {recentMatches.length === 0 ? (
              <p className="text-sm text-text-tertiary">{t("home:today.empty")}</p>
            ) : (
              <div className="space-y-1.5">
                {recentMatches.map((match) => {
                  const won =
                    match.localTeamNum != null &&
                    match.winnerTeamNum === match.localTeamNum;
                  const lost =
                    match.localTeamNum != null &&
                    match.winnerTeamNum != null &&
                    match.winnerTeamNum !== match.localTeamNum;
                  return (
                    <button
                      key={match.id}
                      type="button"
                      onClick={() => navigate(`/history/${match.id}`)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border-subtle bg-bg-panel px-3 py-2 text-left transition-colors hover:bg-bg-hover"
                    >
                      <span
                        className={cn(
                          "h-8 w-1 shrink-0 rounded-full",
                          won
                            ? "bg-accent-success"
                            : lost
                              ? "bg-accent-danger"
                              : "bg-text-tertiary"
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-text-primary">
                          {match.arena
                            ? getArenaDisplayName(match.arena)
                            : match.matchType === "training"
                              ? t("home:quick.training")
                              : "—"}
                        </span>
                        <span className="block text-[11px] text-text-tertiary">
                          {new Intl.DateTimeFormat(i18n.language, {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(match.startTime * 1000))}
                        </span>
                      </span>
                      <span className="numeral shrink-0 text-sm font-bold text-text-primary">
                        {match.teamBlueScore} : {match.teamOrangeScore}
                      </span>
                      <ChevronRight size={14} className="shrink-0 text-text-tertiary" />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Quick actions */}
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { to: "/analytics", icon: BarChart3, label: t("home:quick.analytics") },
              { to: "/history", icon: History, label: t("home:quick.history") },
              { to: "/training-packs", icon: Dumbbell, label: t("home:quick.training") },
              { to: "/records", icon: Target, label: t("home:quick.records") },
            ].map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-panel px-3 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <action.icon size={14} className="text-accent-primary" />
                <span className="truncate">{action.label}</span>
              </Link>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
