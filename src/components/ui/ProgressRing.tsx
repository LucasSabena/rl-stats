import { cn } from "@/lib/utils";

interface ProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  trackClassName?: string;
  progressClassName?: string;
  label?: React.ReactNode;
  ariaLabel?: string;
}

/** Circular progress indicator (0..max). */
export function ProgressRing({
  value,
  max = 100,
  size = 56,
  strokeWidth = 5,
  className,
  trackClassName = "stroke-border-subtle",
  progressClassName = "stroke-accent-primary",
  label,
  ariaLabel,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(max, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / max);

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      role="img"
      aria-label={ariaLabel ?? `${Math.round((clamped / max) * 100)}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          className={trackClassName}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-[stroke-dashoffset] duration-500", progressClassName)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-text-primary">
        {label}
      </span>
    </div>
  );
}
