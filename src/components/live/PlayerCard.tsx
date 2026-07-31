import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatBoost, formatSpeed } from "@/lib/utils";
import type { HeadToHeadRecord, LiveMmrPlayer, Player } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { useFriends } from "@/hooks/useFriends";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, Info } from "lucide-react";

interface PlayerCardProps {
  player: Player;
  isCurrentUser?: boolean;
  mmr?: LiveMmrPlayer | null;
  headToHead?: HeadToHeadRecord | null;
  mmrLoading?: boolean;
}

export const PlayerCard = memo(function PlayerCard({ player, isCurrentUser, mmr, headToHead, mmrLoading }: PlayerCardProps) {
  const { t } = useTranslation(["live", "common", "players"]);
  const { data: friends } = useFriends();
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const isBlue = player.team === 0;
  const hasMmr = mmr?.mmr !== null && mmr?.mmr !== undefined;
  const mmrLabel = hasMmr ? `MMR ${mmr?.estimated ? "≈" : ""}${mmr?.mmr}` : null;
  const rankLabel = mmr?.rankName
    ? `${mmr.rankName}${mmr.division ? ` ${mmr.division}` : ""}`
    : null;
  const sourceLabel =
    mmr?.source === "tracker"
      ? "Tracker"
      : mmr?.source === "rlstats"
        ? "RLStats"
        : mmr?.source === "rapidapi"
          ? "RapidAPI"
        : mmr?.source === "local-estimate"
          ? "Local"
          : mmr?.source === "history"
            ? "Histórico"
            : mmr?.source === "lobby-estimate"
              ? "Lobby"
            : null;
  const details = mmr?.warning ?? mmr?.error ?? null;
  const isUnavailable = !hasMmr && Boolean(mmr?.error);
  const headToHeadLabel = headToHead
    ? `Comp ${headToHead.wins_together}-${headToHead.losses_together} · Rival ${headToHead.wins_against}-${headToHead.losses_against}`
    : null;

  return (
    <>
      <div
        className={cn(
          "rounded-md border p-1.5 transition-all duration-200",
          isCurrentUser
            ? "border-accent-primary/30 bg-accent-primary-muted shadow-[var(--shadow-glow-blue)]"
            : "border-border-subtle bg-bg-surface/60 hover:border-border-default"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-1.5">
            <div
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold",
                isBlue
                  ? "bg-team-blue/15 text-team-blue"
                  : "bg-team-orange/15 text-team-orange"
              )}
            >
              {(player.name || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="truncate text-[11px] font-semibold leading-tight text-text-primary">{player.name}</span>
                {isCurrentUser && (
                  <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-accent-primary">
                    {t("live:players.you")}
                  </span>
                )}
                {friends?.some((f) => f.primary_id === player.id) && (
                  <span className="shrink-0 rounded-full bg-accent-primary/15 px-1 py-px text-[7px] font-bold uppercase tracking-wider text-accent-primary">
                    {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-1 gap-y-0 text-[8px] leading-tight text-text-tertiary">
                {mmrLoading && !hasMmr ? <span>{t("live:mmr.searching")}</span> : null}
                {!mmrLoading && !hasMmr ? <span className="font-mono text-text-muted">MMR —</span> : null}
                {mmrLabel ? <span className="font-mono font-semibold text-text-secondary">{mmrLabel}</span> : null}
                {rankLabel ? <span>{rankLabel}</span> : null}
                {sourceLabel ? <span>{sourceLabel}</span> : null}
                {mmr?.stale ? <span className="uppercase text-accent-warning">venc.</span> : null}
                {mmr?.cached ? <span className="uppercase">cache</span> : null}
                {details ? (
                  <button
                    type="button"
                    onClick={() => setDetailsModalOpen(true)}
                    className={cn(
                      "inline-flex min-h-5 items-center gap-0.5 rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide transition-colors",
                      isUnavailable
                        ? "border border-accent-danger/20 bg-accent-danger/10 text-accent-danger hover:bg-accent-danger/20"
                        : "border border-accent-info/20 bg-accent-info/10 text-accent-info hover:bg-accent-info/20"
                    )}
                    aria-label={isUnavailable ? t("live:mmr.unavailableDetails") : t("live:mmr.estimateDetails")}
                  >
                    {isUnavailable ? <AlertTriangle size={9} /> : <Info size={9} />}
                    {isUnavailable ? t("live:mmr.unavailable") : t("live:mmr.infoLabel")}
                  </button>
                ) : null}
                {headToHeadLabel ? <span className="text-text-secondary">{headToHeadLabel}</span> : null}
              </div>
            </div>
          </div>
          <span className="ml-1 shrink-0 font-mono text-xs font-bold text-text-primary">{player.score}</span>
        </div>

        <div className="mt-1 grid grid-cols-8 gap-px text-center">
          <Stat label={t("live:stats.goals")} value={player.goals} />
          <Stat label={t("live:stats.assists")} value={player.assists} />
          <Stat label={t("live:stats.shots")} value={player.shots} />
          <Stat label={t("live:stats.saves")} value={player.saves} />
          <Stat label={t("live:stats.touches")} value={player.touches} />
          <Stat label={t("live:stats.demos")} value={player.demos} />
          <Stat label={t("live:stats.speed")} value={player.speed} displayValue={formatSpeed(player.speed)} />
          <Stat label={t("live:stats.boost")} value={player.boostAmount} displayValue={formatBoost(player.boostAmount)} />
        </div>

        <div className="mt-1">
          <div
            className="h-0.5 w-full overflow-hidden rounded-full bg-bg-panel"
            role="progressbar"
            aria-valuenow={Math.round(player.boostAmount)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("live:boostAriaLabel", { name: player.name })}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                player.boostAmount > 60
                  ? "bg-accent-success shadow-[0_0_4px_var(--color-accent-success)]"
                  : player.boostAmount > 30
                    ? "bg-accent-warning"
                    : "bg-accent-danger"
              )}
              style={{ width: `${Math.max(0, Math.min(100, player.boostAmount))}%` }}
            />
          </div>
        </div>
      </div>

      {details && (
        <Modal
          isOpen={detailsModalOpen}
          onClose={() => setDetailsModalOpen(false)}
          title={isUnavailable ? t("live:mmr.unavailableTitle") : t("live:mmr.estimateTitle")}
          size="sm"
          footer={<Button variant="secondary" onClick={() => setDetailsModalOpen(false)}>{t("common:actions.close", { defaultValue: "Cerrar" })}</Button>}
        >
          <p className="text-sm leading-relaxed text-text-secondary">{details}</p>
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
      <p className="text-[7px] font-semibold uppercase tracking-wide leading-none text-text-tertiary">{label}</p>
      <p className="mt-px font-mono text-[10px] font-bold leading-tight text-text-primary">
        {displayValue ?? value}
      </p>
    </div>
  );
}
