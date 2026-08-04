import { cn, formatNumber } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "flat";
  trendValue?: string;
  className?: string;
  accent?: "blue" | "orange" | "green" | "purple" | "default";
}

const ACCENT_TEXT = {
  blue: "text-accent-primary",
  orange: "text-accent-secondary",
  green: "text-accent-success",
  purple: "text-accent-purple",
  default: "text-text-tertiary",
} as const;

const TREND_COLORS = {
  up: "text-accent-success",
  down: "text-accent-danger",
  flat: "text-text-tertiary",
} as const;

/**
 * A single headline metric. The number is the subject — the label sits
 * quietly above it and the icon is a small monochrome cue, not a colored tile.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendValue,
  className,
  accent = "default",
}: StatCardProps) {
  const displayValue = typeof value === "number" ? formatNumber(value) : value;

  return (
    <div
      className={cn(
        "rounded-lg border border-border-subtle bg-bg-surface p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-text-secondary">{label}</p>
        {Icon && (
          <Icon
            size={15}
            aria-hidden="true"
            className={cn("shrink-0", ACCENT_TEXT[accent])}
          />
        )}
      </div>

      <p className="numeral mt-2 text-[28px] leading-none text-text-primary">
        {displayValue}
      </p>

      {trendValue && (
        <p
          className={cn(
            "mt-2 text-xs tabular",
            trend ? TREND_COLORS[trend] : "text-text-secondary",
          )}
        >
          {trend && (
            <span aria-hidden="true" className="mr-1">
              {trend === "up" ? "↑" : trend === "down" ? "↓" : "—"}
            </span>
          )}
          {trendValue}
        </p>
      )}
    </div>
  );
}
