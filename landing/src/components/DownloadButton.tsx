import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { fetchLatestRelease, type ReleaseInfo } from "@/release";
import { cn } from "@/cn";

interface DownloadButtonProps {
  size?: "md" | "lg";
  variant?: "primary" | "ghost";
  className?: string;
  showVersion?: boolean;
}

/**
 * The one download CTA. It always resolves the newest GitHub release, so the
 * link never goes stale after a version bump.
 */
export function DownloadButton({
  size = "md",
  variant = "primary",
  className,
  showVersion = false,
}: DownloadButtonProps) {
  const { copy, format } = useI18n();
  const [release, setRelease] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchLatestRelease(controller.signal).then((info) => {
      if (!controller.signal.aborted) setRelease(info);
    });
    return () => controller.abort();
  }, []);

  const href = release?.downloadUrl ?? "#download";
  const versionLabel = release
    ? release.version
      ? format(copy.hero.version, { version: release.version })
      : copy.hero.platform
    : copy.hero.versionLoading;

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <a
        href={href}
        // Cross-origin (github.com) — no `download` attribute needed; the
        // server response already sets the filename.
        className={cn(
          "group inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          variant === "primary" &&
            "bg-accent text-accent-fg hover:bg-accent-hover shadow-[var(--shadow-2)]",
          variant === "ghost" &&
            "border border-border-strong bg-bg-surface text-text-primary hover:bg-bg-active",
          size === "lg" ? "px-6 py-3.5 text-base" : "px-4 py-2.5 text-sm",
        )}
      >
        {release ? (
          <Download size={size === "lg" ? 20 : 16} aria-hidden="true" />
        ) : (
          <Loader2 size={size === "lg" ? 20 : 16} className="animate-spin" aria-hidden="true" />
        )}
        <span>{copy.hero.ctaPrimary}</span>
      </a>
      {showVersion && (
        <p className="text-xs text-text-muted">{versionLabel}</p>
      )}
    </div>
  );
}
