import { useEffect, useMemo } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface NumberTickerProps {
  value: number;
  className?: string;
  /** Decimal places to keep while animating. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Spring duration in seconds. */
  duration?: number;
}

/**
 * Animated numeric readout. Animates from the previous value to the new one
 * with a spring; reduced-motion users see the final value immediately.
 */
export function NumberTicker({
  value,
  className,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 0.7,
}: NumberTickerProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const reduced = useReducedMotion();
  const spring = useSpring(0, { duration: duration * 1000, bounce: 0 });

  const format = useMemo(
    () => (input: number) =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(input),
    [decimals, locale]
  );

  const text = useTransform(spring, (current) =>
    `${prefix}${format(current)}${suffix}`
  );

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  const initial = useMemo(
    () => `${prefix}${format(value)}${suffix}`,
    [format, prefix, suffix, value]
  );

  if (reduced) {
    return <span className={cn("tabular-nums", className)}>{initial}</span>;
  }

  return (
    <motion.span className={cn("tabular-nums", className)} aria-label={initial}>
      {text}
    </motion.span>
  );
}
