import { useId } from "react";
import { cn } from "@/lib/utils";

export type ProgressBarSize = "sm" | "md";
export type ProgressBarVariant = "default" | "success" | "danger" | "warning";

interface ProgressBarProps {
  value: number;
  max?: number;
  size?: ProgressBarSize;
  label?: React.ReactNode;
  variant?: ProgressBarVariant;
  className?: string;
  "aria-label"?: string;
}

const BAR_VARIANTS: Record<ProgressBarVariant, string> = {
  default: "bg-accent-primary",
  success: "bg-accent-success",
  danger: "bg-accent-danger",
  warning: "bg-accent-warning",
};

const TRACK_SIZES: Record<ProgressBarSize, string> = {
  sm: "h-1.5",
  md: "h-2",
};

export function ProgressBar({
  value,
  max = 100,
  size = "md",
  label,
  variant = "default",
  className,
  "aria-label": ariaLabel,
}: ProgressBarProps) {
  const labelId = useId();
  const boundedMax = max > 0 ? max : 100;
  const clamped = Math.min(Math.max(value, 0), boundedMax);
  const percent = (clamped / boundedMax) * 100;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <span
          id={labelId}
          className="text-xs font-medium text-text-secondary"
        >
          {label}
        </span>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={boundedMax}
        aria-labelledby={label ? labelId : undefined}
        aria-label={!label ? ariaLabel : undefined}
        className={cn(
          "w-full overflow-hidden rounded-full bg-bg-secondary",
          TRACK_SIZES[size],
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-out",
            BAR_VARIANTS[variant],
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
