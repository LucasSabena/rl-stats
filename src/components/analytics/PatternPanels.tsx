import { FatiguePanel } from "@/components/analytics/FatiguePanel";
import { ChemistryPanel } from "@/components/analytics/ChemistryPanel";
import { MoodPanel } from "@/components/analytics/MoodPanel";
import { CustomBuilderPanel } from "@/components/analytics/CustomBuilderPanel";
import { LazyMount } from "@/components/ui/LazyMount";
import type { AnalyticsPeriod, PlaylistFilter, MatchTypeFilter, DataScope } from "@/lib/types";

interface PatternPanelsProps {
  period: AnalyticsPeriod;
  playlist: PlaylistFilter;
  matchType: MatchTypeFilter;
  scope: DataScope;
  playerId: string | null;
  username: string;
  friendsPresent: string[];
  dateLabel: string;
}

export function PatternPanels(props: PatternPanelsProps) {
  const { period, playlist, matchType, scope, playerId, username, friendsPresent, dateLabel } = props;
  const shared = { period, playlist, matchType, scope, playerId, username, friendsPresent, dateLabel };
  return (
    <>
      {/* Each panel runs its own aggregate query; off-screen ones mount when
          they approach the viewport so the initial load does not fire them
          all at once (visible on small windows/mobile). */}
      <LazyMount minHeight={320}>
        <FatiguePanel {...shared} />
      </LazyMount>
      <div className="grid gap-6 lg:grid-cols-2">
        <LazyMount minHeight={280}>
          <ChemistryPanel {...shared} />
        </LazyMount>
        <LazyMount minHeight={280}>
          <MoodPanel {...shared} />
        </LazyMount>
      </div>
      <LazyMount minHeight={320}>
        <CustomBuilderPanel {...shared} />
      </LazyMount>
    </>
  );
}
