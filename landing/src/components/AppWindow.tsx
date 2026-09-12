import { cn } from "@/cn";

interface AppWindowProps {
  src: string;
  alt: string;
  /** Optional caption rendered under the frame. */
  caption?: string;
  /** Adds a browser-style chrome bar with traffic-light dots. */
  chrome?: boolean;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}

/**
 * Presents a real app screenshot inside a Windows-style frame.
 *
 * Reusing the actual screenshots (captured from the production build, see
 * `scripts/capture.spec.ts`) is deliberate: marketing pages that redraw their
 * product in DOM tend to drift from the real UI and end up overselling it.
 * The frame is minimal — a title bar and a hairline border — because the
 * screenshot already carries the visual weight.
 */
export function AppWindow({
  src,
  alt,
  caption,
  chrome = true,
  className,
  imageClassName,
  priority = false,
}: AppWindowProps) {
  return (
    <figure className={cn("m-0", className)}>
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-border-strong bg-bg-surface shadow-[var(--shadow-4)]",
        )}
      >
        {chrome && (
          <div className="flex h-8 items-center gap-2 border-b border-border-subtle bg-bg-elevated px-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.66_0.2_25)]" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.79_0.16_75)]" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.74_0.17_157)]" aria-hidden="true" />
            <span className="ml-2 font-mono text-[10px] text-text-muted">RL Stats</span>
          </div>
        )}
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          className={cn("block w-full", imageClassName)}
        />
      </div>
      {caption && (
        <figcaption className="mt-2.5 text-xs text-text-muted">{caption}</figcaption>
      )}
    </figure>
  );
}
