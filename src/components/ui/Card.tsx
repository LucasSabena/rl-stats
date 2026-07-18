import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "elevated" | "glass" | "accent" | "panel";
  hoverable?: boolean;
  onClick?: () => void;
}

export function Card({
  children,
  className,
  variant = "default",
  hoverable = false,
  onClick,
}: CardProps) {
  const variants = {
    default: "border-border-subtle bg-bg-surface shadow-[var(--shadow-card-inner)]",
    elevated: "border-border-default bg-bg-elevated shadow-level-2 shadow-[var(--shadow-card-inner)]",
    panel: "border-border-subtle bg-bg-panel shadow-[var(--shadow-card-inner)]",
    glass: "surface-glass border-border-highlight shadow-[var(--shadow-card-inner)]",
    accent: "border-border-accent bg-accent-primary-muted shadow-[var(--shadow-card-inner)]",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        variants[variant],
        hoverable && "cursor-pointer group hover:-translate-y-1 hover:shadow-level-3 hover:border-border-highlight",
        className
      )}
      onClick={onClick}
    >
      {/* Inner glow effect on hover */}
      {hoverable && (
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-b from-white/[0.03] to-transparent" />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
