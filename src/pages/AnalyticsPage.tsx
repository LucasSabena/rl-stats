import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { useAnalytics, useSessionMatches, useInsights, usePlayerAnalyticsMatches, usePlayerAnalyticsSummary } from "@/hooks/useAnalytics";
import { useFriends } from "@/hooks/useFriends";
import { useSettings } from "@/hooks/useSettings";
import { PrimaryStatsRow, SecondaryStatsRow } from "@/components/analytics/StatsGrid";
import { PerformanceChart } from "@/components/analytics/PerformanceChart";
import { AnalyticsFilters } from "@/components/analytics/AnalyticsFilters";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";
import { HoursWheel } from "@/components/analytics/HoursWheel";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ShareModal } from "@/components/share/ShareModal";
import { buildDayShareContext, buildWeekShareContext, buildSessionShareContext, buildSummaryShareContext } from "@/lib/shareContext";
import type { AnalyticsPeriod, MatchSession, SessionMatch, PlaylistFilter, MatchTypeFilter, DataScope, AnalyticsData, InsightsData, ShareContext, PlayerAnalyticsMatch } from "@/lib/types";
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
  TrendingUp,
  TrendingDown,
  UserRound,
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


function SessionMatchDetail({
  matches,
  isLoading,
  isError,
}: {
  matches: SessionMatch[];
  isLoading: boolean;
  isError: boolean;
}) {
  const { t } = useTranslation(["analytics", "common", "players"]);
  const { data: friends } = useFriends();

  // These three states were collapsed into one: an empty result rendered the
  // loading message, so a session with no rows — or a failed query — looked
  // like it was loading forever.
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-accent-danger">
          {t("analytics:matchDetail.error", {
            defaultValue: "No se pudieron cargar las partidas de esta sesión.",
          })}
        </p>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-text-secondary">
          {t("analytics:matchDetail.empty", {
            defaultValue: "No hay partidas en esta sesión.",
          })}
        </p>
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

function PlayerMatchesPanel({
  matches,
  isLoading,
  playerName,
}: {
  matches: PlayerAnalyticsMatch[];
  isLoading: boolean;
  playerName: string;
}) {
  const { t } = useTranslation(["analytics", "common"]);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <UserRound size={15} className="text-accent-primary" />
        {t("analytics:player.matchesTitle", { name: playerName })}
      </h3>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <p className="rounded-lg border border-border-subtle bg-bg-surface/60 px-4 py-3 text-xs text-text-muted">
          {t("analytics:player.noMatches.description", {
            defaultValue: "Este jugador no tiene partidas registradas en el período seleccionado.",
          })}
        </p>
      ) : (
        <div className="space-y-2">
          {matches.map((m) => {
            const startDate = new Date(m.start_time);
            const timeStr = startDate.toLocaleDateString(i18n.language, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <div
                key={m.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                  m.is_win
                    ? "border-accent-success/20 bg-accent-success/5"
                    : "border-accent-danger/20 bg-accent-danger/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${
                      m.is_win
                        ? "bg-accent-success/20 text-accent-success"
                        : "bg-accent-danger/20 text-accent-danger"
                    }`}
                  >
                    {m.is_win
                      ? t("analytics:matchDetail.win")
                      : t("analytics:matchDetail.loss")}
                  </span>
                  <span className="text-sm font-mono font-semibold text-text-primary">
                    {m.score_blue} - {m.score_orange}
                  </span>
                  <span className="text-[10px] text-text-tertiary">{timeStr}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
                  {m.is_overtime && (
                    <span className="rounded bg-accent-warning/20 px-1.5 py-0.5 font-semibold text-accent-warning">
                      {t("analytics:matchDetail.overtime")}
                    </span>
                  )}
                  {m.was_comeback && (
                    <span className="flex items-center gap-0.5 rounded bg-accent-success/15 px-1.5 py-0.5 font-semibold text-accent-success">
                      <TrendingUp size={10} />
                      {t("analytics:player.comebackTag")}
                    </span>
                  )}
                  {m.was_collapse && (
                    <span className="flex items-center gap-0.5 rounded bg-accent-danger/15 px-1.5 py-0.5 font-semibold text-accent-danger">
                      <TrendingDown size={10} />
                      {t("analytics:player.collapseTag")}
                    </span>
                  )}
                  <span>
                    {m.goals} {t("analytics:matchDetail.goals")} · {m.assists}{" "}
                    {t("analytics:matchDetail.assists")} · {m.saves}{" "}
                    {t("analytics:matchDetail.saves")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
            <HoursWheel data={insights.byHour} />
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

export function AnalyticsPage() {
  const { t, i18n } = useTranslation(["analytics", "common"]);
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
  } = usePlayerAnalyticsSummary(playerId, period, filters);
  const {
    data: playerMatches,
    isLoading: playerMatchesLoading,
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
  const username = settings?.playerName ?? "Yo";

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
    const ctx = buildSessionShareContext(selectedSession, [], username, i18n.language);
    setSessionShareContext(ctx);
    setSessionShareOpen(true);
  }, [selectedSession, username, i18n.language]);

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
            {t("common:buttons.share", { defaultValue: "Compartir" })}
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

      {playerId && (
        <div className="flex flex-col gap-6">
          {playerSummaryLoading ? (
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
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
