import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "live"
  | "win"
  | "loss"
  | "overtime"
  | "ranked"
  | "default"
  | "info"
  | "accent"
  | "success"
  | "danger";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}

/**
 * Small status marker.
 *
 * Deliberately quiet: text-weight and a low-opacity tint carry the meaning.
 * Badges were previously pill-shaped, blurred and glowing, which made every
 * screen look like a notification tray.
 */
const VARIANTS: Record<BadgeVariant, string> = {
  live: "bg-accent-success-subtle text-accent-success",
  win: "bg-accent-success-subtle text-accent-success",
  loss: "bg-accent-danger-subtle text-accent-danger",
  overtime: "bg-accent-warning-subtle text-accent-warning",
  ranked: "bg-accent-purple-subtle text-accent-purple",
  default: "bg-[var(--wash-strong)] text-text-secondary",
  info: "bg-accent-info-subtle text-accent-info",
  accent: "bg-accent-primary-subtle text-accent-primary",
  success: "bg-accent-success-subtle text-accent-success",
  danger: "bg-accent-danger-subtle text-accent-danger",
};

export function Badge({
  variant = "default",
  children,
  className,
  glow = false,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight",
        VARIANTS[variant],
        glow && "animate-pulse-subtle",
        className,
      )}
    >
      {variant === "live" && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-accent-success animate-pulse"
        />
      )}
      {children}
    </span>
  );
}
