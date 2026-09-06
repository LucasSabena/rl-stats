import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, Share2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ShareModal } from "@/components/share/ShareModal";
import { buildChemistryShareContext } from "@/lib/shareContext";
import { useTeammateStats } from "@/hooks/useAnalytics";
import type {
  AnalyticsPeriod,
  DataScope,
  MatchTypeFilter,
  PlaylistFilter,
  ShareContext,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChemistryPanelProps {
  period: AnalyticsPeriod;
  playlist: PlaylistFilter;
  matchType: MatchTypeFilter;
  scope: DataScope;
  playerId: string | null;
  username: string;
  friendsPresent: string[];
  dateLabel: string;
}

export const ChemistryPanel = memo(function ChemistryPanel({
  period,
  playlist,
  matchType,
  scope,
  playerId,
  username,
  friendsPresent,
  dateLabel,
}: ChemistryPanelProps) {
  const { t } = useTranslation(["analytics", "common"]);
  const [shareOpen, setShareOpen] = useState(false);

  const filters = useMemo(
    () => ({ playlist, matchType, scope, playerId }),
    [playlist, matchType, scope, playerId],
  );
  const { data, isLoading } = useTeammateStats(period, filters);
  const minSample = data?.minSample ?? 3;

  const teammates = useMemo(() => (data?.teammates ?? []).slice(0, 8), [data]);

  const shareContext: ShareContext | null = useMemo(() => {
    if (!data?.available || teammates.length === 0) return null;
    const eligible = teammates.filter((m) => m.played >= minSample);
    const best = eligible.length > 0 ? eligible.reduce((a, b) => (b.winRate > a.winRate ? b : a)) : teammates[0];
    return buildChemistryShareContext(best, data.teammates?.length ?? 0, friendsPresent, username, dateLabel);
  }, [data, teammates, minSample, friendsPresent, username, dateLabel]);

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }
  if (!data?.available || teammates.length === 0) {
    return null;
  }

  const maxPlayed = Math.max(...teammates.map((m) => m.played), 1);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Users size={15} className="text-accent-primary" />
          {t("analytics:chemistry.title")}
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

      <div className="space-y-2">
        {teammates.map((mate) => (
          <div key={mate.primaryId}>
            <div className="mb-0.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-text-secondary">
                <span className="max-w-[140px] truncate font-medium">{mate.name}</span>
                {mate.isFriend && (
                  <span className="rounded bg-accent-primary/15 px-1 py-px text-[9px] font-semibold text-accent-primary">
                    {t("analytics:chemistry.friendTag")}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[10px] text-text-tertiary">
                  {t("analytics:insights.gamesPlayed", { count: mate.played })}
                </span>
                <span
                  className={cn(
                    "font-mono font-bold",
                    mate.played >= minSample
                      ? mate.winRate >= 50
                        ? "text-accent-success"
                        : "text-accent-danger"
                      : "text-text-tertiary",
                  )}
                >
                  {mate.winRate}%
                </span>
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-bg-panel">
              <div
                className={cn(
                  "h-full rounded-full",
                  mate.winRate >= 50 ? "bg-accent-success" : "bg-accent-danger",
                )}
                style={{ width: `${Math.max(4, (mate.played / maxPlayed) * 100)}%`, opacity: mate.played >= minSample ? 1 : 0.4 }}
              />
            </div>
          </div>
        ))}
      </div>

      {(data.byTeamSize ?? []).length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border-subtle pt-3">
          {(data.byTeamSize ?? []).map((row) => (
            <span
              key={row.teamSize}
              className="rounded-lg border border-border-subtle bg-bg-panel px-2.5 py-1.5 text-center text-[10px]"
              title={t("analytics:insights.gamesPlayed", { count: row.played })}
            >
              <span className="block text-text-tertiary">
                {row.teamSize === 1
                  ? t("analytics:chemistry.soloq")
                  : t("analytics:chemistry.teamSize", { count: row.teamSize })}
              </span>
              <span
                className={cn(
                  "font-mono text-sm font-bold",
                  row.winRate >= 50 ? "text-accent-success" : "text-accent-danger",
                )}
              >
                {row.winRate}%
              </span>
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
