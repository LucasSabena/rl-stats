import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { AnalyticsPeriod } from "@/lib/types";

const periodKeys: { value: AnalyticsPeriod; key: string }[] = [
  { value: "day", key: "analytics:periods.day" },
  { value: "week", key: "analytics:periods.week" },
  { value: "month", key: "analytics:periods.month" },
  { value: "year", key: "analytics:periods.year" },
  { value: "alltime", key: "analytics:periods.alltime" },
  { value: "session", key: "analytics:periods.session" },
];

interface PeriodTabsProps {
  active: AnalyticsPeriod;
  onChange: (period: AnalyticsPeriod) => void;
}

export function PeriodTabs({ active, onChange }: PeriodTabsProps) {
  const { t } = useTranslation(["analytics", "common"]);

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border-subtle bg-bg-secondary p-0.5">
      {periodKeys.map((period) => (
        <button
          key={period.value}
          onClick={() => onChange(period.value)}
          className={cn(
            "h-8 rounded px-3 text-[13px] font-medium transition-colors duration-150",
            active === period.value
              ? "bg-bg-surface text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          )}
          aria-pressed={active === period.value}
        >
          {t(period.key)}
        </button>
      ))}
    </div>
  );
}
