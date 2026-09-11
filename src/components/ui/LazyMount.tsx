import { useEffect, useRef, useState, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Mounts its children only when the placeholder approaches the viewport.
 *
 * The Analytics page fires one aggregate query per panel, and a small window
 * (or mobile) shows only one or two at a time. Deferring the off-screen panels
 * removes 3-4 round-trips from the initial page load without changing what the
 * user sees when they scroll.
 *
 * Falls back to rendering immediately when IntersectionObserver is missing
 * (older WebView/JS test environments), so behavior never depends on it.
 */
export function LazyMount({
  children,
  minHeight = 180,
  rootMargin = "240px",
  className,
}: {
  children: ReactNode;
  minHeight?: number;
  rootMargin?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    if (visible) return;
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={ref} className={className}>
      {visible ? (
        children
      ) : (
        <div style={{ minHeight }}>
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
