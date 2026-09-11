import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { AlarmClock, Clock, Flame, Swords, Target, Trophy } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface SessionSummaryPayload {
  matches: number;
  wins: number;
  losses: number;
  streak: number;
  goalsFor: number;
  goalsAgainst: number;
  durationSeconds: number;
  startedAt: string | null;
  bestHour: number | null;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(0, Math.round(totalSeconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/**
 * End-of-session summary: shown when the Rocket League process closes, with
 * the running W/L tally accumulated while the game was open.
 */
export function SessionSummaryModal() {
  const { t } = useTranslation(["analytics", "common"]);
  const [summary, setSummary] = useState<SessionSummaryPayload | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    void listen<SessionSummaryPayload>("session-summary", (event) => {
      const payload = event.payload;
      if (!payload || payload.matches <= 0) return;
      setSummary(payload);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  if (!summary) return null;

  const streakLabel =
    summary.streak > 0
      ? `+${summary.streak}`
      : summary.streak < 0
        ? `${summary.streak}`
        : "0";

  const stat = (icon: React.ReactNode, label: string, value: string, tone?: string) => (
    <div className="rounded-lg border border-border-subtle bg-bg-panel p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-text-tertiary">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`numeral text-lg font-bold ${tone ?? "text-text-primary"}`}>{value}</p>
    </div>
  );

  return (
    <Modal isOpen onClose={() => setSummary(null)} size="md">
      <div className="p-1">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {t("analytics:sessionSummary.title", { defaultValue: "Resumen de sesión" })}
          </h2>
          <p className="text-xs text-text-secondary">
            {t("analytics:sessionSummary.subtitle", {
              defaultValue: "Así te fue en esta sesión de Rocket League",
            })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stat(
            <Swords size={12} />,
            t("analytics:sessionSummary.matches", { defaultValue: "Partidas" }),
            String(summary.matches),
          )}
          {stat(
            <Trophy size={12} />,
            t("analytics:sessionSummary.record", { defaultValue: "Récord" }),
            `${summary.wins}W - ${summary.losses}L`,
            summary.wins >= summary.losses ? "text-accent-success" : "text-accent-danger",
          )}
          {stat(
            <Flame size={12} />,
            t("analytics:sessionSummary.streak", { defaultValue: "Racha final" }),
            streakLabel,
            summary.streak > 0
              ? "text-accent-success"
              : summary.streak < 0
                ? "text-accent-danger"
                : undefined,
          )}
          {stat(
            <Target size={12} />,
            t("analytics:sessionSummary.goals", { defaultValue: "Goles" }),
            `${summary.goalsFor} / ${summary.goalsAgainst}`,
          )}
          {stat(
            <Clock size={12} />,
            t("analytics:sessionSummary.time", { defaultValue: "Tiempo jugado" }),
            formatDuration(summary.durationSeconds),
          )}
          {stat(
            <Flame size={12} />,
            t("analytics:sessionSummary.winRate", { defaultValue: "Win rate" }),
            `${Math.round((summary.wins / Math.max(1, summary.matches)) * 100)}%`,
          )}
          {summary.bestHour !== null &&
            stat(
              <AlarmClock size={12} />,
              t("analytics:sessionSummary.bestHour", { defaultValue: "Mejor hora" }),
              `${String(summary.bestHour).padStart(2, "0")}:00`,
            )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setSummary(null)}>
            {t("common:buttons.close", { defaultValue: "Cerrar" })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
