import { useTranslation } from "react-i18next";
import type { AnalyticsPeriod, PlaylistFilter, MatchTypeFilter, DataScope } from "@/lib/types";
import { PeriodTabs } from "./PeriodTabs";
import { ListMusic, Swords, User, Users } from "lucide-react";
import { Select } from "@/components/ui/Select";

interface AnalyticsFiltersProps {
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  playlist: PlaylistFilter;
  onPlaylistChange: (playlist: PlaylistFilter) => void;
  matchType: MatchTypeFilter;
  onMatchTypeChange: (matchType: MatchTypeFilter) => void;
  scope: DataScope;
  onScopeChange: (scope: DataScope) => void;
  isLoading?: boolean;
}

const playlistKeys: { value: PlaylistFilter; key: string }[] = [
  { value: "all", key: "analytics:filters.playlists.all" },
  { value: "duel", key: "analytics:filters.playlists.duel" },
  { value: "doubles", key: "analytics:filters.playlists.doubles" },
  { value: "standard", key: "analytics:filters.playlists.standard" },
  { value: "chaos", key: "analytics:filters.playlists.chaos" },
  { value: "rumble", key: "analytics:filters.playlists.rumble" },
  { value: "dropshot", key: "analytics:filters.playlists.dropshot" },
  { value: "hoops", key: "analytics:filters.playlists.hoops" },
  { value: "snowday", key: "analytics:filters.playlists.snowday" },
  { value: "other", key: "analytics:filters.playlists.other" },
];

const matchTypeKeys: { value: MatchTypeFilter; key: string }[] = [
  { value: "all", key: "analytics:filters.matchTypes.all" },
  { value: "ranked", key: "analytics:filters.matchTypes.ranked" },
  { value: "casual", key: "analytics:filters.matchTypes.casual" },
  { value: "tournament", key: "analytics:filters.matchTypes.tournament" },
  { value: "training", key: "analytics:filters.matchTypes.training" },
  { value: "other", key: "analytics:filters.matchTypes.other" },
];

export function AnalyticsFilters({
  period,
  onPeriodChange,
  playlist,
  onPlaylistChange,
  matchType,
  onMatchTypeChange,
  scope,
  onScopeChange,
  isLoading,
}: AnalyticsFiltersProps) {
  const { t } = useTranslation(["analytics", "common"]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <PeriodTabs active={period} onChange={onPeriodChange} />

      <div className="hidden h-6 w-px bg-border-subtle sm:block" />

      <div className="relative w-full sm:w-auto min-w-[140px]">
        <Select
          value={scope}
          onChange={(val) => onScopeChange(val as DataScope)}
          options={[
            { value: "me", label: t("analytics:filters.scope.me") },
            { value: "team", label: t("analytics:filters.scope.team") }
          ]}
          icon={scope === "me" ? <User size={14} /> : <Users size={14} />}
          disabled={isLoading}
          className="w-full"
        />
      </div>

      <div className="relative w-full sm:w-auto min-w-[160px]">
        <Select
          value={playlist}
          onChange={(val) => onPlaylistChange(val as PlaylistFilter)}
          options={playlistKeys.map(opt => ({ value: opt.value, label: t(opt.key) }))}
          icon={<ListMusic size={14} />}
          disabled={isLoading}
          className="w-full"
        />
      </div>

      <div className="relative w-full sm:w-auto min-w-[150px]">
        <Select
          value={matchType}
          onChange={(val) => onMatchTypeChange(val as MatchTypeFilter)}
          options={matchTypeKeys.map(opt => ({ value: opt.value, label: t(opt.key) }))}
          icon={<Swords size={14} />}
          disabled={isLoading}
          className="w-full"
        />
      </div>
    </div>
  );
}
