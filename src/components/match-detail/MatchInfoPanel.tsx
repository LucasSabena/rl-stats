import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn, formatDateTime, formatDuration } from "@/lib/utils";
import { Globe, Monitor, Clock, Calendar, MapPin, Trophy } from "lucide-react";
import { getArenaDisplayName } from "@/lib/arenaMap";
import type { MatchDetail, MatchType } from "@/lib/types";

interface MatchInfoPanelProps {
  match: MatchDetail;
}

export const MatchInfoPanel = memo(function MatchInfoPanel({ match }: MatchInfoPanelProps) {
  const { t } = useTranslation("matchDetail");

  const MATCH_TYPE_LABELS: Record<MatchType, string> = {
    ranked: t("matchType.ranked"),
    casual: t("matchType.casual"),
    tournament: t("matchType.tournament"),
    training: t("matchType.training"),
    other: t("matchType.other"),
  };

  const hasLocalTeam = match.localTeamNum !== null && match.localTeamNum !== undefined;
  const isWin = hasLocalTeam && match.winnerTeamNum === match.localTeamNum;
  const isLoss = hasLocalTeam && match.winnerTeamNum !== null && match.winnerTeamNum !== match.localTeamNum;

  const resultLabel = isWin
    ? t("infoPanel.win")
    : isLoss
    ? t("infoPanel.loss")
    : match.winnerTeamNum === 0
    ? t("infoPanel.blueWon")
    : match.winnerTeamNum === 1
    ? t("infoPanel.orangeWon")
    : t("infoPanel.draw");
  const resultColor = isWin
    ? "text-accent-success"
    : isLoss
    ? "text-accent-danger"
    : "text-text-secondary";

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface p-5 shadow-level-1">
      <h3 className="font-display mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Trophy size={16} className="text-accent-warning" />
        {t("infoPanel.title")}
      </h3>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <InfoItem label={t("infoPanel.result")} value={resultLabel} valueClassName={resultColor} />
        <InfoItem
          label={t("infoPanel.type")}
          value={match.matchType ? MATCH_TYPE_LABELS[match.matchType] : "---"}
        />
        <InfoItem label={t("infoPanel.playlist")} value={match.playlist ?? "---"} />
        <InfoItem
          label={t("infoPanel.mode")}
          value={match.isOnline ? t("mode.online") : t("mode.local")}
          icon={match.isOnline ? <Globe size={12} /> : <Monitor size={12} />}
        />
        <InfoItem label={t("header.arena")} value={getArenaDisplayName(match.arena)} icon={<MapPin size={12} />} />
        <InfoItem
          label={t("infoPanel.duration")}
          value={match.durationSeconds ? formatDuration(match.durationSeconds) : "---"}
          icon={<Clock size={12} />}
        />
        <InfoItem label={t("infoPanel.overtime")} value={match.isOvertime ? t("overtime.yes") : t("overtime.no")} />
        <InfoItem
          label={t("infoPanel.totalGoals")}
          value={`${match.teamBlueScore} - ${match.teamOrangeScore}`}
        />
        <InfoItem
          label={t("infoPanel.date")}
          value={formatDateTime(match.startTime * 1000)}
          icon={<Calendar size={12} />}
        />
      </div>
    </div>
  );
});

function InfoItem({
  label,
  value,
  icon,
  valueClassName,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg bg-bg-panel/80 p-3">
      <p className="flex items-center gap-1 text-[10px] font-semibold text-text-tertiary">
        {icon}
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-medium text-text-primary", valueClassName)}>{value}</p>
    </div>
  );
}