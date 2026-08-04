import { memo, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Info } from "lucide-react";
import { cn, formatBoost, formatSpeed } from "@/lib/utils";
import { deriveRank } from "@/lib/rank";
import type { HeadToHeadRecord, LiveMmrPlayer, Player } from "@/lib/types";
import { useFriends } from "@/hooks/useFriends";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { RankInsignia } from "@/components/ui/RankInsignia";

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

  // Rank comes from MMR — the tracker fields are always null now.
  const rank = useMemo(
    () => deriveRank(mmr?.mmr ?? null, playlist),
    [mmr?.mmr, playlist],
  );

  const details = mmr?.warning ?? mmr?.error ?? null;
  const isUnavailable = !hasMmr && Boolean(mmr?.error);

  // Provenance used to be four separate uppercase chips on every card.
  // It's supporting detail, so it lives in the tooltip now.
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
      <div
        className={cn(
          "rounded-md border p-2 transition-colors duration-150",
          isCurrentUser
            ? "border-[color-mix(in_oklab,var(--accent)_35%,transparent)] bg-accent-primary-muted"
            : "border-border-subtle bg-bg-surface hover:border-border-default",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-semibold",
                isBlue
                  ? "bg-team-blue-bg text-team-blue"
                  : "bg-team-orange-bg text-team-orange",
              )}
            >
              {(player.name || "?").charAt(0).toUpperCase()}
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Link
                  to={`/players/${encodeURIComponent(player.id)}`}
                  className="truncate text-[13px] font-medium leading-tight text-text-primary hover:text-accent-primary hover:underline"
                  title={player.name}
                >
                  {player.name}
                </Link>

                {rank && <RankInsignia rank={rank} size={15} />}

                {isCurrentUser && (
                  <span className="shrink-0 text-[10px] font-medium text-accent-primary">
                    {t("live:players.you")}
                  </span>
                )}
                {isFriend && !isCurrentUser && (
                  <span className="shrink-0 text-[10px] text-text-tertiary">
                    {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                  </span>
                )}
              </div>

              <div
                className="flex flex-wrap items-center gap-x-2 text-[11px] leading-tight text-text-tertiary"
                title={provenance || undefined}
              >
                {mmrLoading && !hasMmr && <span>{t("live:mmr.searching")}</span>}
                {!mmrLoading && !hasMmr && <span className="tabular">MMR —</span>}
                {hasMmr && (
                  <span className="tabular text-text-secondary">
                    {mmr?.estimated ? "≈" : ""}
                    {mmr?.mmr}
                    {rank && <span className="ml-1">{rank.label}</span>}
                  </span>
                )}
                {headToHead && (
                  <span>
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
              </div>
            </div>
          </div>

          <span className="numeral shrink-0 text-sm text-text-primary">
            {player.score}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-8 gap-1 text-center">
          <Stat label={t("live:stats.goals")} value={player.goals} />
          <Stat label={t("live:stats.assists")} value={player.assists} />
          <Stat label={t("live:stats.shots")} value={player.shots} />
          <Stat label={t("live:stats.saves")} value={player.saves} />
          <Stat label={t("live:stats.touches")} value={player.touches} />
          <Stat label={t("live:stats.demos")} value={player.demos} />
          <Stat
            label={t("live:stats.speed")}
            value={player.speed}
            displayValue={formatSpeed(player.speed)}
          />
          <Stat
            label={t("live:stats.boost")}
            value={player.boostAmount}
            displayValue={formatBoost(player.boostAmount)}
          />
        </div>

        <div
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-bg-secondary"
          role="progressbar"
          aria-valuenow={Math.round(player.boostAmount)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("live:boostAriaLabel", { name: player.name })}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300 ease-out",
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
    <div>
      <p className="text-[10px] leading-none text-text-tertiary">{label}</p>
      <p className="numeral mt-1 text-[12px] leading-none text-text-primary">
        {displayValue ?? value}
      </p>
    </div>
  );
}
