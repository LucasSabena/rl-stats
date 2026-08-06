import { memo } from "react";
import { cn, formatDuration } from "@/lib/utils";
import { getArenaDisplayName } from "@/lib/arenaMap";
import { useTranslation } from "react-i18next";

interface ScoreDisplayProps {
  blueScore: number;
  orangeScore: number;
  arena?: string;
  timeRemaining?: number;
  isOvertime?: boolean;
  matchTypeLabel?: string;
  matchSizeLabel?: string;
}

export const ScoreDisplay = memo(function ScoreDisplay({
  blueScore,
  orangeScore,
  arena,
  timeRemaining,
  isOvertime,
  matchTypeLabel,
  matchSizeLabel,
}: ScoreDisplayProps) {
  const { t } = useTranslation(["live", "common"]);
  const displayName = arena ? getArenaDisplayName(arena) : null;

  const blueLeads = blueScore > orangeScore;
  const orangeLeads = orangeScore > blueScore;

  return (
    <section className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-5 sm:gap-8 sm:px-8">
        <div className="flex items-center gap-4 justify-self-start">
          <span aria-hidden="true" className="h-12 w-1 rounded-full bg-team-blue" />
          <div>
            <p className="micro-label text-team-blue">{t("live:teams.blueShort")}</p>
            <p
              key={blueScore}
              className={cn(
                "numeral animate-score-pop text-5xl leading-none sm:text-6xl",
                blueLeads ? "text-team-blue" : "text-text-primary",
              )}
            >
              {blueScore}
            </p>
          </div>
        </div>

        <div className="text-center">
          <p className="flex items-center justify-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isOvertime ? "bg-accent-warning" : "animate-live-pulse bg-accent-success",
              )}
            />
            <span
              className={cn(
                "micro-label",
                isOvertime ? "animate-overtime text-accent-warning" : "text-accent-success",
              )}
            >
              {isOvertime ? t("live:overtime") : t("live:scoreboard.live")}
            </span>
          </p>
          <p className="mt-1.5 font-mono text-3xl font-bold tabular-nums tracking-tight text-text-primary">
            {timeRemaining !== undefined
              ? isOvertime
                ? `+${formatDuration(timeRemaining)}`
                : formatDuration(timeRemaining)
              : "--:--"}
          </p>
          <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] text-text-tertiary">
            {displayName && <span className="truncate">{displayName}</span>}
            {displayName && matchSizeLabel && <span aria-hidden="true">·</span>}
            {matchSizeLabel && <span className="shrink-0">{matchSizeLabel}</span>}
            {matchTypeLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span className="shrink-0">{matchTypeLabel}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-4 justify-self-end">
          <div className="text-right">
            <p className="micro-label text-team-orange">{t("live:teams.orangeShort")}</p>
            <p
              key={orangeScore}
              className={cn(
                "numeral animate-score-pop text-5xl leading-none sm:text-6xl",
                orangeLeads ? "text-team-orange" : "text-text-primary",
              )}
            >
              {orangeScore}
            </p>
          </div>
          <span aria-hidden="true" className="h-12 w-1 rounded-full bg-team-orange" />
        </div>
      </div>
    </section>
  );
});
