import { memo } from "react";
import { cn } from "@/lib/utils";
import {
  getArenaDisplayName,
  getArenaFallback,
  getArenaImagePath,
} from "@/lib/arenaMap";

type ArenaSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<ArenaSize, string> = {
  sm: "h-6 w-6 rounded",
  md: "h-10 w-10 rounded-md",
  lg: "h-16 w-16 rounded-lg",
};

const TEXT_SIZES: Record<ArenaSize, string> = {
  sm: "text-[11px]",
  md: "text-sm",
  lg: "text-base",
};

const FALLBACK_TEXT: Record<ArenaSize, string> = {
  sm: "text-[8px]",
  md: "text-[11px]",
  lg: "text-base",
};

interface ArenaThumbProps {
  arena: string | null | undefined;
  size?: ArenaSize;
  className?: string;
}

/**
 * Arena thumbnail.
 *
 * Falls back to a deterministic tinted tile when no image ships for the map,
 * so newly released Psyonix arenas degrade gracefully instead of rendering a
 * broken image.
 */
export const ArenaThumb = memo(function ArenaThumb({
  arena,
  size = "md",
  className,
}: ArenaThumbProps) {
  const displayName = getArenaDisplayName(arena);
  const imagePath = getArenaImagePath(arena);

  if (imagePath) {
    return (
      <img
        src={imagePath}
        alt=""
        loading="lazy"
        decoding="async"
        title={displayName}
        className={cn(
          SIZE_CLASSES[size],
          "shrink-0 border border-border-subtle object-cover",
          className,
        )}
      />
    );
  }

  const { hue, initials } = getArenaFallback(arena);

  return (
    <span
      aria-hidden="true"
      title={displayName}
      className={cn(
        SIZE_CLASSES[size],
        FALLBACK_TEXT[size],
        "flex shrink-0 items-center justify-center border border-border-subtle font-semibold tracking-tight",
        className,
      )}
      style={{
        backgroundColor: `oklch(0.45 0.09 ${hue} / 0.28)`,
        color: `oklch(0.78 0.11 ${hue})`,
      }}
    >
      {initials}
    </span>
  );
});

interface ArenaDisplayProps {
  arena: string | null | undefined;
  showImage?: boolean;
  size?: ArenaSize;
  className?: string;
}

export const ArenaDisplay = memo(function ArenaDisplay({
  arena,
  showImage = true,
  size = "md",
  className,
}: ArenaDisplayProps) {
  if (!arena) return null;

  const displayName = getArenaDisplayName(arena);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showImage && <ArenaThumb arena={arena} size={size} />}
      <span
        className={cn("truncate text-text-secondary", TEXT_SIZES[size])}
        title={displayName}
      >
        {displayName}
      </span>
    </div>
  );
});

/**
 * Compact inline arena label for cards and lists.
 */
export const ArenaBadge = memo(function ArenaBadge({
  arena,
  className,
}: {
  arena: string | null | undefined;
  className?: string;
}) {
  if (!arena) return null;
  const displayName = getArenaDisplayName(arena);

  return (
    <span
      className={cn("truncate text-[11px] text-text-muted", className)}
      title={displayName}
    >
      {displayName}
    </span>
  );
});
