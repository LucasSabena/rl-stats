import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  strokeClassName?: string;
  fillClassName?: string;
  /** Draw a dot on the last value. */
  showLast?: boolean;
  ariaLabel?: string;
}

/**
 * Dependency-free SVG sparkline. Falls back to a flat line when all values
 * are equal so the component never divides by zero.
 */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  className,
  strokeClassName = "stroke-accent-primary",
  fillClassName = "fill-accent-primary/10",
  showLast = true,
  ariaLabel,
}: SparklineProps) {
  const { line, area, last } = useMemo(() => {
    const points = values.length > 1 ? values : [0, 0];
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const stepX = width / (points.length - 1);

    const coords = points.map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return [x, y] as const;
    });

    return {
      line: coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
      area: `M0,${height} L${coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")} L${width},${height} Z`,
      last: coords[coords.length - 1],
    };
  }, [values, width, height]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("overflow-visible", className)}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <path d={area} className={fillClassName} stroke="none" />
      <polyline
        points={line}
        className={strokeClassName}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showLast && (
        <circle cx={last[0]} cy={last[1]} r={2.4} className="fill-accent-primary" />
      )}
    </svg>
  );
}
