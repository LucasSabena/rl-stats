import { useEffect, useState, useCallback } from "react";
import { useLiveStore } from "@/stores/liveStore";
import { TeamPanel } from "./TeamPanel";
import { PlayerCard } from "./PlayerCard";
import { EventFeed } from "./EventFeed";
import { ScoreDisplay } from "./ScoreDisplay";
import { ConnectionStatus } from "./ConnectionStatus";
import { EmptyState } from "@/components/ui/EmptyState";
import { RankWidget } from "@/components/tracker/RankWidget";
import { useLiveMmr } from "@/hooks/useLiveMmr";
import { useSettings } from "@/hooks/useSettings";
import { useLiveHeadToHead } from "@/hooks/useLiveHeadToHead";
import { cn } from "@/lib/utils";
import { Gauge, Radio, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";

function getMatchSizeLabel(t: (key: string, options?: Record<string, unknown>) => string, playerCount: number | undefined, blueCount: number, orangeCount: number, isOnline: boolean | undefined): string {
  if (playerCount === 1) return t("live:matchSize.training");

  const maxPerTeam = Math.max(blueCount, orangeCount);

  if (isOnline === false && maxPerTeam <= 1) return t("live:matchSize.1v1");
  if (maxPerTeam <= 1 && blueCount <= 1 && orangeCount <= 1) return t("live:matchSize.1v1");
  if (maxPerTeam <= 2) return t("live:matchSize.2v2");
  if (maxPerTeam <= 3) return t("live:matchSize.3v3");
  if (maxPerTeam <= 4) return t("live:matchSize.4v4");

  const total = playerCount ?? (blueCount + orangeCount);
  return t("live:matchSize.playerCount", { count: total });
}

function MatchEndBanner() {
  const { t } = useTranslation(["live", "common"]);
  const lastMatchSummary = useLiveStore((state) => state.lastMatchSummary);
  const summaryTimestamp = useLiveStore((state) => state.matchSummaryTimestamp);
  const clearMatchSummary = useLiveStore((state) => state.clearMatchSummary);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (lastMatchSummary) {
      setVisible(true);
    }
  }, [lastMatchSummary]);

  useEffect(() => {
    if (!visible || !summaryTimestamp) return;
    const elapsed = Date.now() - summaryTimestamp;
    const remaining = Math.max(0, 15000 - elapsed);

    if (remaining === 0) {
      clearMatchSummary();
      setVisible(false);
      return;
    }

    const timer = setTimeout(() => {
      clearMatchSummary();
      setVisible(false);
    }, remaining);

    return () => clearTimeout(timer);
  }, [visible, summaryTimestamp, clearMatchSummary]);

  const handleDismiss = useCallback(() => {
    clearMatchSummary();
    setVisible(false);
  }, [clearMatchSummary]);

  if (!visible || !lastMatchSummary) return null;

  const { score_blue, score_orange, winner, local_team_num, duration_seconds, players } = lastMatchSummary;

  let label = "";
  let bgClass = "";

  if (winner === null) {
    label = t("live:result.draw", { scoreBlue: score_blue, scoreOrange: score_orange });
    bgClass = "border-border-subtle bg-bg-surface";
  } else if (local_team_num !== null && winner === local_team_num) {
    label = t("live:result.win", { scoreBlue: score_blue, scoreOrange: score_orange });
    bgClass = "border-accent-success/30 bg-accent-success-subtle";
  } else if (local_team_num !== null) {
    label = t("live:result.loss", { scoreBlue: score_blue, scoreOrange: score_orange });
    bgClass = "border-accent-danger/30 bg-accent-danger-subtle";
  } else {
    label = t("live:result.final", { scoreBlue: score_blue, scoreOrange: score_orange });
    bgClass = "border-border-subtle bg-bg-surface";
  }

  const mins = Math.floor(duration_seconds / 60);
  const secs = duration_seconds % 60;
  const durationStr = `${mins}:${secs.toString().padStart(2, "0")}`;

  return (
    <div
      className={cn(
        "animate-slide-down relative flex items-center justify-between rounded-md border px-2.5 py-1.5",
        bgClass
      )}
      role="alert"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-text-primary">{label}</span>
        <span className="text-[10px] text-text-tertiary">
          {t("live:matchEnd.summary", { duration: durationStr, count: players.length })}
        </span>
      </div>
      <button
        onClick={handleDismiss}
        className="flex h-5 w-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
        aria-label={t("live:matchEnd.dismiss")}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function LiveDashboard() {
  const { t } = useTranslation(["live", "common"]);
  const currentMatch = useLiveStore((state) => state.currentMatch);
  const connectionStatus = useLiveStore((state) => state.connectionStatus);
  const { data: liveMmr, isFetching: isFetchingMmr, forceRefresh } = useLiveMmr();
  const { data: liveHeadToHead } = useLiveHeadToHead();
  const { data: settings } = useSettings();

  const bluePlayers = currentMatch?.players.filter((player) => player.team === 0) ?? [];
  const orangePlayers = currentMatch?.players.filter((player) => player.team === 1) ?? [];
  const otherPlayers = currentMatch?.players.filter((player) => player.team !== 0 && player.team !== 1) ?? [];
  const mmrByPlayerId = Object.fromEntries(
    (liveMmr?.players ?? []).map((player) => [player.primaryId, player])
  );

  if (!currentMatch) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <ConnectionStatus status={connectionStatus} />
        </div>
        <MatchEndBanner />
        <div className="flex h-full items-center justify-center">
          <EmptyState
            icon={Radio}
            title={t("live:emptyState.title")}
            description={t("live:emptyState.description")}
          />
        </div>
      </div>
    );
  }

  const matchSizeLabel = currentMatch.playerCount !== undefined
    ? getMatchSizeLabel(t, currentMatch.playerCount, bluePlayers.length, orangePlayers.length, currentMatch.matchType === "online" ? true : currentMatch.matchType === "local" ? false : undefined)
    : undefined;

  const matchTypeLabel = currentMatch.matchType === "local" ? t("live:matchType.local") : undefined;

  const showInfoBar = Boolean(liveMmr) || connectionStatus !== "connected";

  return (
    <div className="space-y-2">
      <MatchEndBanner />

      {showInfoBar && (
        <div className="flex items-center justify-between gap-2">
          {connectionStatus !== "connected" ? (
            <ConnectionStatus status={connectionStatus} />
          ) : (
            <span />
          )}
          {liveMmr && (
            <div
              className="flex items-center gap-1.5 text-[10px]"
              aria-live="polite"
              title={t("live:mmr.coverageHint")}
            >
              <Gauge size={11} className="shrink-0 text-accent-primary" />
              <span className="rounded bg-accent-success/10 px-1.5 py-0.5 font-semibold text-accent-success">
                {t("live:mmr.exact", { count: liveMmr.exactCount })}
              </span>
              {liveMmr.historicalCount > 0 && (
                <span className="rounded bg-bg-surface px-1.5 py-0.5 font-semibold text-text-secondary">
                  {t("live:mmr.historical", { count: liveMmr.historicalCount })}
                </span>
              )}
              {liveMmr.estimatedCount > 0 && (
                <span className="rounded bg-accent-info/10 px-1.5 py-0.5 font-semibold text-accent-info">
                  {t("live:mmr.estimated", { count: liveMmr.estimatedCount })}
                </span>
              )}
              {liveMmr.unavailableCount > 0 && (
                <span className="rounded bg-accent-warning/10 px-1.5 py-0.5 font-semibold text-accent-warning">
                  {t("live:mmr.unavailableCount", { count: liveMmr.unavailableCount })}
                </span>
              )}
              <span className="hidden truncate text-text-tertiary md:inline">
                {liveMmr.playlist ?? t("live:playlist.unresolved")}
              </span>
              {currentMatch?.matchType === "online" && (
                <button
                  onClick={forceRefresh}
                  disabled={isFetchingMmr}
                  className="inline-flex items-center rounded border border-border-subtle px-1.5 py-0.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
                  aria-label={t("live:playlist.refreshAriaLabel")}
                  type="button"
                >
                  <RefreshCw size={10} className={cn(isFetchingMmr && "animate-spin")} />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <ScoreDisplay
        blueScore={currentMatch.teamBlueScore}
        orangeScore={currentMatch.teamOrangeScore}
        arena={currentMatch.gameState.arena ?? undefined}
        timeRemaining={currentMatch.gameState.timeRemaining}
        isOvertime={currentMatch.gameState.isOvertime}
        matchTypeLabel={matchTypeLabel}
        matchSizeLabel={matchSizeLabel}
      />

      <RankWidget />

      <div className="grid gap-3 lg:grid-cols-2">
        <TeamPanel
          team="blue"
          players={bluePlayers}
          mmrByPlayerId={mmrByPlayerId}
          headToHeadByPlayerId={liveHeadToHead}
          localPrimaryId={settings?.localPrimaryId ?? null}
          mmrLoading={isFetchingMmr}
          isLocalMatch={currentMatch.matchType === "local"}
          playlist={liveMmr?.playlist ?? null}
        />
        <TeamPanel
          team="orange"
          players={orangePlayers}
          mmrByPlayerId={mmrByPlayerId}
          headToHeadByPlayerId={liveHeadToHead}
          localPrimaryId={settings?.localPrimaryId ?? null}
          mmrLoading={isFetchingMmr}
          isLocalMatch={currentMatch.matchType === "local"}
          playlist={liveMmr?.playlist ?? null}
        />
      </div>

      {otherPlayers.length > 0 && (
        <div className="rounded-lg border border-border-subtle bg-bg-surface/60 p-2">
          <div className="mb-1 flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-text-muted" />
            <h3 className="font-display text-[10px] font-bold tracking-wide text-text-secondary">
              {t("live:players.other")}
            </h3>
          </div>
          <div className="space-y-1">
            {otherPlayers.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                isCurrentUser={player.id === (settings?.localPrimaryId ?? null)}
                mmr={mmrByPlayerId[player.id] ?? null}
                headToHead={liveHeadToHead?.[player.id] ?? null}
                mmrLoading={isFetchingMmr}
              />
            ))}
          </div>
        </div>
      )}

      <EventFeed />
    </div>
  );
}
