import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Button } from "./Button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-border-subtle px-6 py-14 text-center",
        className,
      )}
    >
      {/* A quiet monochrome glyph — the colored tile made every empty state
          read like a call to action. */}
      <Icon size={22} aria-hidden="true" className="text-text-tertiary" />
      <h3 className="mt-3 text-[15px] font-medium text-text-primary">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-text-secondary">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
