import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAnalytics, useSessionMatches, useInsights, usePlayerAnalyticsMatches, usePlayerAnalyticsSummary } from "@/hooks/useAnalytics";
import { useFriends } from "@/hooks/useFriends";
import { useSettings } from "@/hooks/useSettings";
import { PrimaryStatsRow, SecondaryStatsRow } from "@/components/analytics/StatsGrid";
import { PerformanceChart } from "@/components/analytics/PerformanceChart";
import { AnalyticsFilters } from "@/components/analytics/AnalyticsFilters";
import { TrainingTimeCard } from "@/components/analytics/TrainingTimeCard";
import { InsightsPanel } from "@/components/analytics/InsightsPanel";
import { KickoffRecountButton } from "@/components/analytics/KickoffRecountButton";
import { PatternPanels } from "@/components/analytics/PatternPanels";
import { PlayerMatchesPanel } from "@/components/analytics/PlayerMatchesPanel";
import { SessionCard } from "@/components/analytics/SessionCard";
import { SessionMatchDetail } from "@/components/analytics/SessionMatchDetail";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ShareModal } from "@/components/share/ShareModal";
import { buildDayShareContext, buildWeekShareContext, buildSessionShareContext, buildSummaryShareContext } from "@/lib/shareContext";
import type { AnalyticsPeriod, MatchSession, PlaylistFilter, MatchTypeFilter, DataScope, ShareContext } from "@/lib/types";
import { BarChart3, X, Share2 } from "lucide-react";

export function AnalyticsPage() {  const { t, i18n } = useTranslation(["analytics", "common"]);
  const [period, setPeriod] = useState<AnalyticsPeriod>("week");
  const [playlist, setPlaylist] = useState<PlaylistFilter>("all");
  const [matchType, setMatchType] = useState<MatchTypeFilter>("all");
  const [scope, setScope] = useState<DataScope>("me");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<MatchSession | null>(null);
  const [sessionShareOpen, setSessionShareOpen] = useState(false);
  const [sessionShareContext, setSessionShareContext] = useState<ShareContext | null>(null);

  const filters = useMemo(
    () => ({ playlist, matchType, scope, playerId }),
    [playlist, matchType, scope, playerId]
  );

  const hasActiveFilters = playlist !== "all" || matchType !== "all" || scope !== "me" || !!playerId;

  const { data: result, isLoading, isError } = useAnalytics(period, filters);
  const { data: insights, isLoading: insightsLoading } = useInsights(period, filters);

  // Per-profile analytics: when a friend/player profile is selected, show
  // their summary, insights and match history instead of the local data.
  const {
    data: playerSummary,
    isLoading: playerSummaryLoading,
    isError: playerSummaryError,
    refetch: refetchPlayerSummary,
  } = usePlayerAnalyticsSummary(playerId, period, filters);
  const {
    data: playerMatches,
    isLoading: playerMatchesLoading,
    isError: playerMatchesError,
    refetch: refetchPlayerMatches,
  } = usePlayerAnalyticsMatches(playerId, period, filters);

  const {
    data: sessionMatches,
    isLoading: matchesLoading,
    isError: matchesError,
  } = useSessionMatches(
    selectedSession?.start_time,
    selectedSession?.end_time
  );

  const sessions = useMemo(() => result?.sessions ?? [], [result]);

  const { data: friends, isLoading: friendsLoading } = useFriends();
  const { data: settings } = useSettings();
  const username = settings?.playerName ?? t("common:self");

  const friendsPresent = useMemo(() => friends?.map((f) => f.name) ?? [], [friends]);

  const playerOptions = useMemo(
    () =>
      (friends ?? [])
        .filter((f) => f.primary_id)
        .map((f) => ({ primary_id: f.primary_id, name: f.name })),
    [friends],
  );

  const selectedPlayerName = useMemo(
    () =>
      playerOptions.find((p) => p.primary_id === playerId)?.name ??
      username,
    [playerOptions, playerId, username],
  );

  const handleShareSession = useCallback(() => {
    if (!selectedSession) return;
    const ctx = buildSessionShareContext(selectedSession, friendsPresent, username, i18n.language);
    setSessionShareContext(ctx);
    setSessionShareOpen(true);
  }, [selectedSession, friendsPresent, username, i18n.language]);

  const clearFilters = useCallback(() => {
    setPlaylist("all");
    setMatchType("all");
    setScope("me");
    setPlayerId(null);
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
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          {result?.data ? (
            <p className="text-sm text-text-secondary">
              {scope === "team"
                ? `${t("analytics:filters.scope.team")} · ${t("analytics:matchCount", { count: result.data.totalMatches })}`
                : t("analytics:matchCount", { count: result.data.totalMatches })}
              {hasActiveFilters && t("analytics:activeFilters")}
            </p>
          ) : (
            <span />
          )}
          <Button
            variant="secondary"
            size="sm"
            leftIcon={Share2}
            onClick={() => setShareOpen(true)}
            disabled={!shareContext || friendsLoading}
          >
            {t("common:buttons.share")}
          </Button>
        </div>
        <div className="rounded-lg border border-border-subtle bg-bg-surface p-2.5">
          <AnalyticsFilters
            period={period}
            onPeriodChange={setPeriod}
            playlist={playlist}
            onPlaylistChange={setPlaylist}
            matchType={matchType}
            onMatchTypeChange={setMatchType}
            scope={scope}
            onScopeChange={setScope}
            playerId={playerId}
            onPlayerChange={setPlayerId}
            playerOptions={playerOptions}
            isLoading={isLoading}
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-12 w-full rounded-lg" />
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-80 w-full rounded-lg" />
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
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

      {!isLoading && !isError && result && !playerId && (
        <div className="flex flex-col gap-6">
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

              <TrainingTimeCard period={period} />

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

              <PatternPanels
                period={period}
                playlist={playlist}
                matchType={matchType}
                scope={scope}
                playerId={null}
                username={username}
                friendsPresent={friendsPresent}
                dateLabel={t('analytics:periods.' + period, { defaultValue: period.toUpperCase() })}
              />

              <KickoffRecountButton />
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

      {playerId && (
        <div className="flex flex-col gap-6">
          {playerSummaryLoading ? (
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          ) : playerSummaryError ? (
            <EmptyState
              icon={BarChart3}
              title={t("analytics:empty.error.title")}
              description={t("analytics:empty.error.description")}
              actionLabel={t("analytics:panelError.retry")}
              onAction={() => void refetchPlayerSummary()}
            />
          ) : playerSummary && playerSummary.totalMatches > 0 ? (
            <>
              <PrimaryStatsRow data={playerSummary} scope="me" />
              <SecondaryStatsRow
                data={playerSummary}
                scope="me"
                streak={{ best: playerSummary.bestStreak, current: playerSummary.currentStreak }}
              />
              <InsightsPanel
                insights={insights}
                isLoading={insightsLoading}
                summary={playerSummary}
              />

              <PatternPanels
                period={period}
                playlist={playlist}
                matchType={matchType}
                scope={scope}
                playerId={playerId}
                username={selectedPlayerName}
                friendsPresent={friendsPresent}
                dateLabel={t('analytics:periods.' + period, { defaultValue: period.toUpperCase() })}
              />
            </>
          ) : (
            <EmptyState
              icon={BarChart3}
              title={t("analytics:player.noMatches.title", { defaultValue: "Sin partidas" })}
              description={t("analytics:player.noMatches.description", {
                defaultValue: "Este jugador no tiene partidas registradas en el período seleccionado.",
              })}
            />
          )}

          <PlayerMatchesPanel
            matches={playerMatches ?? []}
            isLoading={playerMatchesLoading}
            isError={playerMatchesError}
            onRetry={() => void refetchPlayerMatches()}
            playerName={selectedPlayerName}
          />
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
                  {t("common:buttons.share")}
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
              matches={sessionMatches ?? []}
              isLoading={matchesLoading}
              isError={matchesError}
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
