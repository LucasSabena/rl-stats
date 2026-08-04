import { useTranslation } from "react-i18next";
import type { PlaylistStats } from "@/lib/types";
import { RankBadge } from "./RankBadge";
import { cn } from "@/lib/utils";

interface PlaylistCardProps {
  name: string;
  stats: PlaylistStats | null;
  className?: string;
}

const PLAYLIST_KEYS: Record<string, string> = {
  duel: "playlist.duel",
  double: "playlist.double",
  standard: "playlist.standard",
  dropshot: "playlist.dropshot",
  hoops: "playlist.hoops",
  rumble: "playlist.rumble",
  snowday: "playlist.snowday",
  unranked: "playlist.unranked",
};

export function PlaylistCard({ name, stats, className }: PlaylistCardProps) {
  const { t } = useTranslation("tracker");
  const label = t(PLAYLIST_KEYS[name] || name, name);

  if (!stats || (!stats.rank && stats.mmr == null)) {
    return (
      <div className={cn("rounded-xl border border-border-subtle bg-bg-surface p-3", className)}>
        <p className="mb-1 text-[11px] font-semibold text-text-tertiary">{label}</p>
        <span className="text-sm text-text-tertiary italic">{t("ranks.noData")}</span>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border-subtle bg-bg-surface p-3 transition-all duration-200 hover:border-border-default", className)}>
      <p className="mb-2 text-[11px] font-semibold text-text-tertiary">{label}</p>

      <RankBadge rank={stats.rank} mmr={stats.mmr} size="sm" />

      <div className="mt-2 flex gap-3 text-xs text-text-tertiary">
        {stats.matchesPlayed != null && (
          <span>{t("playlist.matchesShort", { count: stats.matchesPlayed })}</span>
        )}
        {stats.winStreak != null && stats.winStreak > 0 && (
          <span className="text-accent-success font-medium">W{stats.winStreak}</span>
        )}
        {stats.loseStreak != null && stats.loseStreak > 0 && (
          <span className="text-accent-danger font-medium">L{stats.loseStreak}</span>
        )}
      </div>
    </div>
  );
}
