import { memo } from "react";
import { useLiveStore } from "@/stores/liveStore";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils";
import type { RlEvent, RlEventType } from "@/lib/types";
import { Goal, Swords, CircleDot, Timer, Pause, Play, RotateCcw, FastForward, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

const eventIcons: Record<RlEventType, typeof Goal> = {
  UpdateState: CircleDot,
  BallHit: CircleDot,
  GoalScored: Goal,
  StatfeedEvent: Swords,
  MatchCreated: CircleDot,
  MatchEnded: CircleDot,
  GoalReplayStart: RotateCcw,
  GoalReplayEnd: FastForward,
  PlayerJoined: CircleDot,
  PlayerLeft: CircleDot,
  CountdownBegin: Timer,
  MatchPaused: Pause,
  MatchUnpaused: Play,
  ClockUpdatedSeconds: Clock,
  RoundStarted: Play,
};

const eventTranslationKeys: Record<RlEventType, string> = {
  UpdateState: "live:events.UpdateState",
  BallHit: "live:events.BallHit",
  GoalScored: "live:events.GoalScored",
  StatfeedEvent: "live:events.StatfeedEvent",
  MatchCreated: "live:events.MatchCreated",
  MatchEnded: "live:events.MatchEnded",
  GoalReplayStart: "live:events.GoalReplayStart",
  GoalReplayEnd: "live:events.GoalReplayEnd",
  PlayerJoined: "live:events.PlayerJoined",
  PlayerLeft: "live:events.PlayerLeft",
  CountdownBegin: "live:events.CountdownBegin",
  MatchPaused: "live:events.MatchPaused",
  MatchUnpaused: "live:events.MatchUnpaused",
  ClockUpdatedSeconds: "live:events.ClockUpdatedSeconds",
  RoundStarted: "live:events.RoundStarted",
};

const eventColors: Record<RlEventType, string> = {
  UpdateState: "text-text-tertiary",
  BallHit: "text-text-tertiary",
  GoalScored: "text-accent-secondary",
  StatfeedEvent: "text-accent-purple",
  MatchCreated: "text-accent-info",
  MatchEnded: "text-accent-warning",
  GoalReplayStart: "text-text-tertiary",
  GoalReplayEnd: "text-text-tertiary",
  PlayerJoined: "text-text-tertiary",
  PlayerLeft: "text-text-tertiary",
  CountdownBegin: "text-accent-info",
  MatchPaused: "text-accent-warning",
  MatchUnpaused: "text-accent-success",
  ClockUpdatedSeconds: "text-text-tertiary",
  RoundStarted: "text-accent-info",
};

export const EventFeed = memo(function EventFeed() {
  const events = useLiveStore((state) => state.events);
  const { t } = useTranslation(["live", "common"]);

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface/60">
      <div className="flex items-center justify-between border-b border-border-subtle/50 px-2.5 py-1">
        <h3 className="font-display text-[10px] font-semibold text-text-secondary">{t("live:events.title")}</h3>
        {events.length > 0 && (
          <span className="font-mono text-[10px] text-text-muted">{events.length}</span>
        )}
      </div>
      <div className="h-24 overflow-y-auto p-1">
        {events.length === 0 ? (
          <p className="py-4 text-center text-[10px] text-text-tertiary">{t("live:events.empty")}</p>
        ) : (
          <div className="space-y-px">
            {events.slice(0, 50).map((event) => (
              <EventItem key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

function EventItem({ event }: { event: RlEvent }) {
  const { t } = useTranslation(["live", "common"]);
  const Icon = eventIcons[event.type] ?? CircleDot;
  return (
    <div className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-surface-hover/50">
      <Icon size={11} className={cn("shrink-0", eventColors[event.type] ?? "text-text-tertiary")} />
      <span className="truncate text-text-secondary">{t(eventTranslationKeys[event.type] ?? `live:events.${event.type}`) ?? event.type}</span>
      <span className="ml-auto shrink-0 font-mono text-[10px] text-text-muted">{formatDateTime(event.timestamp * 1000)}</span>
    </div>
  );
}
