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

  if (raw === "goal") return null;
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
 * Goals are the spine of the story: full visual weight with the running
 * score. Supporting plays render as quiet rows that add texture without
 * competing.
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
    <section className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-2.5">
        <h3 className="micro-label">{t("matchDetail:timeline.title")}</h3>

        <div className="flex items-center gap-3">
          <span className="flex items-baseline gap-1.5 text-sm">
            <span className="numeral text-team-blue">{finalScore.blue}</span>
            <span className="text-[11px] text-text-tertiary">{resolvedTeam0Name}</span>
            <span aria-hidden="true" className="text-text-muted">·</span>
            <span className="numeral text-team-orange">{finalScore.orange}</span>
            <span className="text-[11px] text-text-tertiary">{resolvedTeam1Name}</span>
          </span>

          {supportingCount > 0 && (
            <button
              type="button"
              onClick={() => setGoalsOnly((v) => !v)}
              className="rounded border border-border-subtle px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-border-highlight hover:text-text-primary"
            >
              {goalsOnly
                ? t("matchDetail:timeline.showAll", { defaultValue: "Ver todo" })
                : t("matchDetail:timeline.goalsOnly", { defaultValue: "Solo goles" })}
            </button>
          )}
        </div>
      </header>

      <ol className="stagger-in divide-y divide-border-subtle/50">
        {visible.map(({ event, kind, team, blue, orange }, index) => {
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
              <li
                key={event.id}
                style={{ "--stagger-i": Math.min(index, 14) } as React.CSSProperties}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span className="tabular w-10 shrink-0 text-[11px] text-text-tertiary">
                  {time}
                </span>
                <span
                  aria-hidden="true"
                  className={cn("h-2 w-2 shrink-0 rounded-full", isBlue ? "bg-team-blue" : "bg-team-orange")}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                    <PlayerLink player={scorerId} name={scorer} className="truncate" />
                    {isFriend(scorer) && (
                      <span className="shrink-0 text-[10px] text-accent-primary">
                        {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                      </span>
                    )}
                  </p>
                  {assister && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-text-secondary">
                      <Zap size={10} aria-hidden="true" className="text-accent-purple" />
                      <PlayerLink player={assisterId} name={assister} />
                    </p>
                  )}
                </div>
                <span className="numeral shrink-0 text-sm text-text-primary">
                  {blue}–{orange}
                </span>
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
            <li
              key={event.id}
              style={{ "--stagger-i": Math.min(index, 14) } as React.CSSProperties}
              className="flex items-center gap-3 px-4 py-1.5 text-[12px]"
            >
              <span className="tabular w-10 shrink-0 text-[11px] text-text-tertiary">
                {time}
              </span>
              <span
                aria-hidden="true"
                className={cn("h-1 w-1 shrink-0 rounded-full", isBlue ? "bg-team-blue/50" : "bg-team-orange/50")}
              />
              <Icon size={12} aria-hidden="true" className={cn("shrink-0", meta.tone)} />
              <PlayerLink player={playerId} name={player} className="truncate text-text-secondary" />
              <span className="truncate text-text-tertiary">{t(meta.labelKey)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
});
