import { useTranslation } from "react-i18next";
import { useTrackerProfile } from "@/hooks/useTrackerProfile";
import { RankBadge } from "./RankBadge";
import { TrendingUp } from "lucide-react";

export function RankWidget() {
  const { t } = useTranslation("tracker");
  const { data: profile, isLoading } = useTrackerProfile();

  if (isLoading || !profile) return null;

  const ranked = profile.stats.ranked;

  return (
    <div className="flex items-center gap-3 px-1 py-0.5">
      <div className="flex shrink-0 items-center gap-1">
        <TrendingUp size={10} className="text-accent-primary" />
        <span className="text-[10px] font-semibold text-text-tertiary">
          {t("ranks.title")}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ranked.standard && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-text-tertiary">{t("playlist.standard")}</span>
            <RankBadge rank={ranked.standard.rank} mmr={ranked.standard.mmr} size="sm" />
          </div>
        )}
        {ranked.double && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-text-tertiary">{t("playlist.double")}</span>
            <RankBadge rank={ranked.double.rank} mmr={ranked.double.mmr} size="sm" />
          </div>
        )}
        {ranked.duel && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-text-tertiary">{t("playlist.duel")}</span>
            <RankBadge rank={ranked.duel.rank} mmr={ranked.duel.mmr} size="sm" />
          </div>
        )}
      </div>
    </div>
  );
}
