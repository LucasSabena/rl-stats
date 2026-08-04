import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMatchDetail } from "@/hooks/useMatchDetail";
import { useFriends } from "@/hooks/useFriends";
import { useSettings } from "@/hooks/useSettings";
import { MatchHeader } from "@/components/match-detail/MatchHeader";
import { MatchInfoPanel } from "@/components/match-detail/MatchInfoPanel";
import { TeamRoster } from "@/components/match-detail/TeamRoster";
import { ScoreTimeline } from "@/components/match-detail/ScoreTimeline";
import { PlayerStatsTable } from "@/components/match-detail/PlayerStatsTable";
import { GoalDetail } from "@/components/match-detail/GoalDetail";
import { ShareModal } from "@/components/share/ShareModal";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { buildMatchShareContext } from "@/lib/shareContext";
import { Gamepad2, ArrowLeft, Share2 } from "lucide-react";

export function MatchDetailPage() {
  const { t, i18n } = useTranslation(["matchDetail", "common"]);
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const id = Number(matchId);
  const { data, isLoading, isError, error, refetch } = useMatchDetail(id);
  const { data: friends } = useFriends();
  const { data: settings } = useSettings();
  const [shareOpen, setShareOpen] = useState(false);

  if (isLoading) {
    return (
      <PageContainer>
        <div className="mb-4">
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="mb-6 h-48 w-full" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="mt-6">
          <Skeleton className="h-80 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (isError || !data) {
    // Show what actually failed rather than a blanket "not found" — a command
    // error and a genuinely missing match need different fixes.
    const reason = isError && error instanceof Error ? error.message : null;

    return (
      <PageContainer>
        <EmptyState
          icon={Gamepad2}
          title={t("matchDetail:page.notFoundTitle")}
          description={reason ?? t("matchDetail:page.notFoundDescription")}
          actionLabel={t("matchDetail:page.backToHistory")}
          onAction={() => navigate("/history")}
        />
        {isError && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => void refetch()}>
              {t("common:buttons.retry")}
            </Button>
          </div>
        )}
      </PageContainer>
    );
  }

  if (data.players.length === 0 && data.events.length === 0) {
    return (
      <PageContainer>
        <Button
          variant="ghost"
          leftIcon={ArrowLeft}
          onClick={() => navigate("/history")}
          className="mb-4"
        >
          {t("matchDetail:page.backToHistory")}
        </Button>
        <EmptyState
          icon={Gamepad2}
          title={t("matchDetail:page.noDataTitle")}
          description={t("matchDetail:page.noDataDescription")}
        />
      </PageContainer>
    );
  }

  const hasGoals = data.goals.length > 0;
  const goalsExist = data.events.some((e) => e.type === "GoalScored");

  const friendPrimaryIds = new Set(friends?.map((f) => f.primary_id) ?? []);
  const friendsInMatch = data.players
    .filter((p) => friendPrimaryIds.has(p.id))
    .map((p) => p.name);

  const shareContext = buildMatchShareContext(
    data,
    friendsInMatch,
    settings?.playerName ?? "Yo",
    settings?.localPrimaryId,
    i18n.language
  );

  return (
    <PageContainer>
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          leftIcon={ArrowLeft}
          onClick={() => navigate("/history")}
        >
          {t("matchDetail:page.backToHistory")}
        </Button>
        <Button
          variant="secondary"
          leftIcon={Share2}
          onClick={() => setShareOpen(true)}
          size="sm"
        >
          {t("common:share.button", { defaultValue: "Compartir" })}
        </Button>
      </div>

      {/* Share modal */}
      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        context={shareContext}
      />

      {/* Scoreboard first — it is what the page is about. */}
      <div className="mt-4">
        <MatchHeader match={data} />
      </div>

      {/* Then the two rosters side by side, with per-player MMR and rank.
          The full stats table used to sit at the very bottom of the page,
          below the timeline, which buried the numbers people come here for. */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <TeamRoster
          players={data.players}
          teamNum={0}
          teamName={t("matchDetail:teams.blueTeam")}
          teamColorClass="blue"
          playlist={data.playlist}
        />
        <TeamRoster
          players={data.players}
          teamNum={1}
          teamName={t("matchDetail:teams.orangeTeam")}
          teamColorClass="orange"
          playlist={data.playlist}
        />
      </div>

      {/* Full comparison table, promoted above the narrative sections. */}
      <div className="mt-6">
        <PlayerStatsTable players={data.players} />
      </div>

      {/* Then the story of the match: goals, then the timeline. */}
      {hasGoals && (
        <div className="mt-6">
          <GoalDetail goals={data.goals} />
        </div>
      )}

      {goalsExist && (
        <div className="mt-6">
          <ScoreTimeline
            events={data.events}
            team0Name={t("matchDetail:teams.blue")}
            team1Name={t("matchDetail:teams.orange")}
          />
        </div>
      )}

      {/* Match metadata last — reference detail, not headline. */}
      <div className="mt-6">
        <MatchInfoPanel match={data} />
      </div>

    </PageContainer>
  );
}
