import { useEffect, useState, useCallback } from "react";
import { useLiveStore } from "@/stores/liveStore";
import { TeamPanel } from "./TeamPanel";
import { PlayerCard } from "./PlayerCard";
import { EventFeed } from "./EventFeed";
import { MatchTimer } from "./MatchTimer";
import { ScoreDisplay } from "./ScoreDisplay";
import { ConnectionStatus } from "./ConnectionStatus";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RankWidget } from "@/components/tracker/RankWidget";
import { useLiveMmr } from "@/hooks/useLiveMmr";
import { useSettings } from "@/hooks/useSettings";
import { useLiveHeadToHead } from "@/hooks/useLiveHeadToHead";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Gauge, Radio, X, RefreshCw } from "lucide-react";
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
        "relative flex items-center justify-between rounded-lg border px-3 py-2 animate-slide-down",
        bgClass
      )}
      role="alert"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-text-primary">{label}</span>
        <span className="text-[10px] text-text-tertiary">
          {t("live:matchEnd.summary", { duration: durationStr, count: players.length })}
        </span>
      </div>
      <button
        onClick={handleDismiss}
        className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
        aria-label={t("live:matchEnd.dismiss")}
      >
        <X size={14} />
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
      <div className="space-y-4">
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

  return (
    <div className="space-y-3">
      <MatchEndBanner />

      <div className="flex items-center justify-between">
        <ConnectionStatus status={connectionStatus} />
        <div className="flex items-center gap-2">
          {currentMatch.matchType && (
            <Badge
              variant={currentMatch.matchType === "online" ? "info" : "default"}
            >
              {currentMatch.matchType === "online" ? t("live:matchType.online") : t("live:matchType.local")}
            </Badge>
          )}
          {currentMatch.playerCount !== undefined && (
            <Badge variant="accent">
              {getMatchSizeLabel(t, currentMatch.playerCount, bluePlayers.length, orangePlayers.length, currentMatch.matchType === "online" ? true : currentMatch.matchType === "local" ? false : undefined)}
            </Badge>
          )}
          <MatchTimer
            timeRemaining={currentMatch.gameState.timeRemaining}
            isOvertime={currentMatch.gameState.isOvertime}
          />
        </div>
      </div>

      <ScoreDisplay
        blueScore={currentMatch.teamBlueScore}
        orangeScore={currentMatch.teamOrangeScore}
        arena={currentMatch.gameState.arena ?? undefined}
      />

      <RankWidget />

      {liveMmr && (
        <div className="rounded-xl border border-border-subtle bg-bg-elevated/70 px-3 py-2.5 shadow-[var(--shadow-card-inner)]" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-text-primary">
              <Gauge size={14} className="text-accent-primary" />
              {t("live:mmr.coverage")}
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-success/10 px-2 py-1 text-[10px] font-semibold text-accent-success">
              <CheckCircle2 size={11} /> {t("live:mmr.exact", { count: liveMmr.exactCount })}
            </span>
            {liveMmr.historicalCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-surface px-2 py-1 text-[10px] font-semibold text-text-secondary">
                <Gauge size={11} /> {t("live:mmr.historical", { count: liveMmr.historicalCount })}
              </span>
            ) : null}
            {liveMmr.estimatedCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-info/10 px-2 py-1 text-[10px] font-semibold text-accent-info">
                <Gauge size={11} /> {t("live:mmr.estimated", { count: liveMmr.estimatedCount })}
              </span>
            ) : null}
            {liveMmr.unavailableCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-warning/10 px-2 py-1 text-[10px] font-semibold text-accent-warning">
                <AlertTriangle size={11} /> {t("live:mmr.unavailableCount", { count: liveMmr.unavailableCount })}
              </span>
            ) : null}
            <span className="text-[10px] text-text-tertiary">
              {t("live:playlist.label")} {liveMmr.playlistConfidence === "high" ? t("live:playlist.detected") : liveMmr.playlistConfidence === "low" ? t("live:playlist.estimated") : t("live:playlist.unknown")}:
              <span className="ml-1 font-semibold text-text-secondary">{liveMmr.playlist ?? t("live:playlist.unresolved")}</span>
            </span>
            {currentMatch?.matchType === "online" && (
              <button
                onClick={forceRefresh}
                disabled={isFetchingMmr}
                className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-surface px-2.5 py-1 text-[10px] font-semibold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
                aria-label={t("live:playlist.refreshAriaLabel")}
                type="button"
              >
                <RefreshCw size={12} className={cn(isFetchingMmr && "animate-spin")} />
                <span>{isFetchingMmr ? t("live:playlist.refreshing") : t("live:playlist.refresh")}</span>
              </button>
            )}
          </div>
          <p className="mt-2 border-t border-border-subtle pt-2 text-[10px] leading-relaxed text-text-tertiary">
            {liveMmr.historicalCount + liveMmr.estimatedCount + liveMmr.unavailableCount > 0
              ? t("live:mmr.coverageHint")
              : `${t("live:playlist.updated")} ${new Date(liveMmr.fetchedAt).toLocaleTimeString()}`}
          </p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <TeamPanel
          team="blue"
          players={bluePlayers}
          mmrByPlayerId={mmrByPlayerId}
          headToHeadByPlayerId={liveHeadToHead}
          localPrimaryId={settings?.localPrimaryId ?? null}
          mmrLoading={isFetchingMmr}
          isLocalMatch={currentMatch.matchType === "local"}
        />
        <TeamPanel
          team="orange"
          players={orangePlayers}
          mmrByPlayerId={mmrByPlayerId}
          headToHeadByPlayerId={liveHeadToHead}
          localPrimaryId={settings?.localPrimaryId ?? null}
          mmrLoading={isFetchingMmr}
          isLocalMatch={currentMatch.matchType === "local"}
        />
      </div>

      {otherPlayers.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-bg-surface p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-text-muted" />
            <h3 className="font-display text-xs font-bold uppercase tracking-wide text-text-secondary">
              {t("live:players.other")}
            </h3>
          </div>
          <div className="space-y-1.5">
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
