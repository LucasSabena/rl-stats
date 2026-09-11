import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { TrendingUp, TrendingDown, UserRound } from "lucide-react";
import type { PlayerAnalyticsMatch } from "@/lib/types";
import { MoodGlyph } from "./MoodGlyph";

export function PlayerMatchesPanel({
  matches,
  isLoading,
  isError,
  onRetry,
  playerName,
}: {
  matches: PlayerAnalyticsMatch[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  playerName: string;
}) {
  const { t } = useTranslation(["analytics", "common", "mood"]);

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
      ) : isError ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-surface/60 px-4 py-3">
          <p className="text-xs text-accent-danger">
            {t("analytics:panelError.message")}
          </p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t("analytics:panelError.retry")}
          </Button>
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
                  <MoodGlyph mood={m.mood} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
