import { FatiguePanel } from "@/components/analytics/FatiguePanel";
import { ChemistryPanel } from "@/components/analytics/ChemistryPanel";
import { MoodPanel } from "@/components/analytics/MoodPanel";
import { CustomBuilderPanel } from "@/components/analytics/CustomBuilderPanel";
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
      <FatiguePanel {...shared} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ChemistryPanel {...shared} />
        <MoodPanel {...shared} />
      </div>
      <CustomBuilderPanel {...shared} />
    </>
  );
}
