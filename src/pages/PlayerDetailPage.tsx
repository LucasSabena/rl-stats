
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { usePlayerDetail } from "@/hooks/usePlayerDirectory";
import { useFriends } from "@/hooks/useFriends";
import { useAddFriend, useRemoveFriend } from "@/hooks/useFriends";
import { getArenaDisplayName } from "@/lib/arenaMap";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import {
  ArrowLeft,
  Shield,
  Swords,
  Calendar,
  Clock,
  Target,
  Goal,
  HeartHandshake,
  Crosshair,
  Zap,
  UserPlus,
  UserMinus,
} from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(i18n.language, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString(i18n.language, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(a: number, b: number): string {
  if (b === 0) return "0%";
  return Math.round((a / b) * 100) + "%";
}

export function PlayerDetailPage() {
  const { t } = useTranslation(["players", "common"]);
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  // The route accepts either the local row id (from the directory) or a
  // PrimaryId (from a live match or match detail).
  const routeId = playerId ?? "";
  const lookup: number | string = /^\d+$/.test(routeId)
    ? Number(routeId)
    : decodeURIComponent(routeId);

  const { data: player, isLoading } = usePlayerDetail(lookup);
  const id = player?.player_id ?? 0;
  const { data: friends } = useFriends();
  const addFriend = useAddFriend();
  const removeFriend = useRemoveFriend();

  const isFriend = friends?.some((f) => f.player_id === id) ?? false;

  const handleToggleFriend = () => {
    if (isFriend) {
      removeFriend.mutate(id);
    } else {
      addFriend.mutate({ playerId: id, tag: player?.name });
    }
  };

  return (
    <PageContainer>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-text-primary">{t("players:detail.title")}</h2>
        {!isLoading && player && (
          <Button
            variant={isFriend ? "danger" : "secondary"}
            leftIcon={isFriend ? UserMinus : UserPlus}
            onClick={handleToggleFriend}
            isLoading={addFriend.isPending || removeFriend.isPending}
            size="sm"
          >
            {isFriend
              ? t("players:detail.removeFriend", { defaultValue: "Quitar amigo" })
              : t("players:detail.addFriend", { defaultValue: "Agregar amigo" })}
          </Button>
        )}
      </div>

      <button
        onClick={() => navigate("/players")}
        className="mb-4 flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-accent-primary"
      >
        <ArrowLeft size={16} />
        {t("players:detail.backToDirectory")}
      </button>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}

      {!isLoading && !player && (
        <Card className="p-8 text-center">
          <p className="text-text-secondary">{t("players:detail.notFound")}</p>
        </Card>
      )}

      {player && (
        <>
          {/* Header */}
          <Card className="mb-4 p-5">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-primary">
                {player.name}
              </h1>
              {isFriend && (
                <span className="shrink-0 rounded-full bg-accent-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-primary">
                  {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                </span>
              )}
            </div>
            <p className="text-xs text-text-tertiary">
              {t("players:detail.playerId", { id: player.player_id })} · {player.primary_id}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="default">
                <Calendar size={12} className="mr-1" />
                {formatDate(player.first_seen)} → {formatDate(player.last_seen)}
              </Badge>
              <Badge variant="default">
                {t("players:detail.matchesPlayed", { count: player.total_matches })}
              </Badge>
              <Badge variant="success">
                {player.matches_as_teammate} {t("players:detail.asTeammate")}
              </Badge>
              <Badge variant="danger">
                {player.matches_as_opponent} {t("players:detail.asOpponent")}
              </Badge>
            </div>
          </Card>

          {/* Como compañero */}
          {player.matches_as_teammate > 0 && (
            <>
              <h2 className="mb-3 mt-6 flex items-center gap-2 text-lg font-bold text-text-primary">
                <Shield size={18} className="text-accent-secondary" />
                {t("players:detail.asTeammateHeading", { count: player.matches_as_teammate })}
              </h2>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label={t("players:detail.stats.winRate")}
                  value={pct(
                    player.wins_together,
                    player.wins_together + player.losses_together
                  )}
                  icon={Target}
                />
                <StatCard
                  label={t("players:detail.stats.winLoss")}
                  value={`${player.wins_together}-${player.losses_together}`}
                  icon={Swords}
                />
                <StatCard
                  label={t("players:detail.stats.totalGoals")}
                  value={player.total_goals_together}
                  icon={Goal}
                />
                <StatCard
                  label={t("players:detail.stats.assists")}
                  value={player.total_assists_together}
                  icon={HeartHandshake}
                />
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label={t("players:detail.stats.saves")}
                  value={player.total_saves_together}
                  icon={Shield}
                />
                <StatCard
                  label={t("players:detail.stats.shots")}
                  value={player.total_shots_together}
                  icon={Crosshair}
                />
                <StatCard
                  label={t("players:detail.stats.avgGoalsPerMatch")}
                  value={(
                    player.total_goals_together / player.matches_as_teammate
                  ).toFixed(2)}
                  icon={Zap}
                />
                <StatCard
                  label={t("players:detail.stats.avgAssistsPerMatch")}
                  value={(
                    player.total_assists_together /
                    player.matches_as_teammate
                  ).toFixed(2)}
                  icon={HeartHandshake}
                />
              </div>
            </>
          )}

          {/* Como rival */}
          {player.matches_as_opponent > 0 && (
            <>
              <h2 className="mb-3 mt-6 flex items-center gap-2 text-lg font-bold text-text-primary">
                <Swords size={18} className="text-accent-danger" />
                {t("players:detail.asOpponentHeading", { count: player.matches_as_opponent })}
              </h2>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label={t("players:detail.stats.winRate")}
                  value={pct(
                    player.wins_against,
                    player.wins_against + player.losses_against
                  )}
                  icon={Target}
                />
                <StatCard
                  label={t("players:detail.stats.winLoss")}
                  value={`${player.wins_against}-${player.losses_against}`}
                  icon={Swords}
                />
                <StatCard
                  label={t("players:detail.stats.goalsAgainst")}
                  value={player.total_goals_against}
                  icon={Goal}
                />
                <StatCard
                  label={t("players:detail.stats.assistsAgainst")}
                  value={player.total_assists_against}
                  icon={HeartHandshake}
                />
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label={t("players:detail.stats.savesAgainst")}
                  value={player.total_saves_against}
                  icon={Shield}
                />
                <StatCard
                  label={t("players:detail.stats.shotsAgainst")}
                  value={player.total_shots_against}
                  icon={Crosshair}
                />
                <StatCard
                  label={t("players:detail.stats.avgGoalsPerMatch")}
                  value={(
                    player.total_goals_against /
                    player.matches_as_opponent
                  ).toFixed(2)}
                  icon={Zap}
                />
                <StatCard
                  label={t("players:detail.stats.avgAssistsPerMatch")}
                  value={(
                    player.total_assists_against /
                    player.matches_as_opponent
                  ).toFixed(2)}
                  icon={HeartHandshake}
                />
              </div>
            </>
          )}

          {/* Recent matches */}
          {player.recent_matches.length > 0 && (
            <>
              <h2 className="mb-3 mt-6 flex items-center gap-2 text-lg font-bold text-text-primary">
                <Clock size={18} className="text-accent-primary" />
                {t("players:detail.recentMatches")}
              </h2>
              <div className="space-y-2">
                {player.recent_matches.map((m) => (
                  <Card
                    key={m.match_id}
                    className="cursor-pointer transition-all hover:shadow-level-2 hover:-translate-y-0.5"
                    onClick={() => navigate(`/history/${m.match_id}`)}
                  >
                    <div className="flex items-center gap-4 p-3">
                      <Badge
                        variant={
                          m.relationship === "teammate" ? "success" : "danger"
                        }
                      >
                        {m.relationship === "teammate"
                          ? t("players:detail.teammate")
                          : t("players:detail.opponent")}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text-primary">
                          {m.playlist ?? t("players:detail.matchFallback")} — {m.arena ? getArenaDisplayName(m.arena) : t("players:detail.arenaFallback")}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          {formatDateTime(m.start_time)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-secondary">
                        <span>
                          <Goal size={12} className="inline mr-0.5" />
                          {m.goals}
                        </span>
                        <span>
                          <HeartHandshake size={12} className="inline mr-0.5" />
                          {m.assists}
                        </span>
                        <span>
                          <Shield size={12} className="inline mr-0.5" />
                          {m.saves}
                        </span>
                        <span>
                          <Crosshair size={12} className="inline mr-0.5" />
                          {m.shots}
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}
