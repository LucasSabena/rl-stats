import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { ContextMenu } from "@/components/ui/ContextMenu";
import type { MatchSummary } from "@/lib/types";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { getArenaDisplayName, getArenaImagePath } from "@/lib/arenaMap";
import { ArenaThumb } from "@/components/ui/ArenaDisplay";

interface MatchCardProps {
  match: MatchSummary;
  onClick?: () => void;
  onEdit?: (match: MatchSummary) => void;
  onDelete?: (matchId: number) => void;
}

export const MatchCard = memo(function MatchCard({ match, onClick, onEdit, onDelete }: MatchCardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation(["history", "common"]);

  const matchTypeLabel: Record<string, string> = {
    ranked: t("history:matchTypes.ranked"),
    casual: t("history:matchTypes.casual"),
    tournament: t("history:matchTypes.tournament"),
    other: t("history:matchTypes.other"),
  };

  const playlistLabelMap: Record<string, string> = {
    Duel: t("history:playlists.duel"),
    Doubles: t("history:playlists.doubles"),
    Standard: t("history:playlists.standard"),
    Chaos: t("history:playlists.chaos"),
    Other: t("history:playlists.other"),
  };

  const blueWon = match.winnerTeamNum === 0;
  const orangeWon = match.winnerTeamNum === 1;
  const hasLocalTeam = match.localTeamNum !== null && match.localTeamNum !== undefined;
  const isWin = hasLocalTeam && match.winnerTeamNum === match.localTeamNum;
  const isLoss = hasLocalTeam && match.winnerTeamNum !== null && match.winnerTeamNum !== match.localTeamNum;

  const resultLabel = isWin
    ? t("history:results.win")
    : isLoss
    ? t("history:results.loss")
    : match.winnerTeamNum === 0
    ? t("history:results.blueWon")
    : match.winnerTeamNum === 1
    ? t("history:results.orangeWon")
    : t("history:results.draw");

  const resultVariant = isWin ? "win" : isLoss ? "loss" : "default";

  const arenaName = match.arena ? getArenaDisplayName(match.arena) : null;
  const arenaImage = match.arena ? getArenaImagePath(match.arena) : null;

  function handleClick() {
    if (onClick) onClick();
    else navigate(`/history/${match.id}`);
  }

  return (
    <ContextMenu
      items={[
        {
          label: t("history:contextMenu.viewDetail"),
          icon: Eye,
          onClick: () => navigate(`/history/${match.id}`),
        },
        {
          label: t("history:contextMenu.editMatch"),
          icon: Pencil,
          onClick: () => onEdit?.(match),
        },
        {
          label: t("history:contextMenu.deleteMatch"),
          icon: Trash2,
          variant: "danger",
          onClick: () => onDelete?.(match.id),
        },
      ]}
    >
      <div
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        role="button"
        tabIndex={0}
        className={cn(
          "group relative cursor-pointer overflow-hidden rounded-lg border border-border-subtle",
          "transition-colors duration-150 hover:border-border-highlight",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        )}
      >
        {/* Arena reveal on hover. Loaded lazily so a long history list does
            not fetch every arena image up front. */}
        {arenaImage && (
          <>
            <img
              src={arenaImage}
              alt=""
              loading="lazy"
              decoding="async"
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
            <div className="pointer-events-none absolute inset-0 bg-bg-surface/88 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </>
        )}

        <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-4 bg-bg-surface/70 p-3.5 group-hover:bg-transparent">
          {/* Left: when, and what kind of match */}
          <div className="flex min-w-0 items-center gap-3">
            <ArenaThumb arena={match.arena} size="md" className="hidden sm:flex" />

            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-text-tertiary">
                {formatDateTime(match.startTime * 1000)}
              </span>

              <div className="flex flex-wrap items-center gap-1.5">
                {match.matchType && (
                  <Badge variant={match.matchType === "ranked" ? "ranked" : "default"}>
                    {matchTypeLabel[match.matchType] ?? match.matchType}
                  </Badge>
                )}
                {match.isOvertime && <Badge variant="overtime">OT</Badge>}
                {match.playlist && (
                  <span className="truncate text-[11px] text-text-secondary">
                    {playlistLabelMap[match.playlist] ?? match.playlist}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Centre: the score is the point of the row */}
          <div className="flex items-baseline gap-2.5 px-2">
            <span
              className={cn(
                "numeral text-[26px] leading-none",
                blueWon ? "text-team-blue" : "text-text-tertiary",
              )}
            >
              {match.teamBlueScore}
            </span>
            <span className="text-sm text-text-tertiary">–</span>
            <span
              className={cn(
                "numeral text-[26px] leading-none",
                orangeWon ? "text-team-orange" : "text-text-tertiary",
              )}
            >
              {match.teamOrangeScore}
            </span>
          </div>

          {/* Right: outcome and context */}
          <div className="flex min-w-0 flex-col items-end gap-1">
            <Badge variant={resultVariant}>{resultLabel}</Badge>
            <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
              {match.durationSeconds ? (
                <span className="tabular">{formatDuration(match.durationSeconds)}</span>
              ) : null}
              {arenaName && (
                <span className="max-w-[10rem] truncate" title={arenaName}>
                  {arenaName}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </ContextMenu>
  );
});