import { memo } from "react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface MatchTimerProps {
  timeRemaining: number;
  isOvertime: boolean;
}

export const MatchTimer = memo(function MatchTimer({ timeRemaining, isOvertime }: MatchTimerProps) {
  const { t } = useTranslation(["live", "common"]);

  return (
    <div className="flex items-center gap-1.5">
      {isOvertime && (
        <span className="rounded-full bg-accent-warning-subtle border border-accent-warning/20 px-2 py-0.5 text-[10px] font-bold text-accent-warning">
          {t("live:overtime")}
        </span>
      )}
      <div
        className={cn(
          "rounded-lg border px-3 py-1.5 font-mono text-base font-bold",
          isOvertime
            ? "border-accent-warning/30 bg-accent-warning-subtle text-accent-warning"
            : "border-border-subtle bg-bg-surface text-text-primary"
        )}
      >
        {isOvertime ? `+${formatDuration(timeRemaining)}` : formatDuration(timeRemaining)}
      </div>
    </div>
  );
});
