import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Globe, Monitor, Swords } from "lucide-react";
import { getArenaDisplayName, getArenaImagePath } from "@/lib/arenaMap";
import type { MatchDetail, MatchType } from "@/lib/types";

interface MatchHeaderProps {
  match: MatchDetail;
}

export const MatchHeader = memo(function MatchHeader({ match }: MatchHeaderProps) {
  const { t } = useTranslation("matchDetail");

  const MATCH_TYPE_LABELS: Record<MatchType, string> = {
    ranked: t("matchType.ranked"),
    casual: t("matchType.casual"),
    tournament: t("matchType.tournament"),
    training: t("matchType.training"),
    other: t("matchType.other"),
  };

  const MATCH_TYPE_VARIANTS: Record<MatchType, "ranked" | "default"> = {
    ranked: "ranked",
    casual: "default",
    tournament: "default",
    training: "default",
    other: "default",
  };

  const isDraw = match.winnerTeamNum === null;
  const blueWon = match.winnerTeamNum === 0;
  const orangeWon = match.winnerTeamNum === 1;

  const arenaName = match.arena ? getArenaDisplayName(match.arena) : null;
  const arenaImage = match.arena ? getArenaImagePath(match.arena) : null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border-subtle shadow-level-2">
      {/* Arena background image */}
      {arenaImage && (
        <img
          src={arenaImage}
          alt={arenaName ?? ""}
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}

      {/* Dark overlay for readability */}
      <div
        className={cn(
          "absolute inset-0",
          arenaImage
            ? "bg-gradient-to-b from-bg-surface/85 via-bg-surface/70 to-bg-surface/90 backdrop-blur-[2px]"
            : "bg-bg-surface"
        )}
      />

      {/* Team color gradient overlay (subtle) */}
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-team-blue-bg)] via-transparent to-[var(--color-team-orange-bg)] opacity-20" />

      <div className="relative p-6">
        {/* Top row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {match.matchType && (
              <Badge variant={MATCH_TYPE_VARIANTS[match.matchType]}>
                {MATCH_TYPE_LABELS[match.matchType]}
              </Badge>
            )}
            {match.playlist && (
              <span className="text-xs text-text-secondary">{match.playlist}</span>
            )}
            <Badge
              className={cn(
                match.isOnline
                  ? "bg-accent-success-subtle text-accent-success border border-accent-success/20"
                  : "bg-bg-panel text-text-muted border border-border-subtle"
              )}
            >
              {match.isOnline ? (
                <Globe size={12} className="mr-1" />
              ) : (
                <Monitor size={12} className="mr-1" />
              )}
              {match.isOnline ? t("mode.online") : t("mode.local")}
            </Badge>
          </div>

          {arenaName && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
              <img
                src={arenaImage ?? ""}
                alt={arenaName}
                className="h-6 w-6 rounded object-cover border border-border-subtle bg-bg-panel"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <Swords size={14} className="text-text-tertiary" />
              {arenaName}
            </span>
          )}
        </div>

        {/* Score */}
        <div className="mt-8 flex items-center justify-center gap-8 sm:gap-12">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "h-6 w-6 rounded-lg",
                blueWon
                  ? "bg-team-blue shadow-[0_0_12px_var(--color-team-blue-glow)]"
                  : "bg-team-blue/60"
              )}
            />
            <span className="mt-2 text-xs font-bold text-team-blue">
              {t("teams.blue")}
            </span>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            <span
              className={cn(
                "font-mono text-7xl font-extrabold tracking-tight transition-all sm:text-8xl",
                blueWon
                  ? "text-team-blue drop-shadow-[0_0_20px_var(--color-team-blue-glow)]"
                  : isDraw
                  ? "text-text-primary"
                  : "text-text-tertiary"
              )}
            >
              {match.teamBlueScore}
            </span>
            <span className="text-4xl font-bold text-text-muted">:</span>
            <span
              className={cn(
                "font-mono text-7xl font-extrabold tracking-tight transition-all sm:text-8xl",
                orangeWon
                  ? "text-team-orange drop-shadow-[0_0_20px_var(--color-team-orange-glow)]"
                  : isDraw
                  ? "text-text-primary"
                  : "text-text-tertiary"
              )}
            >
              {match.teamOrangeScore}
            </span>
          </div>

          <div className="flex flex-col items-center">
            <div
              className={cn(
                "h-6 w-6 rounded-lg",
                orangeWon
                  ? "bg-team-orange shadow-[0_0_12px_var(--color-team-orange-glow)]"
                  : "bg-team-orange/60"
              )}
            />
            <span className="mt-2 text-xs font-bold text-team-orange">
              {t("teams.orange")}
            </span>
          </div>
        </div>

        {/* Metadata grid */}
        <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <MetaItem label={t("header.duration")} value={match.durationSeconds ? formatDuration(match.durationSeconds) : "---"} />
          <MetaItem label={t("header.start")} value={formatDateTime(match.startTime * 1000)} />
          {match.endTime && <MetaItem label={t("header.end")} value={formatDateTime(match.endTime * 1000)} />}
          <MetaItem label={t("header.overtime")} value={match.isOvertime ? t("overtime.yes") : t("overtime.no")} />
          <MetaItem label={t("header.arena")} value={arenaName ?? "---"} />
        </div>
      </div>
    </div>
  );
});

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-panel/70 backdrop-blur-sm p-3 text-center">
      <p className="text-[10px] font-semibold text-text-tertiary">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}