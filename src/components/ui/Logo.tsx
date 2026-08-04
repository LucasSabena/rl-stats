import { cn } from "@/lib/utils";

interface LogoProps {
  /** Rendered size in px. Picks the nearest generated asset above it. */
  size?: number;
  className?: string;
}

/**
 * The app mark.
 *
 * Replaces the old sidebar icon, which pointed at `/src-tauri/icons/128x128.png`
 * — a path that never resolves through Vite, so it always fell back to a
 * hand-drawn "RL" placeholder.
 */
export function Logo({ size = 32, className }: LogoProps) {
  const asset = size <= 32 ? 64 : size <= 64 ? 128 : 256;

  return (
    <img
      src={`/brand/logo-${asset}.webp`}
      width={size}
      height={size}
      alt="RL Stats"
      draggable={false}
      className={cn("shrink-0 select-none object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
