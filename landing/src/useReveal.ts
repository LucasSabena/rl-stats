import { useEffect, useRef, useState } from "react";

/**
 * Reveals an element when it first enters the viewport.
 *
 * Uses IntersectionObserver rather than scroll listeners so long pages stay
 * cheap. `once` keeps the animation from replaying on every pass, which is
 * the expected behaviour for content sections.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  threshold?: number;
  rootMargin?: string;
}) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No IntersectionObserver (very old browsers): show content immediately
    // rather than leaving it invisible.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      {
        threshold: options?.threshold ?? 0.15,
        rootMargin: options?.rootMargin ?? "0px 0px -8% 0px",
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [options?.threshold, options?.rootMargin]);

  return { ref, visible };
}

/** Convenience wrapper that applies the `.reveal` classes. */
export function useRevealClass<T extends HTMLElement = HTMLDivElement>(delayMs = 0) {
  const { ref, visible } = useReveal<T>();
  return {
    ref,
    className: visible ? "reveal is-visible" : "reveal",
    style: delayMs ? { transitionDelay: `${delayMs}ms` } : undefined,
  };
}
