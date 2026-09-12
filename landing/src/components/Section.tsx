import { useEffect, useState } from "react";
import { cn } from "@/cn";

interface SectionProps {
  id?: string;
  kicker?: string;
  title?: string;
  body?: string;
  children?: React.ReactNode;
  className?: string;
  /** Constrains the intro column; long-form sections read better narrow. */
  narrow?: boolean;
  headerExtra?: React.ReactNode;
}

/** Shared section shell: consistent rhythm, kicker, title and lead paragraph. */
export function Section({
  id,
  kicker,
  title,
  body,
  children,
  className,
  narrow = false,
  headerExtra,
}: SectionProps) {
  return (
    <section id={id} className={cn("scroll-mt-24 px-5 py-16 sm:py-20 lg:py-24", className)}>
      <div className="mx-auto w-full max-w-6xl">
        {(kicker || title || body) && (
          <header className={cn("mb-10 max-w-2xl", narrow && "mx-auto text-center")}>
            {kicker && (
              <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                {kicker}
              </p>
            )}
            {title && (
              <h2 className="text-balance text-2xl font-bold tracking-tight text-text-primary sm:text-3xl lg:text-[2rem] lg:leading-tight">
                {title}
              </h2>
            )}
            {body && (
              <p className="mt-4 text-pretty text-sm leading-relaxed text-text-secondary sm:text-base">
                {body}
              </p>
            )}
            {headerExtra}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}

/**
 * A single stat with a short label. Used sparingly — the product's own
 * numbers (match count, win rate) are the ones worth showing.
 */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="tabular text-2xl font-bold text-text-primary sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs leading-snug text-text-muted">{label}</p>
    </div>
  );
}

/**
 * Lightweight fade/parallax for the hero window. Respects reduced motion and
 * does nothing beyond a few pixels — enough to feel alive, never distracting.
 */
export function useParallax(strength = 12) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const progress = Math.min(window.scrollY / 600, 1);
        setOffset(progress * strength);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [strength]);

  return offset;
}
