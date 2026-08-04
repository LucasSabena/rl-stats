import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "elevated" | "glass" | "accent" | "panel";
  hoverable?: boolean;
  onClick?: () => void;
}

const VARIANTS = {
  default: "border-border-subtle bg-bg-surface",
  elevated: "border-border-default bg-bg-elevated shadow-level-2",
  panel: "border-border-subtle bg-bg-secondary",
  glass: "surface-glass border-border-default",
  accent: "border-[color-mix(in_oklab,var(--accent)_40%,transparent)] bg-accent-primary-muted",
} as const;

export function Card({
  children,
  className,
  variant = "default",
  hoverable = false,
  onClick,
}: CardProps) {
  const interactive = hoverable || Boolean(onClick);

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        VARIANTS[variant],
        // Depth comes from the border and surface step, not from lifting the
        // card off the page on hover.
        interactive &&
          "group cursor-pointer transition-colors duration-150 hover:border-border-highlight hover:bg-surface-hover",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
