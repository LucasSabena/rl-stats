import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useSessionList } from "@/hooks/useAnalytics";
import { cn, formatDuration } from "@/lib/utils";
import { AlertTriangle, Clock, Flame, Swords, Trophy } from "lucide-react";

type SortMode = "recent" | "best" | "longest";

export function SessionsPage() {
  const { t, i18n } = useTranslation(["sessions", "common"]);
  const [sort, setSort] = useState<SortMode>("recent");
  const { data, isLoading, isError, refetch } = useSessionList({});

  const sessions = useMemo(() => {
    const list = [...(data ?? [])];
    if (sort === "best") {
      list.sort((a, b) => {
        const rateA = a.match_count > 0 ? a.wins / a.match_count : 0;
        const rateB = b.match_count > 0 ? b.wins / b.match_count : 0;
        if (rateB !== rateA) return rateB - rateA;
        return b.match_count - a.match_count;
      });
    } else if (sort === "longest") {
      list.sort((a, b) => b.duration_seconds - a.duration_seconds);
    }
    return list;
  }, [data, sort]);

  const bestSessionId = useMemo(() => {
    const candidates = (data ?? []).filter((session) => session.match_count >= 3);
    if (candidates.length === 0) return null;
    return candidates.reduce((best, current) => {
      const rateBest = best.wins / best.match_count;
      const rateCurrent = current.wins / current.match_count;
      if (rateCurrent > rateBest) return current;
      if (rateCurrent === rateBest && current.match_count > best.match_count) return current;
      return best;
    }).id;
  }, [data]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [i18n.language]
  );

  return (
    <PageContainer>
      <div className="space-y-5 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">
              {t("sessions:title")}
            </h1>
            <p className="mt-1 text-sm text-text-muted">{t("sessions:subtitle")}</p>
          </div>
          <SegmentedControl
            aria-label={t("sessions:sortLabel")}
            size="sm"
            value={sort}
            onChange={setSort}
            options={[
              { value: "recent", label: t("sessions:sort.recent") },
              { value: "best", label: t("sessions:sort.best") },
              { value: "longest", label: t("sessions:sort.longest") },
            ]}
          />
        </div>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-[92px] rounded-xl" />
            ))}
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

        {!isLoading && !isError && sessions.length === 0 && (
          <EmptyState
            icon={Clock}
            title={t("sessions:empty.title")}
            description={t("sessions:empty.description")}
          />
        )}

        {sessions.length > 0 && (
          <>
            <p className="text-xs text-text-tertiary">
              {t("sessions:count", { count: sessions.length })}
            </p>
            <div className="space-y-2">
              {sessions.map((session) => {
                const winRate =
                  session.match_count > 0
                    ? Math.round((session.wins / session.match_count) * 100)
                    : 0;
                const goalDiff = session.goals_scored - session.goals_conceded;
                return (
                  <Link
                    key={session.id}
                    to={`/sessions/${session.id}`}
                    className="block"
                  >
                    <Card className="flex flex-wrap items-center gap-4 p-4 transition-colors hover:border-border-highlight">
                      <div className="min-w-[190px] flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-text-primary">
                            {dateFormatter.format(new Date(session.start_time))}
                          </p>
                          {bestSessionId === session.id && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent-warning-subtle px-2 py-0.5 text-[10px] font-semibold text-accent-warning">
                              <Trophy size={10} />
                              {t("sessions:best.title")}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-text-tertiary">
                          {t("sessions:list.duration")}:{" "}
                          {formatDuration(session.duration_seconds)}
                        </p>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                            {t("sessions:list.matches")}
                          </p>
                          <p className="numeral text-lg font-bold text-text-primary">
                            {session.match_count}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                            {t("sessions:list.winRate")}
                          </p>
                          <p
                            className={cn(
                              "numeral text-lg font-bold",
                              winRate >= 50
                                ? "text-accent-success"
                                : "text-accent-danger"
                            )}
                          >
                            {winRate}%
                          </p>
                        </div>
                        <div className="hidden text-center sm:block">
                          <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                            {t("sessions:list.goals")}
                          </p>
                          <p className="numeral text-lg font-bold text-text-primary">
                            {goalDiff > 0 ? `+${goalDiff}` : goalDiff}
                          </p>
                        </div>
                        <div className="hidden items-center gap-1.5 text-xs sm:flex">
                          <span className="flex items-center gap-1 text-accent-success">
                            <Trophy size={12} />
                            {session.wins}
                          </span>
                          <span className="flex items-center gap-1 text-accent-danger">
                            <Swords size={12} />
                            {session.losses}
                          </span>
                          {session.unknown > 0 && (
                            <span className="flex items-center gap-1 text-text-tertiary">
                              <Flame size={12} />
                              {session.unknown}
                            </span>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
