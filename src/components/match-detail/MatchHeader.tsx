import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn, formatDateTime, formatDuration } from "@/lib/utils";
import { getArenaDisplayName, getArenaImagePath } from "@/lib/arenaMap";
import type { MatchDetail, MatchType } from "@/lib/types";

interface MatchHeaderProps {
  match: MatchDetail;
}

export const MatchHeader = memo(function MatchHeader({ match }: MatchHeaderProps) {
  const { t } = useTranslation("matchDetail");

  const MATCH_TYPE_LABELS: Record<MatchType, string> = {
    ranked: t("matchType.ranked"),
    casual: t("matchType.casual"),
    tournament: t("matchType.tournament"),
    training: t("matchType.training"),
    other: t("matchType.other"),
  };

  const isDraw = match.winnerTeamNum === null;
  const blueWon = match.winnerTeamNum === 0;
  const orangeWon = match.winnerTeamNum === 1;

  const hasLocalTeam = match.localTeamNum !== null && match.localTeamNum !== undefined;
  const isWin = hasLocalTeam && match.winnerTeamNum === match.localTeamNum;
  const isLoss = hasLocalTeam && match.winnerTeamNum !== null && match.winnerTeamNum !== match.localTeamNum;

  const resultLabel = isWin
    ? t("infoPanel.win")
    : isLoss
      ? t("infoPanel.loss")
      : isDraw
        ? t("infoPanel.draw")
        : blueWon
          ? t("infoPanel.blueWon")
          : t("infoPanel.orangeWon");

  const resultTone = isWin
    ? "text-accent-success"
    : isLoss
      ? "text-accent-danger"
      : "text-text-secondary";

  const arenaName = match.arena ? getArenaDisplayName(match.arena) : null;
  const arenaImage = match.arena ? getArenaImagePath(match.arena) : null;

  return (
    <section className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-5 py-2.5">
        {match.matchType && (
          <span
            className={cn(
              "micro-label",
              match.matchType === "ranked" ? "text-accent-primary" : "text-text-tertiary",
            )}
          >
            {MATCH_TYPE_LABELS[match.matchType]}
          </span>
        )}
        {match.playlist && (
          <>
            <span aria-hidden="true" className="text-text-muted">·</span>
            <span className="text-[11px] text-text-secondary">{match.playlist}</span>
          </>
        )}
        <span aria-hidden="true" className="text-text-muted">·</span>
        <span className="text-[11px] text-text-secondary">
          {match.isOnline ? t("mode.online") : t("mode.local")}
        </span>

        {arenaName && (
          <span className="ml-auto flex min-w-0 items-center gap-1.5 text-[11px] text-text-secondary">
            {arenaImage && (
              <img
                src={arenaImage}
                alt=""
                className="h-4 w-4 rounded border border-border-subtle bg-bg-panel object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <span className="truncate">{arenaName}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-6 sm:gap-10">
        <div className="flex items-center justify-self-start gap-4">
          <span
            aria-hidden="true"
            className={cn("h-12 w-1 rounded-full", blueWon ? "bg-team-blue" : "bg-team-blue/40")}
          />
          <div>
            <p className="micro-label text-team-blue">{t("teams.blue")}</p>
            <p
              className={cn(
                "numeral animate-score-pop text-6xl leading-none sm:text-7xl",
                blueWon ? "text-team-blue" : isDraw ? "text-text-primary" : "text-text-tertiary",
              )}
            >
              {match.teamBlueScore}
            </p>
          </div>
        </div>

        <div className="text-center">
          <p className={cn("text-sm font-bold uppercase tracking-[0.14em]", resultTone)}>
            {resultLabel}
          </p>
          <p className="mt-1.5 text-[11px] text-text-tertiary">
            {formatDateTime(match.startTime * 1000)}
          </p>
        </div>

        <div className="flex items-center justify-self-end gap-4">
          <div className="text-right">
            <p className="micro-label text-team-orange">{t("teams.orange")}</p>
            <p
              className={cn(
                "numeral animate-score-pop text-6xl leading-none sm:text-7xl",
                orangeWon ? "text-team-orange" : isDraw ? "text-text-primary" : "text-text-tertiary",
              )}
            >
              {match.teamOrangeScore}
            </p>
          </div>
          <span
            aria-hidden="true"
            className={cn("h-12 w-1 rounded-full", orangeWon ? "bg-team-orange" : "bg-team-orange/40")}
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-border-subtle border-t border-border-subtle sm:grid-cols-4">
        <Fact label={t("header.duration")} value={match.durationSeconds ? formatDuration(match.durationSeconds) : "—"} />
        <Fact label={t("header.overtime")} value={match.isOvertime ? t("overtime.yes") : t("overtime.no")} />
        <Fact label={t("header.start")} value={formatDateTime(match.startTime * 1000)} />
        <Fact
          label={t("header.end")}
          value={match.endTime ? formatDateTime(match.endTime * 1000) : "—"}
        />
      </dl>
    </section>
  );
});

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-2.5">
      <dt className="micro-label">{label}</dt>
      <dd className="tabular mt-0.5 text-[13px] font-medium text-text-primary">{value}</dd>
    </div>
  );
}
