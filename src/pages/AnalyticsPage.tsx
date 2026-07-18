import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { useAnalytics, useSessionMatches, useInsights } from "@/hooks/useAnalytics";
import { useFriends } from "@/hooks/useFriends";
import { useSettings } from "@/hooks/useSettings";
import { PrimaryStatsRow, SecondaryStatsRow } from "@/components/analytics/StatsGrid";
import { PerformanceChart } from "@/components/analytics/PerformanceChart";
import { AnalyticsFilters } from "@/components/analytics/AnalyticsFilters";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ShareModal } from "@/components/share/ShareModal";
import { buildDayShareContext, buildWeekShareContext, buildSessionShareContext, buildSummaryShareContext } from "@/lib/shareContext";
import type { AnalyticsPeriod, MatchSession, SessionMatch, PlaylistFilter, MatchTypeFilter, DataScope, AnalyticsData, InsightsData, ShareContext } from "@/lib/types";
import {
  BarChart3,
  Clock,
  Calendar,
  Trophy,
  Target,
  Swords,
  ChevronRight,
  X,
  Gauge,
  Zap,
  Flame,
  Sparkles,
  Share2,
  Users,
} from "lucide-react";

function SessionCard({
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
      className="cursor-pointer p-4 transition-all hover:shadow-level-2 hover:-translate-y-0.5"
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
          <p className="text-[10px] uppercase tracking-wider text-text-tertiary">{t("analytics:sessions.kpi.matches")}</p>
          <p className="font-mono text-lg font-bold text-text-primary">{session.match_count}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-text-tertiary">{t("analytics:sessions.kpi.wr")}</p>
          <p className={`font-mono text-lg font-bold ${winRate >= 50 ? "text-accent-success" : "text-accent-danger"}`}>
            {winRate}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-text-tertiary">{t("analytics:sessions.kpi.goals")}</p>
          <p className="font-mono text-lg font-bold text-text-primary">
            {goalDiff > 0 ? `+${goalDiff}` : goalDiff}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-text-tertiary">{t("analytics:sessions.kpi.shots")}</p>
          <p className="font-mono text-lg font-bold text-text-primary">{session.total_shots}</p>
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


function SessionMatchDetail({ matches }: { matches: SessionMatch[] }) {
  const { t } = useTranslation(["analytics", "common", "players"]);
  const { data: friends } = useFriends();

  if (matches.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-text-secondary">{t("analytics:matchDetail.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {matches.map((m) => {
        const startDate = new Date(m.start_time);
        const timeStr = startDate.toLocaleTimeString(i18n.language, {
          hour: "2-digit",
          minute: "2-digit",
        });
        const myTeam = m.local_team ?? -1;
        const myScore =
          myTeam === 0 ? m.score_blue : myTeam === 1 ? m.score_orange : "?";
        const theirScore =
          myTeam === 0 ? m.score_orange : myTeam === 1 ? m.score_blue : "?";

        const myPlayer = m.players.find((p) => p.team_num === m.local_team);
        const teammates = m.players.filter((p) => p.team_num === m.local_team && p.primary_id !== myPlayer?.primary_id);

        return (
          <div
            key={m.id}
            className={`rounded-lg border p-3 transition-colors ${
              m.is_win
                ? "border-accent-success/20 bg-accent-success/5"
                : "border-accent-danger/20 bg-accent-danger/5"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-bold ${
                    m.is_win
                      ? "bg-accent-success/20 text-accent-success"
                      : "bg-accent-danger/20 text-accent-danger"
                  }`}
                >
                  {m.is_win ? t("analytics:matchDetail.win") : t("analytics:matchDetail.loss")}
                </span>
                <span className="text-sm text-text-primary">
                  {myScore} - {theirScore}
                </span>
                <span className="text-[10px] text-text-tertiary">{timeStr}</span>
                
                {teammates.length > 0 && (
                  <div className="flex items-center gap-1.5 border-l border-border-subtle pl-3">
                    <Users size={12} className="text-text-tertiary" />
                    <div className="flex gap-1.5">
                      {teammates.map(tm => {
                        const isFriend = friends?.some(f => f.primary_id === tm.primary_id);
                        return (
                          <span 
                            key={tm.primary_id} 
                            className={`text-[10px] font-medium ${isFriend ? "text-accent-primary" : "text-text-secondary"}`}
                          >
                            {tm.name}{isFriend ? " (Amigo)" : ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
                {m.is_overtime && (
                  <span className="rounded bg-accent-warning/20 px-1.5 py-0.5 text-accent-warning">
                    {t("analytics:matchDetail.overtime")}
                  </span>
                )}
                <span>{Math.round(m.duration_seconds / 60)}m</span>
              </div>
            </div>
            {myPlayer && (
              <div className="mt-2 flex gap-3 text-[10px] text-text-tertiary">
                <span>
                  <span className="text-text-secondary">{myPlayer.score}</span> {t("analytics:matchDetail.points")}
                </span>
                <span>
                  <span className="text-text-secondary">{myPlayer.goals}</span> {t("analytics:matchDetail.goals")}
                </span>
                <span>
                  <span className="text-text-secondary">{myPlayer.assists}</span> {t("analytics:matchDetail.assists")}
                </span>
                <span>
                  <span className="text-text-secondary">{myPlayer.saves}</span> {t("analytics:matchDetail.saves")}
                </span>
                <span>
                  <span className="text-text-secondary">{myPlayer.shots}</span> {t("analytics:matchDetail.shots")}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InsightsPanel({
  insights,
  isLoading,
  summary,
}: {
  insights?: InsightsData;
  isLoading: boolean;
  summary?: AnalyticsData;
}) {
  const { t } = useTranslation(["analytics", "common"]);

  const maxHourPlayed = useMemo(
    () => (insights?.byHour?.length ? Math.max(...insights.byHour.map((hour) => hour.played)) : 0),
    [insights?.byHour]
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <Sparkles size={18} className="text-accent-primary" />
          {t("analytics:insights.title")}
        </h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
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
            <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
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
          <Card className="p-4">
            <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              <Clock size={14} /> {t("analytics:insights.bestHour")}
            </h4>
            <p className="mb-2 text-sm text-text-primary">
              {t("analytics:insights.bestHourDetail", { hour: insights.bestHour })}
              <span className="font-bold text-accent-success">{insights.bestHourWR}%</span>
            </p>
            <div className="flex h-28 items-end gap-1">
              {insights.byHour.map((h) => {
                const height = maxHourPlayed > 0 ? (h.played / maxHourPlayed) * 100 : 0;
                return (
                  <div key={h.hour} className="group relative flex-1" title={t("analytics:insights.hourTooltip", { hour: h.hour, played: h.played, winRate: h.winRate })}>
                    <div
                      className={`w-full rounded-t transition-colors ${
                        h.winRate >= 50
                          ? "bg-accent-success/80 group-hover:bg-accent-success"
                          : "bg-accent-danger/60 group-hover:bg-accent-danger"
                      }`}
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-text-tertiary">
                      {h.hour}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Card className="p-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            <Gauge size={14} /> {t("analytics:insights.situational")}
          </h4>
          <div className="space-y-3 text-xs">
            {insights.otGames && insights.otGames > 0 ? (
              <div className="flex justify-between">
                <span className="text-text-secondary">{t("analytics:insights.overtime", { count: insights.otGames })}</span>
                <span className={(insights.otWinRate ?? 0) >= 50 ? "text-accent-success" : "text-accent-danger"}>
                  {insights.otWinRate ?? 0}%
                </span>
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
              <div className="flex justify-between">
                <span className="text-text-secondary">{t("analytics:insights.blowouts", { count: insights.blowoutGames })}</span>
                <span className={(insights.blowoutWinRate ?? 0) >= 50 ? "text-accent-success" : "text-accent-danger"}>
                  {insights.blowoutWinRate ?? 0}%
                </span>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {insights.contrib && (
        <Card className="p-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
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
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
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

export function AnalyticsPage() {
  const { t, i18n } = useTranslation(["analytics", "common"]);
  const [period, setPeriod] = useState<AnalyticsPeriod>("week");
  const [playlist, setPlaylist] = useState<PlaylistFilter>("all");
  const [matchType, setMatchType] = useState<MatchTypeFilter>("all");
  const [scope, setScope] = useState<DataScope>("me");
  const [selectedSession, setSelectedSession] = useState<MatchSession | null>(null);
  const [sessionShareOpen, setSessionShareOpen] = useState(false);
  const [sessionShareContext, setSessionShareContext] = useState<ShareContext | null>(null);

  const filters = useMemo(
    () => ({ playlist, matchType, scope }),
    [playlist, matchType, scope]
  );

  const hasActiveFilters = playlist !== "all" || matchType !== "all" || scope !== "me";

  const { data: result, isLoading, isError } = useAnalytics(period, filters);
  const { data: insights, isLoading: insightsLoading } = useInsights(period, filters);

  const { data: sessionMatches, isLoading: matchesLoading } = useSessionMatches(
    selectedSession?.start_time,
    selectedSession?.end_time
  );

  const sessions = useMemo(() => result?.sessions ?? [], [result]);

  const { data: friends, isLoading: friendsLoading } = useFriends();
  const { data: settings } = useSettings();
  const username = settings?.playerName ?? "Yo";

  const friendsPresent = useMemo(() => friends?.map((f) => f.name) ?? [], [friends]);

  const handleShareSession = useCallback(() => {
    if (!selectedSession) return;
    const ctx = buildSessionShareContext(selectedSession, [], username, i18n.language);
    setSessionShareContext(ctx);
    setSessionShareOpen(true);
  }, [selectedSession, username, i18n.language]);

  const clearFilters = useCallback(() => {
    setPlaylist("all");
    setMatchType("all");
    setScope("me");
  }, []);

  const [shareOpen, setShareOpen] = useState(false);

  const shareContext = useMemo(() => {
    if (!result?.data) return null;

    if (period === "day") {
      const rollup = result.rollups?.[0];
      if (rollup) return buildDayShareContext(rollup, friendsPresent, username, i18n.language);
    }

    if (period === "session") {
      return buildSummaryShareContext(
        result.data,
        friendsPresent,
        username,
        t("analytics:sessions.title"),
        t("analytics:sessions.periodLabel", { defaultValue: "Resumen de Sesiones" })
      );
    }

    if (result.rollups && result.rollups.length > 0) {
      return buildWeekShareContext(result.rollups, result.data, friendsPresent, username, i18n.language);
    }

    // Fallback to summary context if no rollups available
    return buildSummaryShareContext(
      result.data,
      friendsPresent,
      username,
      t(`analytics:periods.${period}`, { defaultValue: period.toUpperCase() }),
      ""
    );
  }, [result, period, friendsPresent, username, i18n.language, t]);

  return (
    <PageContainer>
      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-text-primary">{t("analytics:title")}</h2>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={Share2}
              onClick={() => setShareOpen(true)}
              disabled={!shareContext || friendsLoading}
            >
              {t("common:buttons.share", { defaultValue: "Compartir" })}
            </Button>
          </div>
          {result?.data && (
            <p className="mt-1 text-sm text-text-secondary">
              {scope === "team"
                ? `Estadísticas del equipo · ${t("analytics:matchCount", { count: result.data.totalMatches })}`
                : t("analytics:matchCount", { count: result.data.totalMatches })}
              {hasActiveFilters && t("analytics:activeFilters")}
            </p>
          )}
          </div>
        </div>
        <div className="rounded-xl border border-border-subtle bg-bg-surface/70 p-3 shadow-[var(--shadow-card-inner)]">
          <AnalyticsFilters
            period={period}
            onPeriodChange={setPeriod}
            playlist={playlist}
            onPlaylistChange={setPlaylist}
            matchType={matchType}
            onMatchTypeChange={setMatchType}
            scope={scope}
            onScopeChange={setScope}
            isLoading={isLoading}
          />
        </div>
      </div>

      {isLoading && (
        <div className="space-y-8">
          <Skeleton className="h-12 w-full rounded-xl" />
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 w-full rounded-xl" />
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {isError && (
        <EmptyState
          icon={BarChart3}
          title={t("analytics:empty.error.title")}
          description={t("analytics:empty.error.description")}
        />
      )}

      {!isLoading && !isError && result && (
        <div className="space-y-8">
          {result.data.totalMatches === 0 ? (
            <EmptyState
              icon={BarChart3}
              title={t("analytics:empty.noData.title")}
              description={
                hasActiveFilters
                  ? t("analytics:empty.noData.filteredDescription")
                  : t("analytics:empty.noData.description")
              }
              actionLabel={hasActiveFilters ? t("analytics:empty.noData.clearFilters") : undefined}
              onAction={hasActiveFilters ? clearFilters : undefined}
            />
          ) : (
            <>
              <PrimaryStatsRow data={result.data} scope={scope} />

              {result.rollups.length > 0 && (
                <PerformanceChart data={result.rollups} scope={scope} />
              )}

              <SecondaryStatsRow
                data={result.data}
                scope={scope}
                streak={{ best: result.data.bestStreak, current: result.data.currentStreak }}
              />

              <InsightsPanel
                insights={insights}
                isLoading={insightsLoading}
                summary={result.data}
              />
            </>
          )}

          {period === "session" && sessions.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-text-primary">
                {t("analytics:sessions.title")}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sessions.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    onClick={() => setSelectedSession(s)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={!!selectedSession} onClose={() => setSelectedSession(null)} size="lg">
        {selectedSession && (
          <div className="max-h-[80vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-primary">{t("analytics:sessions.detail")}</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={Share2}
                  onClick={handleShareSession}
                >
                  {t("common:buttons.share", { defaultValue: "Compartir" })}
                </Button>
                <button
                  onClick={() => setSelectedSession(null)}
                  className="rounded-lg p-1.5 text-text-tertiary hover:bg-bg-panel hover:text-text-primary"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="mb-4 flex gap-4 text-sm">
              <span className="text-text-secondary">{t("analytics:sessions.matchesCount", { count: selectedSession.match_count })}</span>
              <span className="text-accent-success">{selectedSession.wins}{t("analytics:sessions.winsLabel")}</span>
              <span className="text-accent-danger">{selectedSession.losses}{t("analytics:sessions.lossesLabel")}</span>
              <span className="text-text-tertiary">{Math.round(selectedSession.duration_seconds / 60)}m</span>
            </div>
            <SessionMatchDetail
              matches={matchesLoading ? [] : (sessionMatches ?? [])}
            />
          </div>
        )}
      </Modal>

      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        context={shareContext}
      />

      <ShareModal
        isOpen={sessionShareOpen}
        onClose={() => setSessionShareOpen(false)}
        context={sessionShareContext}
      />
    </PageContainer>
  );
}
