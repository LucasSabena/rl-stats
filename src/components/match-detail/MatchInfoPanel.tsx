import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn, formatDateTime } from "@/lib/utils";
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
      : "text-text-primary";

  return (
    <section className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
      <header className="border-b border-border-subtle px-4 py-2.5">
        <h3 className="micro-label">{t("infoPanel.title")}</h3>
      </header>
      <dl className="grid grid-cols-2 divide-x divide-y divide-border-subtle/60 sm:grid-cols-3">
        <Item label={t("infoPanel.result")} value={resultLabel} valueClassName={resultColor} />
        <Item
          label={t("infoPanel.type")}
          value={match.matchType ? MATCH_TYPE_LABELS[match.matchType] : "—"}
        />
        <Item label={t("infoPanel.playlist")} value={match.playlist ?? "—"} />
        <Item
          label={t("infoPanel.mode")}
          value={match.isOnline ? t("mode.online") : t("mode.local")}
        />
        <Item
          label={t("infoPanel.totalGoals")}
          value={`${match.teamBlueScore} – ${match.teamOrangeScore}`}
        />
        <Item label={t("infoPanel.date")} value={formatDateTime(match.startTime * 1000)} />
      </dl>
    </section>
  );
});

function Item({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="px-4 py-2.5">
      <dt className="micro-label">{label}</dt>
      <dd className={cn("mt-0.5 text-[13px] font-medium text-text-primary", valueClassName)}>
        {value}
      </dd>
    </div>
  );
}
