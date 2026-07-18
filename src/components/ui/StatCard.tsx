import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils";
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

const accentStyles = {
  blue: "border-l-accent-primary",
  orange: "border-l-accent-secondary",
  green: "border-l-accent-success",
  purple: "border-l-accent-purple",
  default: "border-l-transparent",
};

const accentIconStyles = {
  blue: "text-accent-primary bg-accent-primary-subtle",
  orange: "text-accent-secondary bg-accent-secondary-subtle",
  green: "text-accent-success bg-accent-success-subtle",
  purple: "text-accent-purple bg-accent-purple-subtle",
  default: "text-text-tertiary bg-bg-panel",
};

export function StatCard({ label, value, icon: Icon, trend, trendValue, className, accent = "default" }: StatCardProps) {
  const trendColors = {
    up: "text-accent-success",
    down: "text-accent-danger",
    flat: "text-text-tertiary",
  };

  const displayValue = typeof value === "number" ? formatNumber(value) : value;

  return (
    <div
      className={cn(
        "rounded-xl border border-border-subtle bg-bg-surface p-4 transition-all duration-200 ease-out",
        "hover:border-border-default hover:shadow-level-2",
        "border-l-[3px]",
        accentStyles[accent],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            {label}
          </p>
          <p className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-text-primary">
            {displayValue}
          </p>
        </div>
        {Icon && (
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", accentIconStyles[accent])}>
            <Icon size={18} />
          </div>
        )}
      </div>
      {trendValue && (
        <div className={cn("mt-2.5 flex items-center gap-1 text-xs font-medium", trend ? trendColors[trend] : "text-text-secondary")}>
          {trend ? <span aria-hidden="true">{trend === "up" ? "↑" : trend === "down" ? "↓" : "—"}</span> : null}
          <span>{trendValue}</span>
        </div>
      )}
    </div>
  );
}
