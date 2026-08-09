import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Info } from "lucide-react";
import { cn, formatBoost, formatSpeed } from "@/lib/utils";
import { deriveRank } from "@/lib/rank";
import type { HeadToHeadRecord, LiveMmrPlayer, Player } from "@/lib/types";
import { useFriends } from "@/hooks/useFriends";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { RankInsignia } from "@/components/ui/RankInsignia";
import { PlayerLink } from "@/components/ui/PlayerLink";

interface PlayerCardProps {
  player: Player;
  isCurrentUser?: boolean;
  mmr?: LiveMmrPlayer | null;
  headToHead?: HeadToHeadRecord | null;
  mmrLoading?: boolean;
  playlist?: string | null;
}

export const PlayerCard = memo(function PlayerCard({
  player,
  isCurrentUser,
  mmr,
  headToHead,
  mmrLoading,
  playlist,
}: PlayerCardProps) {
  const { t } = useTranslation(["live", "common", "players"]);
  const { data: friends } = useFriends();
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  const isBlue = player.team === 0;
  const hasMmr = mmr?.mmr != null;
  const isFriend = friends?.some((f) => f.primary_id === player.id) ?? false;

  const rank = useMemo(
    () => deriveRank(mmr?.mmr ?? null, mmr?.playlist ?? playlist),
    [mmr?.mmr, mmr?.playlist, playlist],
  );

  const details = mmr?.warning ?? mmr?.error ?? null;
  const isUnavailable = !hasMmr && Boolean(mmr?.error);

  const provenance = [
    mmr?.source,
    mmr?.estimated ? "estimated" : null,
    mmr?.stale ? "stale" : null,
    mmr?.cached ? "cached" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="relative px-4 py-3 transition-colors hover:bg-bg-hover">
        {isCurrentUser && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-0.5 bg-accent-primary"
          />
        )}

        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px] font-bold",
              isBlue ? "bg-team-blue-bg text-team-blue" : "bg-team-orange-bg text-team-orange",
            )}
          >
            {(player.name || "?").charAt(0).toUpperCase()}
          </span>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[13px] font-medium leading-tight text-text-primary">
              <PlayerLink player={player.id} name={player.name} className="truncate" />
              {rank && <RankInsignia rank={rank} size={14} />}
              {isCurrentUser && (
                <span className="shrink-0 text-[10px] font-semibold text-accent-primary">
                  {t("live:players.you")}
                </span>
              )}
              {isFriend && !isCurrentUser && (
                <span className="shrink-0 text-[10px] text-text-tertiary">
                  {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                </span>
              )}
            </p>
            <p
              className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] leading-tight text-text-tertiary"
              title={provenance || undefined}
            >
              {mmrLoading && !hasMmr && <span>{t("live:mmr.searching")}</span>}
              {!mmrLoading && !hasMmr && <span className="tabular">MMR —</span>}
              {hasMmr && (
                <span className="tabular text-text-secondary">
                  {mmr?.estimated ? "≈" : ""}
                  {mmr?.mmr}
                  {rank && <span className="text-text-tertiary"> · {rank.label}</span>}
                </span>
              )}
              {headToHead && (
                <span className="tabular">
                  {headToHead.wins_together}-{headToHead.losses_together} ·{" "}
                  {headToHead.wins_against}-{headToHead.losses_against}
                </span>
              )}
              {details && (
                <button
                  type="button"
                  onClick={() => setDetailsModalOpen(true)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1 py-px transition-colors",
                    isUnavailable
                      ? "text-accent-danger hover:bg-accent-danger-subtle"
                      : "text-text-tertiary hover:bg-surface-hover hover:text-text-secondary",
                  )}
                  aria-label={
                    isUnavailable
                      ? t("live:mmr.unavailableDetails")
                      : t("live:mmr.estimateDetails")
                  }
                >
                  {isUnavailable ? (
                    <AlertTriangle size={11} aria-hidden="true" />
                  ) : (
                    <Info size={11} aria-hidden="true" />
                  )}
                </button>
              )}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="numeral text-lg leading-none text-text-primary">{player.score}</p>
            <p className="micro-label mt-0.5">{t("live:stats.pts")}</p>
          </div>
        </div>

        <dl className="mt-2.5 grid grid-cols-8 divide-x divide-border-subtle/60 text-center">
          <Stat label={t("live:stats.goals")} value={player.goals} />
          <Stat label={t("live:stats.assists")} value={player.assists} />
          <Stat label={t("live:stats.shots")} value={player.shots} />
          <Stat label={t("live:stats.saves")} value={player.saves} />
          <Stat label={t("live:stats.touches")} value={player.touches} />
          <Stat label={t("live:stats.demos")} value={player.demos} />
          <Stat label={t("live:stats.speed")} value={player.speed} displayValue={formatSpeed(player.speed)} />
          <Stat label={t("live:stats.boost")} value={player.boostAmount} displayValue={formatBoost(player.boostAmount)} />
        </dl>

        <div
          className="mt-2.5 h-0.5 w-full overflow-hidden rounded-full bg-bg-secondary"
          role="progressbar"
          aria-valuenow={Math.round(player.boostAmount)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("live:boostAriaLabel", { name: player.name })}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              player.boostAmount > 60
                ? "bg-boost-full"
                : player.boostAmount > 30
                  ? "bg-boost-mid"
                  : "bg-boost-low",
            )}
            style={{ width: `${Math.max(0, Math.min(100, player.boostAmount))}%` }}
          />
        </div>
      </div>

      {details && (
        <Modal
          isOpen={detailsModalOpen}
          onClose={() => setDetailsModalOpen(false)}
          title={
            isUnavailable
              ? t("live:mmr.unavailableTitle")
              : t("live:mmr.estimateTitle")
          }
          size="sm"
          footer={
            <Button variant="secondary" onClick={() => setDetailsModalOpen(false)}>
              {t("common:actions.close", { defaultValue: "Cerrar" })}
            </Button>
          }
        >
          <p className="text-sm leading-relaxed text-text-secondary">{details}</p>
          {provenance && (
            <p className="mt-3 text-xs text-text-tertiary">{provenance}</p>
          )}
        </Modal>
      )}
    </>
  );
});

function Stat({
  label,
  value,
  displayValue,
}: {
  label: string;
  value: number;
  displayValue?: string;
}) {
  return (
    <div className="px-0.5">
      <dt className="micro-label">{label}</dt>
      <dd className="numeral mt-0.5 text-[12px] leading-none text-text-primary">
        {displayValue ?? value}
      </dd>
    </div>
  );
}
