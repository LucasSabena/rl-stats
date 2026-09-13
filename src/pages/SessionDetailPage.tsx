import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { ShareModal } from "@/components/share/ShareModal";
import { SessionMatchDetail } from "@/components/analytics/SessionMatchDetail";
import { useSessionList, useSessionMatches } from "@/hooks/useAnalytics";
import { useFriends } from "@/hooks/useFriends";
import { useSettings } from "@/hooks/useSettings";
import { buildSessionShareContext } from "@/lib/shareContext";
import { cn, formatDuration } from "@/lib/utils";
import { ArrowLeft, Share2, Trophy, Swords, Target, Clock } from "lucide-react";
import type { ShareContext } from "@/lib/types";

export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { t, i18n } = useTranslation(["sessions", "common"]);
  const navigate = useNavigate();

  const { data: sessions, isLoading } = useSessionList({});
  const session = useMemo(
    () => (sessions ?? []).find((entry) => String(entry.id) === sessionId) ?? null,
    [sessions, sessionId]
  );

  const {
    data: matches,
    isLoading: matchesLoading,
    isError: matchesError,
    refetch: refetchMatches,
  } = useSessionMatches(session?.start_time, session?.end_time);

  const { data: friends } = useFriends();
  const { data: settings } = useSettings();
  const [shareContext, setShareContext] = useState<ShareContext | null>(null);

  const username = settings?.playerName ?? t("common:self");

  const handleShare = useCallback(() => {
    if (!session) return;
    setShareContext(
      buildSessionShareContext(
        session,
        (friends ?? []).map((friend) => friend.name),
        username,
        i18n.language
      )
    );
  }, [friends, i18n.language, session, username]);

  if (isLoading) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </PageContainer>
    );
  }

  if (!session) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={ArrowLeft}
            onClick={() => navigate("/sessions")}
          >
            {t("sessions:detail.back")}
          </Button>
          <EmptyState icon={Clock} title={t("sessions:detail.empty")} />
        </div>
      </PageContainer>
    );
  }

  const winRate =
    session.match_count > 0
      ? Math.round((session.wins / session.match_count) * 100)
      : 0;
  const goalDiff = session.goals_scored - session.goals_conceded;
  const dateLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(session.start_time));

  return (
    <PageContainer>
      <div className="space-y-5 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/sessions"
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              aria-label={t("sessions:detail.back")}
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-display text-xl font-bold text-text-primary">
                {t("sessions:detail.title", {
                  date: dateLabel,
                })}
              </h1>
              <p className="text-xs text-text-tertiary">
                {formatDuration(session.duration_seconds)}
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" leftIcon={Share2} onClick={handleShare}>
            {t("common:buttons.share", { defaultValue: "Compartir" })}
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <Trophy size={12} /> {t("sessions:summary.wins", { defaultValue: "Victorias" })}
            </p>
            <p className="numeral mt-1 text-2xl font-bold text-accent-success">
              {session.wins}
            </p>
          </Card>
          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <Swords size={12} /> {t("sessions:summary.losses", { defaultValue: "Derrotas" })}
            </p>
            <p className="numeral mt-1 text-2xl font-bold text-accent-danger">
              {session.losses}
            </p>
          </Card>
          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <Target size={12} /> {t("sessions:list.winRate")}
            </p>
            <p
              className={cn(
                "numeral mt-1 text-2xl font-bold",
                winRate >= 50 ? "text-accent-success" : "text-text-primary"
              )}
            >
              {winRate}%
            </p>
          </Card>
          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <Clock size={12} /> {t("sessions:list.goals")}
            </p>
            <p className="numeral mt-1 text-2xl font-bold text-text-primary">
              {goalDiff > 0 ? `+${goalDiff}` : goalDiff}
            </p>
          </Card>
        </div>

        {/* Matches */}
        <Card className="p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            {t("sessions:detail.matches")}
          </h2>
          <SessionMatchDetail
            matches={matches ?? []}
            isLoading={matchesLoading}
            isError={matchesError}
            onRetry={() => void refetchMatches()}
          />
        </Card>
      </div>

      <ShareModal
        isOpen={shareContext !== null}
        onClose={() => setShareContext(null)}
        context={shareContext}
      />
    </PageContainer>
  );
}
