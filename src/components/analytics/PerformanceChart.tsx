import { memo, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend,
  ComposedChart,
  Bar,
} from "recharts";
import { BarChart3 } from "lucide-react";
import type { DailyRollup, DataScope } from "@/lib/types";
import { useTranslation } from "react-i18next";

type ChartMetric = "winRate" | "matchesPlayed" | "avgScore" | "goals" | "assists" | "saves" | "demos";

interface PerformanceChartProps {
  data: DailyRollup[];
  defaultMetric?: ChartMetric;
  scope?: DataScope;
}

const METRICS: { key: ChartMetric; labelKey: string; color: string; type: "rate" | "volume" }[] = [
  { key: "winRate", labelKey: "chart.metrics.wr", color: "var(--color-accent-primary)", type: "rate" },
  { key: "matchesPlayed", labelKey: "chart.metrics.matches", color: "var(--color-accent-purple)", type: "volume" },
  { key: "avgScore", labelKey: "chart.metrics.score", color: "var(--color-accent-success)", type: "volume" },
  { key: "goals", labelKey: "chart.metrics.goals", color: "var(--color-accent-secondary)", type: "volume" },
  { key: "assists", labelKey: "chart.metrics.assists", color: "var(--color-accent-purple)", type: "volume" },
  { key: "saves", labelKey: "chart.metrics.saves", color: "var(--color-accent-primary)", type: "volume" },
  { key: "demos", labelKey: "chart.metrics.demos", color: "var(--color-accent-danger)", type: "volume" },
];

export const PerformanceChart = memo(function PerformanceChart({
  data,
  defaultMetric = "winRate",
  scope,
}: PerformanceChartProps) {
  const { t } = useTranslation("analytics");
  const [metric, setMetric] = useState<ChartMetric>(defaultMetric);
  const [combo, setCombo] = useState(true);

  const chartData = useMemo(() => {
    return data.map((d) => ({
      date: d.date,
      winRate: d.matchesPlayed > 0 ? Math.round((d.wins / d.matchesPlayed) * 100) : 0,
      matchesPlayed: d.matchesPlayed,
      avgScore: Math.round(d.avgScore),
      goals: d.totalGoals,
      assists: d.totalAssists,
      saves: d.totalSaves,
      demos: d.totalDemos,
    }));
  }, [data]);

  const currentMetricDef = METRICS.find((m) => m.key === metric)!;

  const volumeMetricKey: ChartMetric = useMemo(() => {
    if (currentMetricDef.type === "volume") return metric;
    return "matchesPlayed";
  }, [currentMetricDef.type, metric]);

  const volumeMetricDef = METRICS.find((m) => m.key === volumeMetricKey)!;

  const yDomain: [number, number] | [number, "auto"] = useMemo(() => {
    if (!combo && metric === "winRate") return [0, 100];
    return [0, "auto"];
  }, [combo, metric]);

  if (chartData.length === 0) {
    return (
      <Card className="flex h-64 items-center justify-center">
        <p className="text-sm text-text-secondary">{t("chart.noData")}</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {scope === "team" ? t("chart.teamEvolution") : t("chart.evolution")}
        </h3>

        <div className="flex items-center gap-2">
          <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border-subtle bg-bg-panel p-0.5 scrollbar-hide" aria-label={t("chart.metricSelector")}>
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => { setMetric(m.key); setCombo(false); }}
                aria-pressed={metric === m.key && !combo}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
                  metric === m.key && !combo
                    ? "bg-accent-primary text-white shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {t(m.labelKey)}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCombo(!combo)}
            type="button"
            aria-pressed={combo}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
              combo
                ? "border-accent-primary bg-accent-primary text-white shadow-sm"
                : "border-border-subtle bg-bg-surface text-text-secondary hover:text-text-primary"
            )}
          >
            <BarChart3 size={14} />
            {t("chart.combo")}
          </button>
        </div>
      </div>

      <div role="img" aria-label={t("chart.ariaLabel", { metric: t(currentMetricDef.labelKey) })} className="h-80 max-sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          {combo ? (
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="gradient-winRate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-accent-primary)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--color-accent-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
                axisLine={{ stroke: "var(--color-border-subtle)" }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                domain={[0, 100]}
                tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                allowDecimals={false}
                tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border-highlight)",
                  borderRadius: "10px",
                  color: "var(--color-text-primary)",
                }}
                labelStyle={{ color: "var(--color-text-primary)" }}
              />
              <Legend />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="winRate"
                name="Win Rate (%)"
                stroke="var(--color-accent-primary)"
                strokeWidth={2}
                fill="url(#gradient-winRate)"
              />
              <Bar
                yAxisId="right"
                dataKey={volumeMetricKey}
                name={t(volumeMetricDef.labelKey)}
                fill={volumeMetricDef.color}
                fillOpacity={0.6}
                radius={[4, 4, 0, 0]}
              />
            </ComposedChart>
          ) : (
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={currentMetricDef.color} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={currentMetricDef.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
                axisLine={{ stroke: "var(--color-border-subtle)" }}
                tickLine={false}
              />
              <YAxis
                domain={yDomain}
                tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border-highlight)",
                  borderRadius: "10px",
                  color: "var(--color-text-primary)",
                }}
                labelStyle={{ color: "var(--color-text-primary)" }}
              />
              <Area
                type="monotone"
                dataKey={metric}
                name={t(currentMetricDef.labelKey)}
                stroke={currentMetricDef.color}
                strokeWidth={2}
                fill={`url(#gradient-${metric})`}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
});
