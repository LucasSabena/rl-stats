import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Crosshair, Shield, ShieldAlert, Swords, Zap } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { useFriends } from "@/hooks/useFriends";
import { PlayerLink } from "@/components/ui/PlayerLink";
import type { RlEvent } from "@/lib/types";

interface ScoreTimelineProps {
  events: RlEvent[];
  team0Name?: string;
  team1Name?: string;
}

type Kind = "goal" | "assist" | "save" | "epicSave" | "shot" | "demo";

const KIND_META: Record<
  Exclude<Kind, "goal">,
  { icon: typeof Shield; labelKey: string; tone: string }
> = {
  assist: { icon: Zap, labelKey: "matchDetail:timeline.assist", tone: "text-accent-purple" },
  save: { icon: Shield, labelKey: "matchDetail:timeline.save", tone: "text-accent-info" },
  epicSave: {
    icon: ShieldAlert,
    labelKey: "matchDetail:timeline.epicSave",
    tone: "text-accent-success",
  },
  shot: { icon: Crosshair, labelKey: "matchDetail:timeline.shot", tone: "text-text-tertiary" },
  demo: { icon: Swords, labelKey: "matchDetail:timeline.demolish", tone: "text-accent-danger" },
};

function classify(event: RlEvent): Kind | null {
  if (event.type === "GoalScored") return "goal";
  if (event.type !== "StatfeedEvent") return null;

  const raw = String(
    (event.data as Record<string, unknown>).event_type ?? "",
  ).toLowerCase();

  if (raw === "goal") return null; // already covered by GoalScored
  if (raw.includes("epic")) return "epicSave";
  if (raw.includes("save")) return "save";
  if (raw.includes("assist")) return "assist";
  if (raw.includes("demol")) return "demo";
  if (raw.includes("shot")) return "shot";
  return null;
}

/**
 * Chronological match timeline.
 *
 * Goals are the spine of the story, so they carry the running score and full
 * visual weight; supporting plays (saves, demos, assists, shots) render as
 * quiet rows that add texture without competing. Previously every event was
 * drawn identically, which made a shot look as important as a goal.
 */
export const ScoreTimeline = memo(function ScoreTimeline({
  events,
  team0Name,
  team1Name,
}: ScoreTimelineProps) {
  const { t } = useTranslation(["matchDetail", "players"]);
  const { data: friends } = useFriends();
  const [goalsOnly, setGoalsOnly] = useState(false);

  const resolvedTeam0Name = team0Name ?? t("matchDetail:teams.blue");
  const resolvedTeam1Name = team1Name ?? t("matchDetail:teams.orange");

  // Walk once, attaching the running score to each goal.
  const rows = useMemo(() => {
    let blue = 0;
    let orange = 0;

    return events.flatMap((event) => {
      const kind = classify(event);
      if (!kind) return [];

      const data = event.data as Record<string, unknown>;
      const team = (data.team as number) ?? 0;

      if (kind === "goal") {
        if (team === 0) blue += 1;
        else orange += 1;
      }

      return [{ event, kind, team, blue, orange }];
    });
  }, [events]);

  const goalCount = rows.filter((r) => r.kind === "goal").length;
  const supportingCount = rows.length - goalCount;
  const finalScore = rows.length
    ? { blue: rows[rows.length - 1].blue, orange: rows[rows.length - 1].orange }
    : { blue: 0, orange: 0 };

  const visible = goalsOnly ? rows.filter((r) => r.kind === "goal") : rows;

  if (rows.length === 0) return null;

  const isFriend = (name?: string) =>
    Boolean(name) && Boolean(friends?.some((f) => f.name === name));

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-text-primary">
          {t("matchDetail:timeline.title")}
        </h3>

        <div className="flex items-center gap-3">
          <span className="flex items-baseline gap-1.5 text-sm">
            <span className="numeral text-team-blue">{finalScore.blue}</span>
            <span className="text-xs text-text-tertiary">{resolvedTeam0Name}</span>
            <span className="text-text-tertiary">·</span>
            <span className="numeral text-team-orange">{finalScore.orange}</span>
            <span className="text-xs text-text-tertiary">{resolvedTeam1Name}</span>
          </span>

          {supportingCount > 0 && (
            <button
              type="button"
              onClick={() => setGoalsOnly((v) => !v)}
              className="rounded border border-border-default px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-border-highlight hover:text-text-primary"
            >
              {goalsOnly
                ? t("matchDetail:timeline.showAll", { defaultValue: "Ver todo" })
                : t("matchDetail:timeline.goalsOnly", { defaultValue: "Solo goles" })}
            </button>
          )}
        </div>
      </div>

      <ol className="relative ml-1 border-l border-border-default pl-5">
        {visible.map(({ event, kind, team, blue, orange }) => {
          const data = event.data as Record<string, unknown>;
          const time = formatDuration(event.timestamp);
          const isBlue = team === 0;

          if (kind === "goal") {
            const scorer =
              (data.scorer_name as string) ?? t("matchDetail:timeline.unknownScorer");
            const scorerId = data.scorer_id as string | undefined;
            const assister = data.assister_name as string | undefined;
            const assisterId = data.assister_id as string | undefined;

            return (
              <li key={event.id} className="relative mb-3 last:mb-0">
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -left-[27px] top-2 h-2.5 w-2.5 rounded-full ring-4 ring-bg-surface",
                    isBlue ? "bg-team-blue" : "bg-team-orange",
                  )}
                />
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                    isBlue
                      ? "border-team-blue/25 bg-team-blue-bg"
                      : "border-team-orange/25 bg-team-orange-bg",
                  )}
                >
                  <div className="flex min-w-0 items-baseline gap-2.5">
                    <span className="tabular shrink-0 text-[11px] text-text-tertiary">
                      {time}
                    </span>
                    <div className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <PlayerLink
                          player={scorerId}
                          name={scorer}
                          className="text-[13px] font-medium text-text-primary"
                        />
                        {isFriend(scorer) && (
                          <span className="shrink-0 text-[10px] text-accent-primary">
                            {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                          </span>
                        )}
                      </span>
                      {assister && (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-text-secondary">
                          <Zap size={10} aria-hidden="true" className="text-accent-purple" />
                          <PlayerLink player={assisterId} name={assister} />
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="numeral shrink-0 text-sm text-text-primary">
                    {blue}–{orange}
                  </span>
                </div>
              </li>
            );
          }

          const meta = KIND_META[kind];
          const Icon = meta.icon;
          const player =
            (data.player_name as string) ??
            (data.main_target_name as string) ??
            t("matchDetail:timeline.unknownPlayer");
          const playerId =
            (data.player_id as string) ?? (data.main_target_id as string);

          return (
            <li key={event.id} className="relative mb-2 last:mb-0">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -left-[23px] top-1.5 h-1.5 w-1.5 rounded-full ring-4 ring-bg-surface",
                  isBlue ? "bg-team-blue/50" : "bg-team-orange/50",
                )}
              />
              <div className="flex items-center gap-2.5 px-1 text-[12px]">
                <span className="tabular shrink-0 text-[11px] text-text-tertiary">
                  {time}
                </span>
                <Icon size={12} aria-hidden="true" className={cn("shrink-0", meta.tone)} />
                <PlayerLink
                  player={playerId}
                  name={player}
                  className="text-text-secondary"
                />
                <span className="truncate text-text-tertiary">{t(meta.labelKey)}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
});
