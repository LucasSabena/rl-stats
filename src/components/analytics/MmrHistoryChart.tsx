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
import type { AnalyticsPeriod } from "@/lib/types";
import { useMmrHistory } from "@/hooks/useMmrHistory";

const ALL_PLAYLISTS = "all";

function formatDate(value: string, language: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(language, { day: "numeric", month: "short" });
}

export function MmrHistoryChart({
  playerId,
  period,
}: {
  playerId: string | null;
  period: AnalyticsPeriod;
}) {
  const { t, i18n } = useTranslation(["analytics", "common"]);
  const [playlist, setPlaylist] = useState<string>(ALL_PLAYLISTS);

  const { data, isLoading, isError, refetch } = useMmrHistory(
    playerId,
    playlist === ALL_PLAYLISTS ? null : playlist,
    period,
  );

  const points = useMemo(() => data?.points ?? [], [data]);

  const stats = useMemo(() => {
    if (points.length === 0) return null;
    const first = points[0].mmr;
    const last = points[points.length - 1].mmr;
    const peak = Math.max(...points.map((p) => p.mmr));
    const low = Math.min(...points.map((p) => p.mmr));
    // Rank is derived on the ladder of the playlist being shown (or the last
    // reading's playlist when "all" is selected).
    const lastPlaylist = points[points.length - 1].playlist;
    const rank = deriveRank(last, lastPlaylist);
    const peakRank = deriveRank(peak, lastPlaylist);
    return { current: last, delta: last - first, peak, low, games: points.length, rank, peakRank };
  }, [points]);

  const chartData = useMemo(
    () =>
      points.map((point) => ({
        date: formatDate(point.start_time, i18n.language),
        mmr: point.mmr,
        win: point.is_win,
      })),
    [points, i18n.language],
  );

  const rankPlaylist = points[points.length - 1]?.playlist ?? null;

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
            value={playlist}
            onChange={(event) => setPlaylist(event.target.value)}
            aria-label={t("analytics:mmrHistory.playlistLabel", { defaultValue: "Playlist" })}
            className="rounded-md border border-border-subtle bg-bg-surface px-2 py-1 text-xs text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          >
            <option value={ALL_PLAYLISTS}>
              {t("analytics:mmrHistory.allPlaylists", { defaultValue: "Todas" })}
            </option>
            {data?.playlists.map((name) => (
              <option key={name} value={name}>
                {name}
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
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
                  interval="preserveStartEnd"
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
                  formatter={(value: number) => {
                    const rank = deriveRank(Number(value), rankPlaylist);
                    return [
                      rank ? `${value} · ${rank.label}` : `${value}`,
                      "MMR",
                    ];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="mmr"
                  stroke="var(--color-accent-primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
