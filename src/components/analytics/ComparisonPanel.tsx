import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, GitCompare, Minus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import type { AnalyticsPeriod, MatchTypeFilter, PlaylistFilter } from "@/lib/types";
import { useAnalyticsComparison } from "@/hooks/useAnalyticsComparison";

type Mode = "players" | "periods";

interface PlayerOption {
  primary_id: string;
  name: string;
}

interface MetricRow {
  label: string;
  a: number;
  b: number;
  higherIsBetter: boolean;
  suffix?: string;
  decimals?: number;
}

function winRate(side: { wins: number; totalMatches: number }): number {
  return side.totalMatches > 0 ? (side.wins / side.totalMatches) * 100 : 0;
}

function buildMetrics(
  a: {
    totalMatches: number;
    wins: number;
    losses: number;
    totalGoals: number;
    totalConceded: number;
    totalShots: number;
    totalSaves: number;
    totalAssists: number;
    totalDemos: number;
    avgScore: number;
    avgDuration: number;
    peakSpeed: number;
    totalKickoffGoals: number;
    totalKickoffConceded: number;
  },
  b: typeof a,
  labels: Record<string, string>,
): MetricRow[] {
  return [
    { label: labels.matches, a: a.totalMatches, b: b.totalMatches, higherIsBetter: true },
    { label: labels.winRate, a: winRate(a), b: winRate(b), higherIsBetter: true, suffix: "%" },
    { label: labels.wins, a: a.wins, b: b.wins, higherIsBetter: true },
    { label: labels.losses, a: a.losses, b: b.losses, higherIsBetter: false },
    { label: labels.goals, a: a.totalGoals, b: b.totalGoals, higherIsBetter: true },
    { label: labels.conceded, a: a.totalConceded, b: b.totalConceded, higherIsBetter: false },
    { label: labels.assists, a: a.totalAssists, b: b.totalAssists, higherIsBetter: true },
    { label: labels.saves, a: a.totalSaves, b: b.totalSaves, higherIsBetter: true },
    { label: labels.shots, a: a.totalShots, b: b.totalShots, higherIsBetter: true },
    { label: labels.demos, a: a.totalDemos, b: b.totalDemos, higherIsBetter: true },
    { label: labels.avgScore, a: a.avgScore, b: b.avgScore, higherIsBetter: true, decimals: 1 },
    { label: labels.kickoff, a: a.totalKickoffGoals, b: b.totalKickoffGoals, higherIsBetter: true },
    { label: labels.kickoffConceded, a: a.totalKickoffConceded, b: b.totalKickoffConceded, higherIsBetter: false },
    { label: labels.peakSpeed, a: a.peakSpeed, b: b.peakSpeed, higherIsBetter: true, decimals: 0 },
  ];
}

export function ComparisonPanel({
  period,
  playlist,
  matchType,
  playerId,
  playerOptions,
  username,
}: {
  period: AnalyticsPeriod;
  playlist: PlaylistFilter;
  matchType: MatchTypeFilter;
  playerId: string | null;
  playerOptions: PlayerOption[];
  username: string;
}) {
  const { t } = useTranslation(["analytics", "common"]);
  const [mode, setMode] = useState<Mode>("periods");
  const [rivalId, setRivalId] = useState<string | null>(null);

  const rivals = useMemo(
    () => playerOptions.filter((option) => option.primary_id !== playerId),
    [playerOptions, playerId],
  );

  useEffect(() => {
    if (rivalId && rivals.some((option) => option.primary_id === rivalId)) return;
    setRivalId(rivals[0]?.primary_id ?? null);
  }, [rivals, rivalId]);

  const { data, isLoading, isError, refetch } = useAnalyticsComparison(
    mode,
    playerId,
    mode === "players" ? rivalId : null,
    period,
    { playlist, matchType },
  );

  const labels = useMemo(
    () => ({
      matches: t("analytics:comparison.metrics.matches", { defaultValue: "Partidas" }),
      winRate: t("analytics:comparison.metrics.winRate", { defaultValue: "Win rate" }),
      wins: t("analytics:comparison.metrics.wins", { defaultValue: "Victorias" }),
      losses: t("analytics:comparison.metrics.losses", { defaultValue: "Derrotas" }),
      goals: t("analytics:comparison.metrics.goals", { defaultValue: "Goles" }),
      conceded: t("analytics:comparison.metrics.conceded", { defaultValue: "Goles recibidos" }),
      assists: t("analytics:comparison.metrics.assists", { defaultValue: "Asistencias" }),
      saves: t("analytics:comparison.metrics.saves", { defaultValue: "Paradas" }),
      shots: t("analytics:comparison.metrics.shots", { defaultValue: "Tiros" }),
      demos: t("analytics:comparison.metrics.demos", { defaultValue: "Demos" }),
      avgScore: t("analytics:comparison.metrics.avgScore", { defaultValue: "Puntos prom." }),
      kickoff: t("analytics:comparison.metrics.kickoff", { defaultValue: "Goles de saque" }),
      kickoffConceded: t("analytics:comparison.metrics.kickoffConceded", {
        defaultValue: "Saque recibidos",
      }),
      peakSpeed: t("analytics:comparison.metrics.peakSpeed", { defaultValue: "Pico velocidad" }),
    }),
    [t],
  );

  const rivalName =
    rivals.find((option) => option.primary_id === rivalId)?.name ??
    t("analytics:comparison.pickRival", { defaultValue: "Elegí un jugador" });

  const labelA = mode === "players" ? username : t("analytics:comparison.current", { defaultValue: "Actual" });
  const labelB = mode === "players" ? rivalName : t("analytics:comparison.previous", { defaultValue: "Anterior" });

  const formatWindow = (window?: { start: string; end: string }) =>
    window ? `${window.start} → ${window.end}` : "";

  const metrics =
    data && data.available ? buildMetrics(data.a, data.b, labels) : [];

  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitCompare size={16} className="text-accent-purple" />
          <h3 className="text-sm font-semibold text-text-primary">
            {t("analytics:comparison.title", { defaultValue: "Comparador" })}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border-subtle p-0.5">
            {(["periods", "players"] as Mode[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs transition-colors",
                  mode === value
                    ? "bg-accent-primary text-accent-primary-fg"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {value === "periods"
                  ? t("analytics:comparison.modePeriods", { defaultValue: "Períodos" })
                  : t("analytics:comparison.modePlayers", { defaultValue: "Jugadores" })}
              </button>
            ))}
          </div>
          {mode === "players" && (
            <select
              value={rivalId ?? ""}
              onChange={(event) => setRivalId(event.target.value || null)}
              aria-label={t("analytics:comparison.pickRival", { defaultValue: "Elegí un jugador" })}
              className="rounded-md border border-border-subtle bg-bg-surface px-2 py-1 text-xs text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              <option value="">
                {t("analytics:comparison.pickRival", { defaultValue: "Elegí un jugador" })}
              </option>
              {rivals.map((option) => (
                <option key={option.primary_id} value={option.primary_id}>
                  {option.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-56 w-full rounded-lg" />
      ) : isError ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2">
          <p className="text-sm text-accent-danger">
            {t("analytics:comparison.error", { defaultValue: "No se pudo cargar la comparación." })}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-md border border-border-subtle px-3 py-1 text-xs text-text-secondary hover:bg-bg-panel"
          >
            {t("common:buttons.retry")}
          </button>
        </div>
      ) : mode === "players" && !rivalId ? (
        <div className="flex h-32 items-center justify-center">
          <p className="text-sm text-text-secondary">
            {t("analytics:comparison.pickRivalHint", {
              defaultValue: "Elegí un jugador para comparar contra tus números.",
            })}
          </p>
        </div>
      ) : !data?.available ? (
        <div className="flex h-32 items-center justify-center">
          <p className="text-sm text-text-secondary">
            {t("analytics:comparison.empty", {
              defaultValue: "No hay partidas suficientes en este período.",
            })}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs text-text-tertiary">
                <th className="pb-2 font-medium">{t("common:labels.metric", { defaultValue: "Métrica" })}</th>
                <th className="pb-2 text-right font-medium">
                  {labelA}
                  {mode === "periods" && (
                    <span className="block text-[10px] font-normal text-text-tertiary">
                      {formatWindow(data.windowA)}
                    </span>
                  )}
                </th>
                <th className="pb-2 text-right font-medium">
                  {labelB}
                  {mode === "periods" && (
                    <span className="block text-[10px] font-normal text-text-tertiary">
                      {formatWindow(data.windowB)}
                    </span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => {
                const aWins = metric.higherIsBetter
                  ? metric.a > metric.b
                  : metric.a < metric.b;
                const bWins = metric.higherIsBetter
                  ? metric.b > metric.a
                  : metric.b < metric.a;
                const fmt = (value: number) =>
                  metric.decimals !== undefined
                    ? value.toFixed(metric.decimals)
                    : `${Math.round(value)}${metric.suffix ?? ""}`;
                return (
                  <tr
                    key={metric.label}
                    className="border-b border-border-subtle/50 last:border-0"
                  >
                    <td className="py-1.5 text-xs text-text-secondary">{metric.label}</td>
                    <td
                      className={cn(
                        "py-1.5 text-right numeral text-xs",
                        aWins ? "font-semibold text-accent-success" : "text-text-primary",
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {aWins && <ArrowUp size={11} />}
                        {fmt(metric.a)}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "py-1.5 text-right numeral text-xs",
                        bWins ? "font-semibold text-accent-success" : "text-text-primary",
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {bWins && <ArrowUp size={11} />}
                        {fmt(metric.b)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 flex items-center gap-1 text-[10px] text-text-tertiary">
            {data.a.totalMatches === data.b.totalMatches ? (
              <Minus size={11} />
            ) : (
              <ArrowDown size={11} />
            )}
            {t("analytics:comparison.footnote", {
              defaultValue: "Verde = mejor valor en esa métrica.",
            })}
          </p>
        </div>
      )}
    </Card>
  );
}
