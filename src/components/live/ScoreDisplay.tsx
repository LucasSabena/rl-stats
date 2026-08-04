import { memo } from "react";
import { cn, formatDuration } from "@/lib/utils";
import { getArenaDisplayName, getArenaImagePath } from "@/lib/arenaMap";
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
  const imagePath = arena ? getArenaImagePath(arena) : null;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-team-blue-bg)] via-transparent to-[var(--color-team-orange-bg)] opacity-50" />

      <div className="relative flex items-center px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {imagePath && (
            <img
              src={imagePath}
              alt={displayName ?? ""}
              className="h-4 w-4 shrink-0 rounded border border-border-subtle bg-bg-panel object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          )}
          {displayName && (
            <span className="hidden truncate text-[10px] font-semibold text-text-tertiary sm:inline">
              {displayName}
            </span>
          )}
          {matchSizeLabel && (
            <span className="shrink-0 rounded border border-accent-primary/20 bg-accent-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-accent-primary">
              {matchSizeLabel}
            </span>
          )}
          {matchTypeLabel && (
            <span className="shrink-0 rounded border border-border-subtle bg-bg-panel/80 px-1.5 py-0.5 text-[10px] font-bold text-text-secondary">
              {matchTypeLabel}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "numeral text-3xl font-bold leading-none tracking-tight transition-colors duration-300",
                blueScore > orangeScore
                  ? "text-team-blue drop-shadow-[0_0_12px_var(--color-team-blue-glow)]"
                  : "text-text-primary"
              )}
            >
              {blueScore}
            </span>
            <span className="text-[10px] font-semibold text-team-blue/60">
              {t("live:teams.blueShort")}
            </span>
          </div>

          <span className="-mt-1 text-lg font-bold text-text-muted">:</span>

          <div className="flex flex-col items-center">
            <span
              className={cn(
                "numeral text-3xl font-bold leading-none tracking-tight transition-colors duration-300",
                orangeScore > blueScore
                  ? "text-team-orange drop-shadow-[0_0_12px_var(--color-team-orange-glow)]"
                  : "text-text-primary"
              )}
            >
              {orangeScore}
            </span>
            <span className="text-[10px] font-semibold text-team-orange/60">
              {t("live:teams.orangeShort")}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          {isOvertime && (
            <span className="animate-overtime rounded border border-accent-warning/20 bg-accent-warning-subtle px-1.5 py-0.5 text-[10px] font-bold text-accent-warning">
              {t("live:overtime")}
            </span>
          )}
          {timeRemaining !== undefined && (
            <span
              className={cn(
                "rounded px-2 py-0.5 font-mono text-sm font-bold",
                isOvertime
                  ? "border border-accent-warning/30 bg-accent-warning-subtle text-accent-warning"
                  : "border border-border-subtle bg-bg-panel/60 text-text-secondary"
              )}
            >
              {isOvertime ? `+${formatDuration(timeRemaining)}` : formatDuration(timeRemaining)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
