import { memo, useMemo, useState } from "react";
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
  ReferenceLine,
} from "recharts";
import { BatteryWarning, Share2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ShareModal } from "@/components/share/ShareModal";
import { buildFatigueShareContext } from "@/lib/shareContext";
import { useSessionCurve } from "@/hooks/useAnalytics";
import type {
  AnalyticsPeriod,
  DataScope,
  MatchTypeFilter,
  PlaylistFilter,
  ShareContext,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface FatiguePanelProps {
  period: AnalyticsPeriod;
  playlist: PlaylistFilter;
  matchType: MatchTypeFilter;
  scope: DataScope;
  playerId: string | null;
  username: string;
  friendsPresent: string[];
  dateLabel: string;
}

const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-bg-elevated)",
  border: "1px solid var(--color-border-highlight)",
  borderRadius: "10px",
  color: "var(--color-text-primary)",
};

export const FatiguePanel = memo(function FatiguePanel({
  period,
  playlist,
  matchType,
  scope,
  playerId,
  username,
  friendsPresent,
  dateLabel,
}: FatiguePanelProps) {
  const { t } = useTranslation(["analytics", "common"]);
  const [tab, setTab] = useState<"game" | "minutes">("game");
  const [shareOpen, setShareOpen] = useState(false);

  const filters = useMemo(
    () => ({ playlist, matchType, scope, playerId }),
    [playlist, matchType, scope, playerId],
  );
  const { data: curve, isLoading } = useSessionCurve(period, filters);

  const shareContext: ShareContext | null = useMemo(() => {
    if (!curve?.available || !curve.byGameNumber) return null;
    return buildFatigueShareContext(
      {
        totalMatches: curve.totalMatches ?? 0,
        byGameNumber: curve.byGameNumber,
        breakpointGame: curve.breakpointGame,
        breakpointMinute: curve.breakpointMinute,
      },
      friendsPresent,
      username,
      dateLabel,
    );
  }, [curve, friendsPresent, username, dateLabel]);

  if (isLoading) {
    return <Skeleton className="h-96 w-full rounded-lg" />;
  }
  if (!curve?.available || !curve.byGameNumber || curve.byGameNumber.length === 0) {
    return null;
  }

  const points = tab === "game" ? curve.byGameNumber : (curve.byMinute ?? []);
  const breakpoint = tab === "game" ? curve.breakpointGame : curve.breakpointMinute;
  const splitValue =
    tab === "game"
      ? (curve.breakpointGame?.splitAfter ?? null)
      : (curve.breakpointMinute?.splitAfterBucket ?? null);

  const momentum = curve.momentum;
  const momentumCells = momentum
    ? [
        { key: "afterWin", data: momentum.afterWin },
        { key: "afterLoss", data: momentum.afterLoss },
        { key: "firstOfDay", data: momentum.firstOfDay },
        { key: "restOfDay", data: momentum.restOfDay },
      ]
    : [];

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <BatteryWarning size={15} className="text-accent-warning" />
          {t("analytics:fatigue.title")}
        </h4>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border-subtle bg-bg-panel p-0.5">
            {(["game", "minutes"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                  tab === key
                    ? "bg-accent-primary text-white shadow-sm"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {t(`analytics:fatigue.tabs.${key}`)}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={Share2}
            onClick={() => setShareOpen(true)}
            disabled={!shareContext}
            aria-label={t("common:buttons.share")}
          />
        </div>
      </div>

      <p className="mb-3 text-xs text-text-secondary">
        {t("analytics:fatigue.subtitle", {
          matches: curve.totalMatches ?? 0,
          sessions: curve.totalSessions ?? 0,
        })}
      </p>

      <div className="h-64 max-sm:h-52" role="img" aria-label={t("analytics:fatigue.title")}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
            <XAxis
              dataKey="label"
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
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "var(--color-text-primary)" }} />
            <Bar
              yAxisId="right"
              dataKey="played"
              name={t("analytics:fatigue.played")}
              fill="var(--color-accent-purple)"
              fillOpacity={0.55}
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="winRate"
              name="WR %"
              stroke="var(--color-accent-primary)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            {splitValue !== null && splitValue !== undefined && (
              <ReferenceLine
                yAxisId="left"
                x={points.find((p) => (tab === "game" ? p.n : p.bucket) === splitValue)?.label}
                stroke="var(--color-accent-danger)"
                strokeDasharray="4 4"
                label={{
                  value: t("analytics:fatigue.breakpointTag"),
                  fill: "var(--color-accent-danger)",
                  fontSize: 10,
                  position: "top",
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {breakpoint && (
        <div className="mt-3 rounded-lg border border-accent-warning/30 bg-accent-warning/5 px-3 py-2.5 text-xs">
          <span className="font-semibold text-accent-warning">
            {t("analytics:fatigue.breakpointTitle")}
          </span>{" "}
          <span className="text-text-secondary">
            {tab === "game"
              ? t("analytics:fatigue.breakpointGameDetail", {
                  n: curve.breakpointGame?.splitAfter,
                  before: curve.breakpointGame?.beforeWr,
                  after: curve.breakpointGame?.afterWr,
                })
              : t("analytics:fatigue.breakpointMinuteDetail", {
                  minutes: curve.breakpointMinute?.splitAfterMinutes,
                  before: curve.breakpointMinute?.beforeWr,
                  after: curve.breakpointMinute?.afterWr,
                })}
          </span>
        </div>
      )}

      {momentumCells.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {momentumCells.map((cell) => (
            <div
              key={cell.key}
              className="rounded-lg border border-border-subtle bg-bg-panel px-2.5 py-2 text-center"
              title={t("analytics:fatigue.sampleNote", { count: cell.data.played })}
            >
              <p className="text-[10px] text-text-tertiary">
                {t(`analytics:fatigue.momentum.${cell.key}`)}
              </p>
              <p
                className={cn(
                  "font-mono text-base font-bold",
                  cell.data.winRate >= 50 ? "text-accent-success" : "text-accent-danger",
                )}
              >
                {cell.data.winRate}%
              </p>
              <p className="text-[10px] text-text-tertiary">
                {t("analytics:insights.gamesPlayed", { count: cell.data.played })}
              </p>
            </div>
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
