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
  const updatedLabel = mmr?.updatedAt
    ? new Date(mmr.updatedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <>
      <div
        className={cn(
          "rounded-lg border p-2.5 transition-all duration-200",
          isCurrentUser
            ? "border-accent-primary/30 bg-accent-primary-muted shadow-glow-blue"
            : "border-border-subtle bg-bg-surface hover:border-border-default"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold",
                isBlue
                  ? "bg-team-blue-bg text-team-blue"
                  : "bg-team-orange-bg text-team-orange"
              )}
            >
              {(player.name || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold text-text-primary">{player.name}</span>
                {isCurrentUser && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-accent-primary">
                    {t("live:players.you")}
                  </span>
                )}
                {friends?.some((f) => f.primary_id === player.id) && (
                  <span className="shrink-0 rounded-full bg-accent-primary/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-accent-primary">
                    {t("players:directory.badgeFriend", { defaultValue: "Amigo" })}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1 text-[9px] text-text-tertiary">
                {mmrLoading && !hasMmr ? <span>{t("live:mmr.searching")}</span> : null}
                {!mmrLoading && !hasMmr ? <span className="font-mono text-text-muted">MMR —</span> : null}
                {mmrLabel ? <span className="font-mono font-semibold text-text-secondary">{mmrLabel}</span> : null}
                {rankLabel ? <span>{rankLabel}</span> : null}
                {sourceLabel ? <span>{sourceLabel}</span> : null}
                {mmr?.estimated ? <span className="uppercase tracking-wide">est.</span> : null}
                {mmr?.stale ? <span className="uppercase tracking-wide text-accent-warning">venc.</span> : null}
                {typeof mmr?.estimateMatchesSinceRefresh === "number" && mmr.estimateMatchesSinceRefresh > 0 ? (
                  <span>{mmr.estimateMatchesSinceRefresh}p</span>
                ) : null}
                {mmr?.cached ? <span className="uppercase tracking-wide">cache</span> : null}
                {updatedLabel ? <span>act. {updatedLabel}</span> : null}
                {details ? (
                  <button
                    type="button"
                    onClick={() => setDetailsModalOpen(true)}
                    className={cn(
                      "inline-flex min-h-6 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors",
                      isUnavailable
                        ? "border border-accent-danger/20 bg-accent-danger/10 text-accent-danger hover:bg-accent-danger/20"
                        : "border border-accent-info/20 bg-accent-info/10 text-accent-info hover:bg-accent-info/20"
                    )}
                    aria-label={isUnavailable ? t("live:mmr.unavailableDetails") : t("live:mmr.estimateDetails")}
                  >
                    {isUnavailable ? <AlertTriangle size={10} /> : <Info size={10} />}
                    {isUnavailable ? t("live:mmr.unavailable") : t("live:mmr.infoLabel")}
                  </button>
                ) : null}
                {headToHeadLabel ? <span className="text-text-secondary">{headToHeadLabel}</span> : null}
              </div>
            </div>
          </div>
          <span className="font-mono text-sm font-bold text-text-primary">{player.score}</span>
        </div>

        <div className="mt-1.5 grid grid-cols-4 gap-1 text-center">
          <Stat label={t("live:stats.goals")} value={player.goals} />
          <Stat label={t("live:stats.assists")} value={player.assists} />
          <Stat label={t("live:stats.shots")} value={player.shots} />
          <Stat label={t("live:stats.saves")} value={player.saves} />
        </div>

        <div className="mt-1 grid grid-cols-4 gap-1 text-center">
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

        <div className="mt-1.5">
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-bg-panel"
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
                  ? "bg-accent-success shadow-[0_0_6px_var(--color-accent-success)]"
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
      <p className="text-[9px] font-semibold uppercase tracking-wide text-text-tertiary leading-none">{label}</p>
      <p className="mt-0.5 font-mono text-xs font-bold text-text-primary leading-tight">
        {displayValue ?? value}
      </p>
    </div>
  );
}
