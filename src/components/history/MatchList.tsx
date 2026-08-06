import { useTranslation } from "react-i18next";
import { formatLocalDateKey } from "@/lib/utils";
import type { MatchSummary } from "@/lib/types";
import { MatchCard } from "./MatchCard";

interface MatchListProps {
  matches: MatchSummary[];
  onSelectMatch?: (matchId: number) => void;
  onEditMatch?: (match: MatchSummary) => void;
  onDeleteMatch?: (matchId: number) => void;
}

interface DayGroup {
  key: string;
  label: string;
  wins: number;
  losses: number;
  matches: MatchSummary[];
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function MatchList({ matches, onSelectMatch, onEditMatch, onDeleteMatch }: MatchListProps) {
  const { t, i18n } = useTranslation("history");

  if (matches.length === 0) return null;

  const todayKey = formatLocalDateKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = formatLocalDateKey(yesterday);

  const groups: DayGroup[] = [];
  for (const match of matches) {
    const date = new Date(match.startTime * 1000);
    const key = formatLocalDateKey(date);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const label =
        key === todayKey
          ? t("day.today")
          : key === yesterdayKey
            ? t("day.yesterday")
            : capitalize(
                date.toLocaleDateString(i18n.language, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }),
              );
      group = { key, label, wins: 0, losses: 0, matches: [] };
      groups.push(group);
    }
    if (match.winnerTeamNum !== null && match.localTeamNum !== null && match.localTeamNum !== undefined) {
      if (match.winnerTeamNum === match.localTeamNum) group.wins += 1;
      else group.losses += 1;
    }
    group.matches.push(match);
  }

  return (
    <div className="space-y-7">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <header className="flex items-baseline justify-between border-b border-border-subtle pb-2">
            <h3 className="micro-label">{group.label}</h3>
            <span className="tabular text-[11px] text-text-tertiary">
              {t("day.record", { wins: group.wins, losses: group.losses })}
            </span>
          </header>
          <div className="stagger-in divide-y divide-border-subtle/60">
            {group.matches.map((match, index) => (
              <MatchCard
                key={match.id}
                match={match}
                staggerIndex={index}
                onClick={onSelectMatch ? () => onSelectMatch(match.id) : undefined}
                onEdit={onEditMatch}
                onDelete={onDeleteMatch}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
