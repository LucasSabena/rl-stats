import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { useFriends } from "@/hooks/useFriends";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Users } from "lucide-react";
import type { SessionMatch } from "@/lib/types";
import { MoodGlyph } from "./MoodGlyph";

export function SessionMatchDetail({
  matches,
  isLoading,
  isError,
  onRetry,
}: {
  matches: SessionMatch[];
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
}) {
  const { t } = useTranslation(["analytics", "common", "players", "mood"]);
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
      <div className="flex h-32 flex-col items-center justify-center gap-3">
        <p className="text-sm text-accent-danger">
          {t("analytics:matchDetail.error", {
            defaultValue: "No se pudieron cargar las partidas de esta sesión.",
          })}
        </p>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t("common:buttons.retry")}
          </Button>
        )}
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
        const isDraw = m.winner === null;
        const resultLabel = isDraw
          ? t("analytics:matchDetail.draw", { defaultValue: "Empate" })
          : m.is_win
            ? t("analytics:matchDetail.win")
            : t("analytics:matchDetail.loss");

        return (
          <div
            key={m.id}
            className={`rounded-lg border p-3 transition-colors ${
              isDraw
                ? "border-border-subtle bg-bg-panel"
                : m.is_win
                  ? "border-accent-success/20 bg-accent-success/5"
                  : "border-accent-danger/20 bg-accent-danger/5"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-bold ${
                    isDraw
                      ? "bg-bg-surface text-text-secondary"
                      : m.is_win
                        ? "bg-accent-success/20 text-accent-success"
                        : "bg-accent-danger/20 text-accent-danger"
                  }`}
                >
                  {resultLabel}
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
                            {tm.name}{isFriend ? ` (${t("players:directory.badgeFriend", { defaultValue: "Amigo" })})` : ""}
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
                <MoodGlyph mood={m.mood} />
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
