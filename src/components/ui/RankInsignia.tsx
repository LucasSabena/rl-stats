import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  rankIconIndex,
  TIER_COLOR,
  TIER_RANK_INDEX,
  type DerivedRank,
  type RankTier,
} from "@/lib/rank";

interface RankInsigniaProps {
  rank: DerivedRank | null;
  size?: number;
  className?: string;
  /** Show the rank label next to the icon. */
  withLabel?: boolean;
}

/**
 * Fallback insignia, drawn as SVG.
 *
 * The real in-game icons ship in public/ranks/ and are preferred; this only
 * renders if one fails to load. The shape language follows the in-game
 * progression: a shield whose chevron count climbs with the tier, tinted with
 * that tier's colour.
 */
function Insignia({ tier, size }: { tier: RankTier; size: number }) {
  const color = TIER_COLOR[tier];
  const level = TIER_RANK_INDEX[tier];

  if (level === 0) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="8"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="2 2.5"
          opacity="0.7"
        />
      </svg>
    );
  }

  // Bronze..Diamond get 1-3 chevrons inside a shield; Champion and above
  // add a crown to separate the top end of the ladder at a glance.
  const chevrons = Math.min(3, Math.ceil(level / 2));
  const isElite = level >= 6;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={`rk-${tier.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="0.45" />
        </linearGradient>
      </defs>

      {/* Shield */}
      <path
        d="M12 1.8 21 5v7.2c0 4.6-3.6 8.2-9 10-5.4-1.8-9-5.4-9-10V5z"
        fill={`url(#rk-${tier.replace(/\s/g, "")})`}
        fillOpacity="0.22"
        stroke={color}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />

      {/* Chevrons */}
      {Array.from({ length: chevrons }).map((_, i) => (
        <path
          key={i}
          d={`M7.4 ${13.4 - i * 2.9} 12 ${10.2 - i * 2.9} 16.6 ${13.4 - i * 2.9}`}
          fill="none"
          stroke={color}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={1 - i * 0.18}
        />
      ))}

      {/* Crown for Champion and above */}
      {isElite && (
        <path
          d="M8.6 17.6h6.8M9.1 15.6l1.4 1.4M14.9 15.6l-1.4 1.4M12 15.1v1.9"
          stroke={color}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.9"
        />
      )}
    </svg>
  );
}

export const RankInsignia = memo(function RankInsignia({
  rank,
  size = 20,
  className,
  withLabel = false,
}: RankInsigniaProps) {
  const [iconFailed, setIconFailed] = useState(false);

  if (!rank) return null;

  const color = TIER_COLOR[rank.tier];
  // Two sizes ship; pick the one that won't be upscaled.
  const asset = size <= 32 ? 32 : 64;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1.5", className)}
      title={rank.label}
    >
      {iconFailed ? (
        <Insignia tier={rank.tier} size={size} />
      ) : (
        <img
          src={`/ranks/${rankIconIndex(rank)}-${asset}.webp`}
          width={size}
          height={size}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ width: size, height: size }}
          className="shrink-0 select-none object-contain"
          onError={() => setIconFailed(true)}
        />
      )}
      {withLabel && (
        <span className="text-[12px] font-medium" style={{ color }}>
          {rank.label}
        </span>
      )}
      {!withLabel && <span className="sr-only">{rank.label}</span>}
    </span>
  );
});

/**
 * Text-only rank chip for dense rows where an icon would be noise.
 */
export const RankChip = memo(function RankChip({
  rank,
  className,
}: {
  rank: DerivedRank | null;
  className?: string;
}) {
  if (!rank) return null;
  const color = TIER_COLOR[rank.tier];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold leading-none tabular",
        className,
      )}
      style={{
        color,
        backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`,
      }}
      title={rank.label}
    >
      {rank.short}
    </span>
  );
});
