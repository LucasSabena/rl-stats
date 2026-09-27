import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { deriveRank, TIER_COLOR } from "@/lib/rank";
import type { AnalyticsPeriod, DateRange } from "@/lib/types";
import { useMmrHistory } from "@/hooks/useMmrHistory";

const ALL_PLAYLISTS = "all";

/** Distinct, theme-safe line colors for the simultaneous ladders. */
const SERIES_COLORS = [
  "var(--color-accent-primary)",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#84cc16",
];

function formatDate(value: string | number, language: string, withYear = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(language, {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "2-digit" } : {}),
  });
}

/** Split a canonical `match_type:playlist` key. */
function splitSeries(series: string): { matchType: string; playlist: string } {
  const idx = series.indexOf(":");
  if (idx < 0) return { matchType: "other", playlist: series };
  return {
    matchType: series.slice(0, idx) || "other",
    playlist: series.slice(idx + 1) || "other",
  };
}

export function MmrHistoryChart({
  playerId,
  period,
  dateRange,
}: {
  playerId: string | null;
  period: AnalyticsPeriod;
  dateRange?: DateRange;
}) {
  const { t, i18n } = useTranslation(["analytics", "common", "history"]);
  const [series, setSeries] = useState<string>(ALL_PLAYLISTS);

  const { data, isLoading, isError, refetch } = useMmrHistory(
    playerId,
    series === ALL_PLAYLISTS ? null : series,
    period,
    dateRange,
  );

  const points = useMemo(() => data?.points ?? [], [data]);

  /** Human label for a canonical series key: "Casual · Doubles (2v2)". */
  const seriesLabel = (key: string) => {
    const { matchType, playlist } = splitSeries(key);
    const playlistLabel = t(`history:playlists.${playlist}`, {
      defaultValue:
        playlist === "other"
          ? t("history:playlists.other")
          : playlist.charAt(0).toUpperCase() + playlist.slice(1),
    });
    if (matchType === "ranked" || matchType === "other") return playlistLabel;
    return `${t(`history:matchTypes.${matchType}`, { defaultValue: matchType })} · ${playlistLabel}`;
  };

  // Ordered list of ladders actually present in the loaded points.
  const seriesList = useMemo(() => {
    const seen: string[] = [];
    for (const point of points) {
      if (!seen.includes(point.series)) seen.push(point.series);
    }
    return seen;
  }, [points]);

  // The ladder the headline stats describe: the selected one, or the ladder
  // of the most recent reading when everything is overlaid.
  const statsSeries = useMemo(() => {
    if (series !== ALL_PLAYLISTS) return series;
    return points[points.length - 1]?.series ?? null;
  }, [series, points]);

  const stats = useMemo(() => {
    if (!statsSeries) return null;
    const seriesPoints = points.filter((p) => p.series === statsSeries);
    if (seriesPoints.length === 0) return null;
    const first = seriesPoints[0].mmr;
    const last = seriesPoints[seriesPoints.length - 1].mmr;
    const peak = Math.max(...seriesPoints.map((p) => p.mmr));
    const playlistPart = splitSeries(statsSeries).playlist;
    return {
      current: last,
      delta: last - first,
      peak,
      games: seriesPoints.length,
      rank: deriveRank(last, playlistPart),
      peakRank: deriveRank(peak, playlistPart),
    };
  }, [points, statsSeries]);

  // Numeric timestamp axis so sparse ladders align on real dates: each row is
  // one instant carrying the readings of whichever series had a match then.
  const chartData = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    for (const point of points) {
      const ts = new Date(point.start_time).getTime();
      if (Number.isNaN(ts)) continue;
      const row = rows.get(ts) ?? { ts };
      row[point.series] = point.mmr;
      rows.set(ts, row);
    }
    return [...rows.values()].sort((a, b) => Number(a.ts) - Number(b.ts));
  }, [points]);

  const multiSeries = series === ALL_PLAYLISTS && seriesList.length > 1;

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-accent-primary" />
          <h3 className="text-sm font-semibold text-text-primary">
            {t("analytics:mmrHistory.title", { defaultValue: "Evolución de MMR" })}
          </h3>
        </div>
        {(data?.playlists?.length ?? 0) > 1 && (
          <select
            value={series}
            onChange={(event) => setSeries(event.target.value)}
            aria-label={t("analytics:mmrHistory.playlistLabel", { defaultValue: "Playlist" })}
            className="rounded-md border border-border-subtle bg-bg-surface px-2 py-1 text-xs text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          >
            <option value={ALL_PLAYLISTS}>
              {t("analytics:mmrHistory.allPlaylists", { defaultValue: "Todas" })}
            </option>
            {data?.playlists.map((key) => (
              <option key={key} value={key}>
                {seriesLabel(key)}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : isError ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2">
          <p className="text-sm text-accent-danger">
            {t("analytics:mmrHistory.error", {
              defaultValue: "No se pudo cargar el historial de MMR.",
            })}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-md border border-border-subtle px-3 py-1 text-xs text-text-secondary hover:bg-bg-panel"
          >
            {t("common:buttons.retry")}
          </button>
        </div>
      ) : !stats ? (
        <EmptyState
          icon={Activity}
          title={t("analytics:mmrHistory.empty.title", {
            defaultValue: "Sin lecturas de MMR todavía",
          })}
          description={t("analytics:mmrHistory.empty.description", {
            defaultValue:
              "El MMR se guarda con cada partida cuando hay un proveedor configurado. Jugá algunas partidas para ver la curva.",
          })}
        />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                {t("analytics:mmrHistory.current", { defaultValue: "Actual" })}
                {statsSeries && series === ALL_PLAYLISTS && (
                  <span className="ml-1 normal-case">· {seriesLabel(statsSeries)}</span>
                )}
              </p>
              <p className="numeral text-xl font-bold text-text-primary">
                {Math.round(stats.current)}
              </p>
              {stats.rank && (
                <p
                  className="text-[10px] font-semibold"
                  style={{ color: TIER_COLOR[stats.rank.tier] }}
                >
                  {stats.rank.label}
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                {t("analytics:mmrHistory.delta", { defaultValue: "Cambio" })}
              </p>
              <p
                className={cn(
                  "flex items-center gap-1 numeral text-xl font-bold",
                  stats.delta >= 0 ? "text-accent-success" : "text-accent-danger",
                )}
              >
                {stats.delta >= 0 ? (
                  <TrendingUp size={16} />
                ) : (
                  <TrendingDown size={16} />
                )}
                {stats.delta > 0 ? `+${stats.delta}` : stats.delta}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                {t("analytics:mmrHistory.peak", { defaultValue: "Pico" })}
              </p>
              <p className="numeral text-xl font-bold text-text-primary">
                {stats.peak}
              </p>
              {stats.peakRank && (
                <p
                  className="text-[10px] font-semibold"
                  style={{ color: TIER_COLOR[stats.peakRank.tier] }}
                >
                  {stats.peakRank.label}
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                {t("analytics:mmrHistory.games", { defaultValue: "Partidas" })}
              </p>
              <p className="numeral text-xl font-bold text-text-primary">
                {stats.games}
              </p>
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
                  tickFormatter={(ts: number) => formatDate(ts, i18n.language)}
                  minTickGap={24}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-bg-panel)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--color-text-secondary)" }}
                  labelFormatter={(ts: number) => formatDate(ts, i18n.language, true)}
                  formatter={(value: number, key: string) => {
                    const playlistPart = splitSeries(key).playlist;
                    const rank = deriveRank(Number(value), playlistPart);
                    return [
                      rank ? `${value} · ${rank.label}` : `${value}`,
                      seriesLabel(key),
                    ];
                  }}
                />
                {seriesList.map((key, index) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={seriesLabel(key)}
                    stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {multiSeries && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {seriesList.map((key, index) => {
                const lastPoint = [...points].reverse().find((p) => p.series === key);
                const rank = lastPoint
                  ? deriveRank(lastPoint.mmr, splitSeries(key).playlist)
                  : null;
                return (
                  <span
                    key={key}
                    className="flex items-center gap-1.5 text-[11px] text-text-secondary"
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
                    />
                    {seriesLabel(key)}
                    {lastPoint && (
                      <span className="text-text-tertiary">
                        · {lastPoint.mmr}
                        {rank ? ` (${rank.short})` : ""}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
