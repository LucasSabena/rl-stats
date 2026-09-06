import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
} from "recharts";
import { SlidersHorizontal, Share2, Save, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { ShareModal } from "@/components/share/ShareModal";
import { buildCustomShareContext } from "@/lib/shareContext";
import { useCustomBreakdown } from "@/hooks/useAnalytics";
import { moodLabelKey } from "@/lib/moods";
import type {
  AnalyticsPeriod,
  BreakdownDimension,
  DataScope,
  MatchTypeFilter,
  PlaylistFilter,
  ShareContext,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface CustomBuilderPanelProps {
  period: AnalyticsPeriod;
  playlist: PlaylistFilter;
  matchType: MatchTypeFilter;
  scope: DataScope;
  playerId: string | null;
  username: string;
  friendsPresent: string[];
  dateLabel: string;
}

type BuilderMetric =
  | "winRate"
  | "played"
  | "avgGoals"
  | "avgSaves"
  | "avgShots"
  | "avgAssists"
  | "avgDemos"
  | "avgScore";

type ChartKind = "bars" | "line" | "area";

interface SavedConfig {
  name: string;
  dimension: BreakdownDimension;
  metric: BuilderMetric;
  kind: ChartKind;
}

const DIMENSIONS: BreakdownDimension[] = [
  "hour",
  "weekday",
  "playlist",
  "arena",
  "match_type",
  "mood",
  "game_number",
  "minute_bucket",
  "prev_result",
];

const METRICS: BuilderMetric[] = [
  "winRate",
  "played",
  "avgGoals",
  "avgSaves",
  "avgShots",
  "avgAssists",
  "avgDemos",
  "avgScore",
];

const STORAGE_KEY = "rl-stats:custom-analysis";

function loadSaved(): SavedConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedConfig[];
    return Array.isArray(parsed) ? parsed.filter((c) => c.name && c.dimension) : [];
  } catch {
    return [];
  }
}

const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-bg-elevated)",
  border: "1px solid var(--color-border-highlight)",
  borderRadius: "10px",
  color: "var(--color-text-primary)",
};

export const CustomBuilderPanel = memo(function CustomBuilderPanel({
  period,
  playlist,
  matchType,
  scope,
  playerId,
  username,
  friendsPresent,
  dateLabel,
}: CustomBuilderPanelProps) {
  const { t } = useTranslation(["analytics", "common", "mood"]);
  const [dimension, setDimension] = useState<BreakdownDimension>("hour");
  const [metric, setMetric] = useState<BuilderMetric>("winRate");
  const [kind, setKind] = useState<ChartKind>("bars");
  const [saved, setSaved] = useState<SavedConfig[]>(() => loadSaved());
  const [configName, setConfigName] = useState("");
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Private-mode storage — configs simply don't persist.
    }
  }, [saved]);

  const filters = useMemo(
    () => ({ playlist, matchType, scope, playerId }),
    [playlist, matchType, scope, playerId],
  );
  const { data, isLoading } = useCustomBreakdown(period, dimension, filters);

  const displayLabel = (bucket: { label: string }): string => {
    if (dimension === "mood") {
      if (bucket.label === "unrated") return t("mood:unrated");
      return t(moodLabelKey(bucket.label));
    }
    if (dimension === "weekday") {
      // Backend labels arrive in Spanish ("Lunes"…); map them back to the
      // Monday-first index so every locale renders its own names.
      const es = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
      const short = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      const idx = es.indexOf(bucket.label);
      if (idx >= 0) return t(`analytics:heatmap.weekdays.${short[idx]}`);
      return bucket.label;
    }
    if (dimension === "prev_result") {
      if (bucket.label === "Tras victoria") return t("analytics:builder.prevWin");
      if (bucket.label === "Tras derrota") return t("analytics:builder.prevLoss");
      return t("analytics:builder.prevStart");
    }
    return bucket.label;
  };

  const chartData = useMemo(
    () =>
      (data?.buckets ?? []).map((b) => ({
        label: displayLabel({ label: b.label }),
        winRate: b.winRate,
        played: b.played,
        avgGoals: b.avgGoals,
        avgSaves: b.avgSaves,
        avgShots: b.avgShots,
        avgAssists: b.avgAssists,
        avgDemos: b.avgDemos,
        avgScore: b.avgScore,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, dimension, t],
  );

  const shareContext: ShareContext | null = useMemo(() => {
    if (!data?.available || !data.buckets || data.buckets.length === 0) return null;
    const top = [...data.buckets]
      .sort((a, b) => b.played - a.played)
      .slice(0, 4)
      .map((b) => ({ label: displayLabel({ label: b.label }), played: b.played, winRate: b.winRate }));
    const title = `${t(`analytics:builder.dimensions.${dimension}`)} · ${t(`analytics:builder.metrics.${metric}`)}`;
    return buildCustomShareContext(title, top, friendsPresent, username, dateLabel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dimension, metric, friendsPresent, username, dateLabel, t]);

  const saveCurrent = () => {
    const name = configName.trim();
    if (!name) return;
    setSaved((prev) => {
      const without = prev.filter((c) => c.name !== name);
      return [...without, { name, dimension, metric, kind }].slice(-12);
    });
    setConfigName("");
  };

  const metricIsRate = metric === "winRate";
  const yDomain: [number, number] | [number, "auto"] = metricIsRate ? [0, 100] : [0, "auto"];

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <SlidersHorizontal size={15} className="text-accent-primary" />
          {t("analytics:builder.title")}
        </h4>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={Share2}
          onClick={() => setShareOpen(true)}
          disabled={!shareContext}
          aria-label={t("common:buttons.share")}
        />
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-text-tertiary">
            {t("analytics:builder.dimension")}
          </span>
          <Select
            value={dimension}
            onChange={(val) => setDimension(val as BreakdownDimension)}
            options={DIMENSIONS.map((d) => ({
              value: d,
              label: t(`analytics:builder.dimensions.${d}`),
            }))}
            className="w-full"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-text-tertiary">
            {t("analytics:builder.metric")}
          </span>
          <Select
            value={metric}
            onChange={(val) => setMetric(val as BuilderMetric)}
            options={METRICS.map((m) => ({
              value: m,
              label: t(`analytics:builder.metrics.${m}`),
            }))}
            className="w-full"
          />
        </label>
        <div>
          <span className="mb-1 block text-[11px] font-medium text-text-tertiary">
            {t("analytics:builder.chartType")}
          </span>
          <div className="flex rounded-lg border border-border-subtle bg-bg-panel p-0.5">
            {(["bars", "line", "area"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all",
                  kind === k
                    ? "bg-accent-primary text-white shadow-sm"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {t(`analytics:builder.kinds.${k}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : chartData.length === 0 ? (
        <p className="rounded-lg border border-border-subtle bg-bg-surface/60 px-4 py-6 text-center text-xs text-text-muted">
          {t("analytics:builder.noData")}
        </p>
      ) : (
        <div className="h-64 max-sm:h-52" role="img" aria-label={t("analytics:builder.title")}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--color-text-tertiary)", fontSize: 10 }}
                axisLine={{ stroke: "var(--color-border-subtle)" }}
                tickLine={false}
                interval="preserveStartEnd"
                angle={chartData.length > 10 ? -25 : 0}
                dy={chartData.length > 10 ? 8 : 0}
                height={chartData.length > 10 ? 48 : 30}
              />
              <YAxis
                domain={yDomain}
                tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "var(--color-text-primary)" }} />
              {kind === "bars" && (
                <Bar
                  dataKey={metric}
                  name={t(`analytics:builder.metrics.${metric}`)}
                  fill="var(--color-accent-primary)"
                  fillOpacity={0.75}
                  radius={[4, 4, 0, 0]}
                />
              )}
              {kind === "line" && (
                <Line
                  type="monotone"
                  dataKey={metric}
                  name={t(`analytics:builder.metrics.${metric}`)}
                  stroke="var(--color-accent-primary)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              )}
              {kind === "area" && (
                <Area
                  type="monotone"
                  dataKey={metric}
                  name={t(`analytics:builder.metrics.${metric}`)}
                  stroke="var(--color-accent-primary)"
                  strokeWidth={2}
                  fill="var(--color-accent-primary)"
                  fillOpacity={0.18}
                />
              )}
              {!metricIsRate && (
                <Line
                  type="monotone"
                  dataKey="winRate"
                  name="WR %"
                  stroke="var(--color-accent-success)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3 sm:flex-row sm:items-center">
        <input
          value={configName}
          onChange={(e) => setConfigName(e.target.value)}
          placeholder={t("analytics:builder.savePlaceholder")}
          maxLength={40}
          className="h-9 flex-1 rounded-lg border border-border-subtle bg-bg-panel px-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
        />
        <Button variant="secondary" size="sm" leftIcon={Save} onClick={saveCurrent} disabled={!configName.trim()}>
          {t("analytics:builder.save")}
        </Button>
      </div>

      {saved.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {saved.map((config) => (
            <span
              key={config.name}
              className="flex items-center gap-1 rounded-full border border-border-subtle bg-bg-panel py-1 pl-3 pr-1 text-xs text-text-secondary"
            >
              <button
                type="button"
                className="hover:text-text-primary"
                title={`${t(`analytics:builder.dimensions.${config.dimension}`)} · ${t(`analytics:builder.metrics.${config.metric}`)}`}
                onClick={() => {
                  setDimension(config.dimension);
                  setMetric(config.metric);
                  setKind(config.kind);
                }}
              >
                {config.name}
              </button>
              <button
                type="button"
                aria-label={t("common:buttons.delete")}
                className="rounded-full p-1 text-text-muted hover:bg-bg-hover hover:text-accent-danger"
                onClick={() => setSaved((prev) => prev.filter((c) => c.name !== config.name))}
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        context={shareContext}
      />
    </Card>
  );
});
