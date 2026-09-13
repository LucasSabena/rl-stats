import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useAnalytics, useCareerRecords } from "@/hooks/useAnalytics";
import { useFriends } from "@/hooks/useFriends";
import { useSettings } from "@/hooks/useSettings";
import { ShareModal } from "@/components/share/ShareModal";
import { buildSummaryShareContext } from "@/lib/shareContext";
import { Button } from "@/components/ui/Button";
import type { ShareContext } from "@/lib/types";
import { evaluateAchievements } from "@/lib/achievements";
import { formatDuration, formatNumber } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Flame,
  Gauge,
  Share2,
  Trophy,
  Medal,
} from "lucide-react";

const RECORD_ICONS: Record<string, typeof Trophy> = {
  score: Trophy,
  goals: Flame,
  assists: Gauge,
  saves: Medal,
  demos: Flame,
  speed: Gauge,
};

export function RecordsPage() {
  const { t, i18n } = useTranslation(["records", "common"]);
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useCareerRecords();
  const monthQuery = useAnalytics("month");
  const { data: friends } = useFriends();
  const { data: settings } = useSettings();
  const [shareContext, setShareContext] = useState<ShareContext | null>(null);

  const month = monthQuery.data?.data;
  const monthShareContext = useMemo(() => {
    if (!month || month.totalMatches === 0) return null;
    const label = new Intl.DateTimeFormat(i18n.language, {
      month: "long",
      year: "numeric",
    }).format(new Date());
    return buildSummaryShareContext(
      month,
      (friends ?? []).map((friend) => friend.name),
      settings?.playerName ?? t("common:self"),
      t("records:recap.title"),
      label
    );
  }, [friends, i18n.language, month, settings?.playerName, t]);

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const winRate =
    data && data.totalMatches > 0
      ? Math.round((data.wins / data.totalMatches) * 100)
      : 0;

  const achievements = data ? evaluateAchievements(data) : [];
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <PageContainer>
      <div className="space-y-6 pb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">
            {t("records:title")}
          </h1>
          <p className="mt-1 text-sm text-text-muted">{t("records:subtitle")}</p>
        </div>

        {isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-28 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        )}

        {isError && (
          <EmptyState
            icon={AlertTriangle}
            title={t("common:errorBoundary.title", { defaultValue: "Algo salió mal" })}
            actionLabel={t("common:buttons.retry")}
            onAction={() => void refetch()}
          />
        )}

        {!isLoading && !isError && data?.available === false && (
          <EmptyState
            icon={Trophy}
            title={t("records:empty.title")}
            description={t("records:summary.noIdentity")}
          />
        )}

        {!isLoading && !isError && data && data.available !== false && data.totalMatches === 0 && (
          <EmptyState
            icon={Trophy}
            title={t("records:empty.title")}
            description={t("records:empty.description")}
            actionLabel={t("home:noData.cta", {
              defaultValue: "Configurar Stats API",
            })}
            onAction={() => navigate("/settings?tab=game")}
          />
        )}

        {data && data.available !== false && data.totalMatches > 0 && (
          <>
            {/* Career totals */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t("records:career.title")}
                </h2>
                <p className="text-xs text-text-tertiary">
                  {data.firstMatch &&
                    t("records:summary.since", {
                      date: dateFormatter.format(new Date(data.firstMatch)),
                    })}
                  {data.lastMatch && (
                    <>
                      {" · "}
                      {t("records:summary.lastMatch", {
                        date: dateFormatter.format(new Date(data.lastMatch)),
                      })}
                    </>
                  )}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label={t("records:career.matches")}
                  value={data.totalMatches}
                  icon={Trophy}
                  accent="blue"
                />
                <StatCard
                  label={t("records:career.winRate")}
                  value={`${winRate}%`}
                  icon={Medal}
                  accent={winRate >= 50 ? "green" : "orange"}
                  trendValue={`${data.wins}V · ${data.losses}D`}
                />
                <StatCard
                  label={t("records:career.goals")}
                  value={data.totalGoals}
                  icon={Flame}
                  accent="orange"
                />
                <StatCard
                  label={t("records:career.assists")}
                  value={data.totalAssists}
                  icon={Gauge}
                  accent="purple"
                />
                <StatCard
                  label={t("records:career.saves")}
                  value={data.totalSaves}
                  icon={Medal}
                  accent="blue"
                />
                <StatCard
                  label={t("records:career.demos")}
                  value={data.totalDemos}
                  icon={Flame}
                  accent="orange"
                />
                <StatCard
                  label={t("records:career.hatTricks")}
                  value={data.hatTricks}
                  icon={Trophy}
                  accent="purple"
                />
                <StatCard
                  label={t("records:career.playtime")}
                  value={formatDuration(data.playtimeSeconds)}
                  icon={CalendarDays}
                  accent="default"
                />
              </div>
            </section>

            {/* This month recap */}
            {month && month.totalMatches > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t("records:recap.title")}
                  </h2>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={Share2}
                    disabled={!monthShareContext}
                    onClick={() =>
                      monthShareContext && setShareContext(monthShareContext)
                    }
                  >
                    {t("common:buttons.share")}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <Card className="p-4">
                    <p className="text-xs text-text-tertiary">
                      {t("records:recap.matches")}
                    </p>
                    <p className="numeral mt-1 text-2xl font-bold text-text-primary">
                      {month.totalMatches}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-text-tertiary">
                      {t("records:recap.winRate")}
                    </p>
                    <p
                      className={
                        (month.winRate ?? 0) >= 50
                          ? "numeral mt-1 text-2xl font-bold text-accent-success"
                          : "numeral mt-1 text-2xl font-bold text-text-primary"
                      }
                    >
                      {month.winRate}%
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-text-tertiary">
                      {t("records:recap.goals")}
                    </p>
                    <p className="numeral mt-1 text-2xl font-bold text-text-primary">
                      {month.totalGoals}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-text-tertiary">
                      {t("records:recap.streak")}
                    </p>
                    <p className="numeral mt-1 text-2xl font-bold text-text-primary">
                      {month.bestStreak}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-text-tertiary">
                      {t("records:recap.playtime")}
                    </p>
                    <p className="numeral mt-1 text-2xl font-bold text-text-primary">
                      {formatDuration(
                        Math.round(month.avgDuration * month.totalMatches)
                      )}
                    </p>
                  </Card>
                </div>
              </section>
            )}

            {/* Personal records */}
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t("records:records.title")}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.records.map((record) => {
                  const Icon = RECORD_ICONS[record.id] ?? Trophy;
                  const isSpeed = record.id === "speed";
                  return (
                    <Card
                      key={record.id}
                      className="flex items-center gap-3 p-4 transition-colors hover:border-border-highlight"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-primary-muted text-accent-primary">
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-text-tertiary">
                          {t(`records:records.${record.id}`)}
                        </p>
                        <p className="numeral text-xl font-bold text-text-primary">
                          {isSpeed
                            ? `${formatNumber(Math.round(record.value))} uu/s`
                            : formatNumber(Math.round(record.value))}
                        </p>
                        {record.startTime && (
                          <p className="truncate text-[10px] text-text-tertiary">
                            {dateFormatter.format(new Date(record.startTime))}
                          </p>
                        )}
                      </div>
                      {record.matchId != null && (
                        <button
                          type="button"
                          onClick={() => navigate(`/history/${record.matchId}`)}
                          aria-label={t("records:records.viewMatch")}
                          title={t("records:records.viewMatch")}
                          className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-accent-primary"
                        >
                          <ArrowRight size={15} />
                        </button>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>

            {/* Highlights */}
            {(data.bestDay || data.bestSession || data.longestSession) && (
              <section className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t("records:highlights.title")}
                </h2>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {data.bestDay && (
                    <Card className="p-4">
                      <p className="text-xs text-text-tertiary">
                        {t("records:highlights.bestDay")}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-text-primary">
                        {dateFormatter.format(new Date(data.bestDay.date))}
                      </p>
                      <p className="mt-1 text-xs text-text-secondary">
                        {t("records:highlights.wins", { wins: data.bestDay.wins })} ·{" "}
                        {t("records:highlights.matches", {
                          count: data.bestDay.matches,
                        })}{" "}
                        · {data.bestDay.winRate}%
                      </p>
                    </Card>
                  )}
                  {data.bestSession && (
                    <button
                      type="button"
                      onClick={() => navigate(`/sessions/${data.bestSession?.id}`)}
                      className="text-left"
                    >
                      <Card className="p-4 transition-colors hover:border-border-highlight">
                        <p className="text-xs text-text-tertiary">
                          {t("records:highlights.bestSession")}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-text-primary">
                          {dateFormatter.format(new Date(data.bestSession.startTime))}
                        </p>
                        <p className="mt-1 text-xs text-text-secondary">
                          {t("records:highlights.matches", {
                            count: data.bestSession.matchCount,
                          })}{" "}
                          · {data.bestSession.winRate}% WR
                        </p>
                      </Card>
                    </button>
                  )}
                  {data.longestSession && (
                    <button
                      type="button"
                      onClick={() => navigate(`/sessions/${data.longestSession?.id}`)}
                      className="text-left"
                    >
                      <Card className="p-4 transition-colors hover:border-border-highlight">
                        <p className="text-xs text-text-tertiary">
                          {t("records:highlights.longestSession")}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-text-primary">
                          {dateFormatter.format(
                            new Date(data.longestSession.startTime)
                          )}
                        </p>
                        <p className="mt-1 text-xs text-text-secondary">
                          {t("records:highlights.duration", {
                            minutes: Math.round(data.longestSession.durationSeconds / 60),
                          })}{" "}
                          ·{" "}
                          {t("records:highlights.matches", {
                            count: data.longestSession.matchCount,
                          })}
                        </p>
                      </Card>
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* Achievements */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t("records:achievements.title")}
                </h2>
                <p className="text-xs text-text-tertiary">
                  {unlockedCount} / {achievements.length}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {achievements.map(({ def, current, unlocked, progress }) => {
                  const Icon = def.icon;
                  return (
                    <Card
                      key={def.id}
                      className={
                        unlocked
                          ? "p-4 border-accent-primary/30 bg-accent-primary-muted/20"
                          : "p-4 opacity-80"
                      }
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={
                            unlocked
                              ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-primary text-accent-primary-fg"
                              : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-text-tertiary"
                          }
                        >
                          <Icon size={16} aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-text-primary">
                              {t(`records:achievements.items.${def.id}.title`)}
                            </p>
                            <span
                              className={
                                unlocked
                                  ? "shrink-0 rounded-full bg-accent-success-subtle px-2 py-0.5 text-[10px] font-semibold text-accent-success"
                                  : "shrink-0 rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] font-semibold text-text-tertiary"
                              }
                            >
                              {unlocked
                                ? t("records:achievements.unlocked")
                                : t("records:achievements.locked")}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-text-secondary">
                            {t(`records:achievements.items.${def.id}.description`)}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <ProgressBar value={progress * 100} className="flex-1" />
                            <span className="shrink-0 text-[10px] tabular text-text-tertiary">
                              {t("records:achievements.progress", {
                                current: formatNumber(current),
                                target: formatNumber(def.target),
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>

      <ShareModal
        isOpen={shareContext !== null}
        onClose={() => setShareContext(null)}
        context={shareContext}
      />
    </PageContainer>
  );
}
