import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface HourBucket {
  hour: number;
  played: number;
  won: number;
  winRate: number;
}

interface HoursWheelProps {
  data: HourBucket[];
  /** Below this many matches an hour is treated as too noisy to read. */
  minSample?: number;
  className?: string;
}

const SIZE = 320;
const CENTER = SIZE / 2;
const R_INNER = 62;
const R_OUTER = 140;
const GAP_DEG = 2.2;

/** Win rate is polar around 50%, so the scale diverges from a neutral midpoint. */
function winRateColor(winRate: number, muted: boolean): string {
  if (muted) return "var(--fg-subtle)";
  const delta = (winRate - 50) / 50; // -1 .. 1
  if (Math.abs(delta) < 0.04) return "var(--fg-muted)";
  return delta > 0 ? "var(--success)" : "var(--danger)";
}

function polar(angleDeg: number, radius: number) {
  // -90 puts hour 0 at the top, like a clock face.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

function wedgePath(hour: number, radius: number): string {
  const start = hour * 15 + GAP_DEG / 2;
  const end = (hour + 1) * 15 - GAP_DEG / 2;

  const p1 = polar(start, R_INNER);
  const p2 = polar(end, R_INNER);
  const p3 = polar(end, radius);
  const p4 = polar(start, radius);

  return [
    `M ${p1.x} ${p1.y}`,
    `A ${R_INNER} ${R_INNER} 0 0 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${radius} ${radius} 0 0 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

/**
 * Win rate by hour of day, laid out as a clock.
 *
 * A radial layout is used because the dimension is genuinely cyclical — 23:00
 * sits next to 00:00, which a flat bar chart breaks apart. Wedge length encodes
 * win rate against a drawn 50% baseline ring, so above/below reads at a glance.
 * Hours with too few matches are desaturated rather than dropped, because an
 * hour with two games looking like a 100% win rate is the main way this kind of
 * chart lies.
 */
export function HoursWheel({ data, minSample = 3, className }: HoursWheelProps) {
  const { t } = useTranslation("analytics");
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const byHour = useMemo(() => {
    const map = new Map(data.map((d) => [d.hour, d]));
    return Array.from({ length: 24 }, (_, hour) => {
      const found = map.get(hour);
      return (
        found ?? { hour, played: 0, won: 0, winRate: 0 }
      );
    });
  }, [data]);

  const best = useMemo(() => {
    const eligible = byHour.filter((h) => h.played >= minSample);
    if (eligible.length === 0) return null;
    return eligible.reduce((a, b) => (b.winRate > a.winRate ? b : a));
  }, [byHour, minSample]);

  const totalPlayed = useMemo(
    () => byHour.reduce((sum, h) => sum + h.played, 0),
    [byHour],
  );

  const active = hovered != null ? byHour[hovered] : best;
  const baselineRadius = R_INNER + (R_OUTER - R_INNER) * 0.5;

  if (totalPlayed === 0) return null;

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={t("hoursWheel.ariaLabel", {
            defaultValue: "Win rate by hour of day",
          })}
          className="shrink-0 overflow-visible"
          onMouseLeave={() => setHovered(null)}
        >
          {/* 50% baseline — without it, radial length is unreadable. */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={baselineRadius}
            fill="none"
            stroke="var(--line-strong)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={R_OUTER}
            fill="none"
            stroke="var(--line-subtle)"
            strokeWidth="1"
          />

          {byHour.map((bucket) => {
            const hasData = bucket.played > 0;
            const muted = bucket.played < minSample;
            const radius = hasData
              ? R_INNER + (R_OUTER - R_INNER) * (bucket.winRate / 100)
              : R_INNER + 2;
            const isHovered = hovered === bucket.hour;

            return (
              <g key={bucket.hour}>
                {/* Invisible full-length hit area — bigger than the mark. */}
                <path
                  d={wedgePath(bucket.hour, R_OUTER)}
                  fill="transparent"
                  onMouseEnter={() => setHovered(bucket.hour)}
                  style={{ cursor: hasData ? "pointer" : "default" }}
                />
                <path
                  d={wedgePath(bucket.hour, Math.max(radius, R_INNER + 2))}
                  fill={winRateColor(bucket.winRate, muted || !hasData)}
                  fillOpacity={
                    !hasData ? 0.1 : isHovered ? 1 : muted ? 0.32 : 0.82
                  }
                  stroke={isHovered ? "var(--fg)" : "transparent"}
                  strokeWidth="1.5"
                  className="transition-[fill-opacity] duration-150"
                  pointerEvents="none"
                />
              </g>
            );
          })}

          {/* Quarter markers */}
          {[0, 6, 12, 18].map((hour) => {
            const pos = polar(hour * 15 + 7.5, R_OUTER + 15);
            return (
              <text
                key={hour}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-[var(--fg-muted)] text-[11px]"
              >
                {String(hour).padStart(2, "0")}
              </text>
            );
          })}

          {/* Center readout */}
          {active && (
            <>
              <text
                x={CENTER}
                y={CENTER - 14}
                textAnchor="middle"
                className="fill-[var(--fg-muted)] text-[11px]"
              >
                {String(active.hour).padStart(2, "0")}:00
              </text>
              <text
                x={CENTER}
                y={CENTER + 10}
                textAnchor="middle"
                className="fill-[var(--fg)] text-[24px] font-semibold"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {active.played > 0 ? `${Math.round(active.winRate)}%` : "—"}
              </text>
              <text
                x={CENTER}
                y={CENTER + 28}
                textAnchor="middle"
                className="fill-[var(--fg-subtle)] text-[10px]"
              >
                {t("hoursWheel.matches", {
                  count: active.played,
                  defaultValue: "{{count}} partidas",
                })}
              </text>
            </>
          )}
        </svg>

        <div className="flex max-w-[220px] flex-col gap-3 text-sm">
          <div>
            <p className="text-text-secondary">
              {t("hoursWheel.title", { defaultValue: "Win rate por hora" })}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-tertiary">
              {t("hoursWheel.help", {
                defaultValue:
                  "Cada radio es una hora del día. Más largo = mejor win rate. La línea punteada marca el 50%.",
              })}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 text-xs">
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-4 rounded-sm"
                style={{ background: "var(--success)" }}
              />
              <span className="text-text-secondary">
                {t("hoursWheel.above", { defaultValue: "Sobre 50%" })}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-4 rounded-sm"
                style={{ background: "var(--danger)" }}
              />
              <span className="text-text-secondary">
                {t("hoursWheel.below", { defaultValue: "Bajo 50%" })}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-4 rounded-sm opacity-30"
                style={{ background: "var(--fg-subtle)" }}
              />
              <span className="text-text-secondary">
                {t("hoursWheel.lowSample", {
                  count: minSample,
                  defaultValue: "Menos de {{count}} partidas",
                })}
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="self-start text-xs text-accent-primary hover:underline"
          >
            {showTable
              ? t("hoursWheel.hideTable", { defaultValue: "Ocultar tabla" })
              : t("hoursWheel.showTable", { defaultValue: "Ver como tabla" })}
          </button>
        </div>
      </div>

      {showTable && (
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs text-text-tertiary">
                <th className="py-1.5 pr-3 font-medium">
                  {t("hoursWheel.colHour", { defaultValue: "Hora" })}
                </th>
                <th className="py-1.5 pr-3 font-medium">
                  {t("hoursWheel.colPlayed", { defaultValue: "Partidas" })}
                </th>
                <th className="py-1.5 pr-3 font-medium">
                  {t("hoursWheel.colWon", { defaultValue: "Ganadas" })}
                </th>
                <th className="py-1.5 font-medium">
                  {t("hoursWheel.colWinRate", { defaultValue: "Win rate" })}
                </th>
              </tr>
            </thead>
            <tbody>
              {byHour
                .filter((h) => h.played > 0)
                .map((h) => (
                  <tr key={h.hour} className="border-b border-border-subtle/60">
                    <td className="py-1.5 pr-3 text-text-secondary">
                      {String(h.hour).padStart(2, "0")}:00
                    </td>
                    <td className="py-1.5 pr-3 text-text-secondary">{h.played}</td>
                    <td className="py-1.5 pr-3 text-text-secondary">{h.won}</td>
                    <td className="py-1.5 text-text-primary">
                      {Math.round(h.winRate)}%
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
