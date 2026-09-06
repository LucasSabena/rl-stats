import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { HeartHandshake, Share2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ShareModal } from "@/components/share/ShareModal";
import { buildMoodShareContext } from "@/lib/shareContext";
import { useCustomBreakdown } from "@/hooks/useAnalytics";
import { moodIcon, moodLabelKey, moodTone, MOODS } from "@/lib/moods";
import type {
  AnalyticsPeriod,
  DataScope,
  MatchTypeFilter,
  PlaylistFilter,
  ShareContext,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface MoodPanelProps {
  period: AnalyticsPeriod;
  playlist: PlaylistFilter;
  matchType: MatchTypeFilter;
  scope: DataScope;
  playerId: string | null;
  username: string;
  friendsPresent: string[];
  dateLabel: string;
}

const MOOD_ORDER = [...MOODS, "unrated"];

/**
 * "How does my mood play?": win rate per self-reported post-match mood.
 * Unrated matches get their own bucket so the coverage gap is visible.
 */
export const MoodPanel = memo(function MoodPanel({
  period,
  playlist,
  matchType,
  scope,
  playerId,
  username,
  friendsPresent,
  dateLabel,
}: MoodPanelProps) {
  const { t } = useTranslation(["analytics", "common", "mood"]);
  const [shareOpen, setShareOpen] = useState(false);

  const filters = useMemo(
    () => ({ playlist, matchType, scope, playerId }),
    [playlist, matchType, scope, playerId],
  );
  const { data, isLoading } = useCustomBreakdown(period, "mood", filters);
  const minSample = data?.minSample ?? 3;

  const buckets = useMemo(() => {
    const list = [...(data?.buckets ?? [])];
    list.sort(
      (a, b) => MOOD_ORDER.indexOf(a.label) - MOOD_ORDER.indexOf(b.label),
    );
    return list;
  }, [data]);

  const shareContext: ShareContext | null = useMemo(() => {
    if (!data?.available || buckets.length === 0) return null;
    const rated = buckets.filter((b) => b.label !== "unrated" && b.played >= minSample);
    const best = rated.length > 0 ? rated.reduce((a, b) => (b.winRate > a.winRate ? b : a)) : null;
    const worst = rated.length > 0 ? rated.reduce((a, b) => (b.winRate < a.winRate ? b : a)) : null;
    const ratedCount = buckets
      .filter((b) => b.label !== "unrated")
      .reduce((acc, b) => acc + b.played, 0);
    const total = buckets.reduce((acc, b) => acc + b.played, 0);
    const labelOf = (b: { label: string }) =>
      b.label === "unrated" ? t("mood:unrated") : t(moodLabelKey(b.label));
    return buildMoodShareContext(
      best ? { ...best, label: labelOf(best) } : null,
      worst ? { ...worst, label: labelOf(worst) } : null,
      ratedCount,
      total,
      friendsPresent,
      username,
      dateLabel,
    );
  }, [data, buckets, minSample, friendsPresent, username, dateLabel, t]);

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }
  if (!data?.available || buckets.length === 0) {
    return null;
  }

  const total = buckets.reduce((acc, b) => acc + b.played, 0);
  const ratedCount = buckets
    .filter((b) => b.label !== "unrated")
    .reduce((acc, b) => acc + b.played, 0);
  const maxPlayed = Math.max(...buckets.map((b) => b.played), 1);

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <HeartHandshake size={15} className="text-accent-secondary" />
          {t("analytics:mood.title")}
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
      <p className="mb-3 text-xs text-text-secondary">
        {t("analytics:mood.subtitle", { rated: ratedCount, total })}
      </p>

      <div className="space-y-2.5">
        {buckets.map((bucket) => {
          const Icon = moodIcon(bucket.label === "unrated" ? null : bucket.label);
          const reliable = bucket.played >= minSample;
          return (
            <div key={bucket.key} className={cn(!reliable && "opacity-60")}>
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <Icon size={15} className={moodTone(bucket.label === "unrated" ? null : bucket.label)} />
                  <span className="font-medium">
                    {bucket.label === "unrated" ? t("mood:unrated") : t(moodLabelKey(bucket.label))}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[10px] text-text-tertiary">
                    {t("analytics:insights.gamesPlayed", { count: bucket.played })}
                  </span>
                  <span
                    className={cn(
                      "font-mono font-bold",
                      reliable
                        ? bucket.winRate >= 50
                          ? "text-accent-success"
                          : "text-accent-danger"
                        : "text-text-tertiary",
                    )}
                  >
                    {bucket.winRate}%
                  </span>
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-bg-panel">
                <div
                  className={cn(
                    "h-full rounded-full",
                    bucket.winRate >= 50 ? "bg-accent-success" : "bg-accent-danger",
                  )}
                  style={{ width: `${Math.max(4, (bucket.played / maxPlayed) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        context={shareContext}
      />
    </Card>
  );
});
