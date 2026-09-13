import { motion, useReducedMotion } from "motion/react";
import { useLocation } from "react-router-dom";

/**
 * Route-level enter animation. Keyed by pathname so navigation re-plays it,
 * and skipped entirely for users who prefer reduced motion. Kept subtle: a
 * 6px rise, no exit animation (the outgoing page unmounts immediately).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
