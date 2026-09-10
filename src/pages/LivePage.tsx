import { useState, useMemo } from "react";
import { useLiveMatch } from "@/hooks/useLiveMatch";
import { LiveDashboard } from "@/components/live/LiveDashboard";
import { PageContainer } from "@/components/layout/PageContainer";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Button } from "@/components/ui/Button";
import { ShareModal } from "@/components/share/ShareModal";
import { useFriends } from "@/hooks/useFriends";
import { useLiveStore } from "@/stores/liveStore";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Share2 } from "lucide-react";
import type { ShareContext } from "@/lib/types";

function buildPlaceholderMatchContext(lastMatch: {
  match_guid: string;
  score_blue: number;
  score_orange: number;
  winner: number | null;
  local_primary_id: string | null;
  local_team_num: number | null;
  players: { primary_id: string; name: string; team_num: number; stats: Record<string, unknown> }[];
}, friends: string[], t: TFunction, locale: string): ShareContext | null {
  if (!lastMatch) return null;
  const localTeam = lastMatch.local_team_num;
  const isWin = localTeam !== null && lastMatch.winner === localTeam;
  const title = lastMatch.winner === null
    ? t("live:share.draw")
    : localTeam === null
      ? t("live:share.finished")
      : isWin ? t("live:share.win") : t("live:share.loss");
  const myPlayer = lastMatch.players.find((p) => p.primary_id === lastMatch.local_primary_id)
    ?? lastMatch.players.find((p) => p.team_num === localTeam)
    ?? lastMatch.players[0];
  const goals = (myPlayer?.stats?.goals as number) ?? 0;
  const assists = (myPlayer?.stats?.assists as number) ?? 0;
  const saves = (myPlayer?.stats?.saves as number) ?? 0;
  const shots = (myPlayer?.stats?.shots as number) ?? 0;
  const score = (myPlayer?.stats?.score as number) ?? 0;
  const demos = (myPlayer?.stats?.demos as number) ?? 0;

  return {
    type: "match",
    title,
    stats: [
      { label: t("live:share.goals"), value: String(goals), highlight: true },
      { label: t("live:share.assists"), value: String(assists) },
      { label: t("live:share.saves"), value: String(saves) },
      { label: t("live:share.shots"), value: String(shots) },
      { label: t("live:share.score"), value: String(score), highlight: true },
      { label: t("live:share.demos"), value: String(demos) },
    ],
    friendsPresent: friends,
    username: myPlayer?.name,
    teamScore: localTeam === 1 ? lastMatch.score_orange : lastMatch.score_blue,
    opponentScore: localTeam === 1 ? lastMatch.score_blue : lastMatch.score_orange,
    win: localTeam === null || lastMatch.winner === null ? undefined : isWin,
    dateLabel: new Date().toLocaleDateString(locale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    matchPlayers: [...lastMatch.players]
      .sort((a, b) => Number(b.stats.score ?? 0) - Number(a.stats.score ?? 0))
      .map((player) => ({
        name: player.name,
        score: Number(player.stats.score ?? 0),
        goals: Number(player.stats.goals ?? 0),
        assists: Number(player.stats.assists ?? 0),
        saves: Number(player.stats.saves ?? 0),
        isLocal: player.primary_id === lastMatch.local_primary_id,
      })),
  };
}

export function LivePage() {
  useLiveMatch();
  const { t, i18n } = useTranslation(["live", "common"]);

  const [shareOpen, setShareOpen] = useState(false);
  const { data: friends, isLoading: friendsLoading } = useFriends();
  const lastMatchSummary = useLiveStore((s) => s.lastMatchSummary);

  const friendsPresent = useMemo(() => {
    if (!lastMatchSummary || !friends) return [];
    const playerIds = new Set(lastMatchSummary.players.map((player) => player.primary_id));
    return friends.filter((friend) => playerIds.has(friend.primary_id)).map((friend) => friend.name);
  }, [friends, lastMatchSummary]);

  const shareContext = useMemo(() => {
    if (!lastMatchSummary) return null;
    return buildPlaceholderMatchContext(lastMatchSummary, friendsPresent, t, i18n.language);
  }, [lastMatchSummary, friendsPresent, t, i18n.language]);

  return (
    <PageContainer>
      {lastMatchSummary && (
        <div className="-mt-2 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={Share2}
            onClick={() => setShareOpen(true)}
            disabled={friendsLoading}
          >
            {t("common:buttons.share")}
          </Button>
        </div>
      )}
      <ErrorBoundary>
        <LiveDashboard />
      </ErrorBoundary>

      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        context={shareContext}
      />
    </PageContainer>
  );
}
