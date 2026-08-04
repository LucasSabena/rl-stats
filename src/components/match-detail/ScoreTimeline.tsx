import { memo, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils";
import { Shield, ShieldAlert, Crosshair } from "lucide-react";
import { useFriends } from "@/hooks/useFriends";
import type { RlEvent } from "@/lib/types";

interface ScoreTimelineProps {
  events: RlEvent[];
  team0Name?: string;
  team1Name?: string;
}

export const ScoreTimeline = memo(function ScoreTimeline({
  events,
  team0Name,
  team1Name,
}: ScoreTimelineProps) {
  const { t } = useTranslation(["matchDetail", "players"]);
  const { data: friends } = useFriends();
  const [team0Score, setTeam0Score] = useState(0);
  const [team1Score, setTeam1Score] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const resolvedTeam0Name = team0Name ?? t("matchDetail:teams.blue");
  const resolvedTeam1Name = team1Name ?? t("matchDetail:teams.orange");

  useEffect(() => {
    let t0 = 0;
    let t1 = 0;
    for (const e of events) {
      if (e.type === "GoalScored") {
        const team = (e.data.team as number) ?? 0;
        if (team === 0) t0++;
        else t1++;
      }
    }
    setTeam0Score(t0);
    setTeam1Score(t1);
  }, [events]);

  const displayEvents = events.filter((e) => {
    if (e.type === "GoalScored") return true;
    if (e.type === "StatfeedEvent") {
      const eventType = (e.data as Record<string, unknown>).event_type as string;
      if (eventType === "Goal") return false;
      return true;
    }
    return false;
  });

  if (displayEvents.length === 0) return null;

  const isFriend = (name: string) => friends?.some(f => f.name === name);

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface p-6 shadow-level-1">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold text-text-primary">
          {t("matchDetail:timeline.title")}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary mr-1">{t("matchDetail:timeline.goalsLabel")}</span>
          <span className="text-xs font-mono font-bold text-team-blue tabular-nums">{team0Score}</span>
          <span className="text-xs text-text-tertiary">{resolvedTeam0Name}</span>
          <span className="text-xs text-text-tertiary">—</span>
          <span className="text-xs text-text-tertiary">{resolvedTeam1Name}</span>
          <span className="text-xs font-mono font-bold text-team-orange tabular-nums">{team1Score}</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative ml-4 border-l-2 border-gray-700 pl-8"
      >
        {displayEvents.map((event, idx) => {
          const time = formatDuration(event.timestamp);
          const data = event.data as Record<string, unknown>;
          const team = (data.team as number) ?? 0;

          if (event.type === "GoalScored") {
            const scorerName = (data.scorer_name as string) ?? t("matchDetail:timeline.unknownScorer");
            const assisterName = data.assister_name as string | undefined;
            const teamColor = team === 0 ? "bg-team-blue" : "bg-team-orange";
            const goalsBefore = displayEvents
              .slice(0, idx + 1)
              .filter((e) => e.type === "GoalScored")
              .reduce(
                (acc, e) => {
                  const tm = (e.data.team as number) ?? 0;
                  if (tm === 0) acc[0]++;
                  else acc[1]++;
                  return acc;
                },
                [0, 0]
              );

            const scorerIsFriend = isFriend(scorerName);
            const assisterIsFriend = assisterName ? isFriend(assisterName) : false;

            return (
              <div key={event.id} className="relative mb-5 last:mb-0">
                <div
                  className={cn(
                    "absolute -left-[42px] top-1 mt-0.5 w-3 h-3 rounded-full ring-2 ring-bg-secondary",
                    teamColor
                  )}
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-text-tertiary shrink-0">
                      {time}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {scorerName}
                        </p>
                        {scorerIsFriend && (
                          <span className="shrink-0 rounded-full bg-accent-primary/15 px-1 py-0.5 text-[10px] font-bold text-accent-primary">
                            {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                          </span>
                        )}
                      </div>
                      {assisterName && (
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-text-tertiary truncate">
                            + {assisterName}
                          </p>
                          {assisterIsFriend && (
                            <span className="shrink-0 rounded-full bg-accent-primary/15 px-1 py-0.5 text-[10px] font-bold text-accent-primary">
                              {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="font-mono text-sm font-bold text-text-primary tabular-nums shrink-0">
                    {goalsBefore[0]} – {goalsBefore[1]}
                  </span>
                </div>
              </div>
            );
          }

          const label = getStatfeedLabel(data, (key) => t(`matchDetail:${key}`));
          const iconColorClass = getStatfeedColor(data);
          const playerName = (data.player_name as string) ?? t("matchDetail:timeline.unknownPlayer");
          const Icon = getStatfeedIcon(data);
          const playerIsFriend = isFriend(playerName);

          if (!label) return null;

          return (
            <div key={event.id} className="relative mb-3 last:mb-0">
              <div
                className={cn(
                  "absolute -left-[41px] top-2 w-2 h-2 rounded-full ring-2 ring-bg-secondary",
                  team === 0 ? "bg-team-blue/70" : "bg-team-orange/70"
                )}
              />
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono text-text-tertiary w-10 shrink-0">
                  {time}
                </span>
                <Icon size={11} className={cn("shrink-0", iconColorClass)} />
                <span className={cn("text-xs truncate min-w-0", playerIsFriend ? "text-accent-primary font-medium" : "text-text-secondary")}>
                  {playerName}
                </span>
                {playerIsFriend && (
                  <span className="shrink-0 rounded-full bg-accent-primary/15 px-1 py-0.5 text-[10px] font-bold text-accent-primary">
                    {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                  </span>
                )}
                <span
                  className={cn(
                    "text-xs font-medium ml-auto shrink-0",
                    iconColorClass
                  )}
                >
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

function getStatfeedLabel(data: Record<string, unknown>, t: (key: string) => string): string | null {
  const eventType = data.event_type as string | undefined;
  if (!eventType) return null;
  switch (eventType) {
    case "Save":
      return t("timeline.save");
    case "EpicSave":
      return t("timeline.epicSave");
    case "Shot":
      return t("timeline.shot");
    case "Assist":
      return t("timeline.assist");
    case "Demolish":
      return t("timeline.demolish");
    default:
      return eventType;
  }
}

function getStatfeedColor(data: Record<string, unknown>): string {
  const eventType = data.event_type as string | undefined;
  switch (eventType) {
    case "Save":
      return "text-blue-400";
    case "EpicSave":
      return "text-purple-400";
    case "Shot":
      return "text-yellow-400";
    case "Assist":
      return "text-green-400";
    case "Demolish":
      return "text-red-400";
    default:
      return "text-gray-400";
  }
}

function getStatfeedIcon(data: Record<string, unknown>) {
  const eventType = data.event_type as string | undefined;
  switch (eventType) {
    case "EpicSave":
      return ShieldAlert;
    case "Shot":
      return Crosshair;
    case "Save":
    default:
      return Shield;
  }
}