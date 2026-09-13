import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn, formatDateTime, formatDuration } from "@/lib/utils";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { moodIcon, moodLabelKey, moodTone } from "@/lib/moods";
import type { MatchSummary } from "@/lib/types";
import { Eye, Pencil, Trash2, ChevronRight, Dumbbell ,
  StickyNote,
} from "lucide-react";
import { getArenaDisplayName } from "@/lib/arenaMap";

interface MatchCardProps {
  match: MatchSummary;
  onClick?: () => void;
  onEdit?: (match: MatchSummary) => void;
  onDelete?: (matchId: number) => void;
  /** 0-based position within its day group, for the entrance stagger. */
  staggerIndex?: number;
  /** Selection mode: row click toggles selection instead of navigating. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: (matchId: number) => void;
}

export const MatchCard = memo(function MatchCard({
  match,
  onClick,
  onEdit,
  onDelete,
  staggerIndex = 0,
  selectable = false,
  selected = false,
  onToggleSelected,
}: MatchCardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation(["history", "common", "mood"]);

  const MoodGlyph = moodIcon(match.mood);

  const hasLocalTeam = match.localTeamNum !== null && match.localTeamNum !== undefined;
  const isTraining = match.matchType === "training";
  const isWin = hasLocalTeam && match.winnerTeamNum === match.localTeamNum;
  const isLoss = hasLocalTeam && match.winnerTeamNum !== null && match.winnerTeamNum !== match.localTeamNum;

  const resultLabel = isTraining
    ? t("history:results.training")
    : isWin
      ? t("history:results.win")
      : isLoss
        ? t("history:results.loss")
        : match.winnerTeamNum === 0
          ? t("history:results.blueWon")
          : match.winnerTeamNum === 1
            ? t("history:results.orangeWon")
            : t("history:results.draw");

  const resultTone = isTraining
    ? "text-accent-primary"
    : isWin
      ? "text-accent-success"
      : isLoss
        ? "text-accent-danger"
        : "text-text-tertiary";

  const edgeTone = isTraining
    ? "bg-accent-primary"
    : isWin
      ? "bg-accent-success"
      : isLoss
        ? "bg-accent-danger"
        : "bg-border-default";

  const blueWon = match.winnerTeamNum === 0;
  const orangeWon = match.winnerTeamNum === 1;
  const arenaName = match.arena ? getArenaDisplayName(match.arena) : null;
  // Free Play reports no arena: show a proper mode title instead of "—".
  const primaryTitle = arenaName ?? (isTraining ? t("history:titles.training") : "—");

  const playlistLabel = match.playlist
    ? t(`history:playlists.${match.playlist.toLowerCase()}`, { defaultValue: match.playlist })
    : null;

  function handleClick() {
    if (selectable) {
      onToggleSelected?.(match.id);
      return;
    }
    if (onClick) onClick();
    else navigate(`/history/${match.id}`);
  }

  return (
    <ContextMenu
      style={{ "--stagger-i": Math.min(staggerIndex, 12) } as React.CSSProperties}
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
        data-history-match="true"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={selectable ? selected : undefined}
        className={cn(
          "group grid w-full cursor-pointer items-center gap-4 py-3 pl-0 pr-2",
          selectable
            ? "grid-cols-[3px_28px_minmax(0,1fr)_auto_auto_auto_auto]"
            : "grid-cols-[3px_minmax(0,1fr)_auto_auto_auto_auto]",
          "transition-colors duration-150 hover:bg-bg-hover",
          selected && "bg-accent-primary-muted/30",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]",
          // Rendering virtualization for long histories: off-screen rows are
          // skipped by layout/paint while keeping DOM-based tests and
          // focus/scroll behavior intact.
          "[content-visibility:auto] [contain-intrinsic-size:auto_64px]",
        )}
      >
        <span aria-hidden="true" className={cn("h-full w-[3px] rounded-full", edgeTone)} />

        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none h-3.5 w-3.5 accent-[var(--accent)]"
          />
        )}

        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-text-primary">
            <span className="truncate">{primaryTitle}</span>
            {match.isOvertime && (
              <span className="micro-label shrink-0 text-accent-warning">OT</span>
            )}
            {match.matchType === "ranked" && (
              <span className="micro-label shrink-0 text-accent-primary">
                {t("history:matchTypes.ranked")}
              </span>
            )}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-tertiary">
            <span className="shrink-0">{formatDateTime(match.startTime * 1000)}</span>
            {!isTraining && playlistLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{playlistLabel}</span>
              </>
            )}
            {!isTraining && (match.durationSeconds ?? 0) > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular shrink-0">{formatDuration(match.durationSeconds ?? 0)}</span>
              </>
            )}
          </p>
        </div>

        {isTraining ? (
          <span className="flex w-20 items-center justify-end gap-1.5 text-xs font-medium text-text-tertiary">
            <Dumbbell size={13} aria-hidden="true" />
            <span className="tabular">
              {match.durationSeconds ? formatDuration(match.durationSeconds) : "—"}
            </span>
          </span>
        ) : (
          <p className="numeral text-xl leading-none">
            <span className={blueWon ? "text-team-blue" : "text-text-tertiary"}>
              {match.teamBlueScore}
            </span>
            <span className="mx-1.5 text-text-muted">:</span>
            <span className={orangeWon ? "text-team-orange" : "text-text-tertiary"}>
              {match.teamOrangeScore}
            </span>
          </p>
        )}

        <span className={cn("w-16 text-right text-xs font-semibold", resultTone)}>
          {resultLabel}
        </span>

        <span title={t(moodLabelKey(match.mood))}>
          <MoodGlyph size={15} className={cn("shrink-0", moodTone(match.mood))} aria-label={t(moodLabelKey(match.mood))} />
        </span>

        {(match.notes || (match.tags && match.tags.length > 0)) && (
          <span
            className="hidden shrink-0 items-center gap-1 sm:flex"
            title={match.notes ?? match.tags?.join(", ")}
          >
            {match.tags?.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-bg-elevated px-1.5 py-0.5 text-[9px] font-medium text-text-tertiary"
              >
                {tag}
              </span>
            ))}
            <StickyNote size={12} className="text-text-tertiary" aria-hidden="true" />
          </span>
        )}

        <ChevronRight
          size={14}
          aria-hidden="true"
          className="text-text-muted opacity-0 transition-opacity group-hover:opacity-70"
        />
      </div>
    </ContextMenu>
  );
});
