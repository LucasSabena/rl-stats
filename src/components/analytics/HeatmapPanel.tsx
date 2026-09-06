import { Fragment, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { InsightsData } from "@/lib/types";
import { cn } from "@/lib/utils";

interface HeatmapPanelProps {
  insights: InsightsData;
}

/** Short weekday names, Monday-first to match the backend (Monday = 0). */
function weekdayShort(t: (key: string) => string, weekday: number): string {
  const keys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return t(`analytics:heatmap.weekdays.${keys[weekday] ?? "mon"}`);
}

function cellColor(winRate: number, played: number, minSample: number): string {
  if (played === 0) return "bg-bg-panel";
  if (played < minSample) return "bg-bg-panel opacity-70";
  const delta = (winRate - 50) / 50;
  if (Math.abs(delta) < 0.04) return "bg-border-default/60";
  return delta > 0 ? "bg-accent-success/70" : "bg-accent-danger/70";
}

/**
 * Hour × weekday heatmap (local time): when during the week you actually
 * perform. Pure divs — no chart lib needed for a 7×24 grid.
 */
export const HeatmapPanel = memo(function HeatmapPanel({ insights }: HeatmapPanelProps) {
  const { t } = useTranslation(["analytics"]);
  const minSample = insights.minSample ?? 3;

  const grid = useMemo(() => {
    const map = new Map<string, { played: number; won: number; winRate: number }>();
    for (const cell of insights.heatmap ?? []) {
      map.set(`${cell.weekday}:${cell.hour}`, cell);
    }
    return map;
  }, [insights.heatmap]);

  if (!insights.available || (insights.heatmap ?? []).length === 0) {
    return null;
  }

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const weekdays = [0, 1, 2, 3, 4, 5, 6];

  return (
    <Card className="p-4">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <CalendarClock size={15} className="text-accent-primary" />
        {t("analytics:heatmap.title")}
      </h4>
      <p className="mb-3 text-xs text-text-secondary">{t("analytics:heatmap.subtitle")}</p>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[44px_repeat(24,1fr)] gap-[3px]">
            <span />
            {hours.map((h) => (
              <span
                key={h}
                className="text-center text-[9px] text-text-muted"
              >
                {h % 3 === 0 ? `${h}h` : ""}
              </span>
            ))}
            {weekdays.map((day) => (
              <Fragment key={day}>
                <span className="pr-1 text-right text-[10px] font-medium text-text-secondary">
                  {weekdayShort(t, day)}
                </span>
                {hours.map((hour) => {
                  const cell = grid.get(`${day}:${hour}`);
                  const played = cell?.played ?? 0;
                  const winRate = cell?.winRate ?? 0;
                  return (
                    <span
                      key={`${day}-${hour}`}
                      title={
                        played > 0
                          ? t("analytics:heatmap.cellTooltip", {
                              day: weekdayShort(t, day),
                              hour,
                              played,
                              winRate,
                            })
                          : t("analytics:heatmap.cellEmpty")
                      }
                      className={cn(
                        "aspect-square min-h-[14px] rounded-[3px]",
                        cellColor(winRate, played, minSample),
                      )}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-text-tertiary">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-accent-danger/70" /> {t("analytics:heatmap.legendBad")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-border-default/60" /> {t("analytics:heatmap.legendEven")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-accent-success/70" /> {t("analytics:heatmap.legendGood")}
        </span>
        <span>{t("analytics:heatmap.sampleNote", { count: minSample })}</span>
      </div>
    </Card>
  );
});
