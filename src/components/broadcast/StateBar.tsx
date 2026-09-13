import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useUIStore } from "@/stores/uiStore";
import {
  controlBroadcastTimer,
  setBroadcastDelay,
  setBroadcastState,
} from "@/lib/api";
import type { BroadcastFeed } from "@/hooks/useBroadcastFeed";
import { Pause, Play, Timer, Zap } from "lucide-react";
import { useState } from "react";

const STATES = ["waiting", "live", "replay", "post", "brb"] as const;

interface StateBarProps {
  feed: BroadcastFeed;
}

/**
 * Broadcast state machine: one click moves the whole overlay package between
 * Waiting / Live / Replay / Post / BRB, plus the intermission timer and the
 * tournament delay.
 */
export function StateBar({ feed }: StateBarProps) {
  const { t } = useTranslation(["overlay", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const [busy, setBusy] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(120);
  const [delay, setDelay] = useState(feed.delaySeconds);

  const changeState = async (state: string) => {
    setBusy(state);
    try {
      await setBroadcastState(state);
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const startTimer = async () => {
    await controlBroadcastTimer("start", timerSeconds, t("overlay:broadcast.timer.incoming"));
    addToast({ type: "success", title: t("overlay:broadcast.timer.started") });
  };

  const stopTimer = async () => {
    await controlBroadcastTimer("stop");
  };

  const applyDelay = async () => {
    await setBroadcastDelay(delay);
    addToast({
      type: "success",
      title: t("overlay:broadcast.delay.applied", { seconds: delay }),
    });
  };

  const timerRunning = Boolean(feed.lastTimer?.running);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-accent-primary" aria-hidden />
          <h2 className="text-sm font-semibold text-text-primary">
            {t("overlay:broadcast.states.label")}
          </h2>
        </div>
        <span className="font-mono text-[11px] text-text-tertiary">
          {feed.connected
            ? t("overlay:broadcast.server.connected")
            : t("overlay:broadcast.server.disconnected")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {STATES.map((state) => {
          const active = feed.activeState === state;
          return (
            <button
              key={state}
              type="button"
              disabled={busy !== null}
              onClick={() => void changeState(state)}
              aria-pressed={active}
              className={`rounded-lg border px-3 py-3 text-sm font-semibold transition-all ${
                active
                  ? "border-accent-primary bg-accent-primary text-accent-primary-fg shadow-sm"
                  : "border-border-subtle bg-bg-panel text-text-secondary hover:border-accent-primary/60 hover:text-text-primary"
              }`}
            >
              {t(`overlay:broadcast.states.${state}`)}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border-subtle pt-4 lg:grid-cols-2">
        <div className="flex items-end gap-2">
          <Input
            label={t("overlay:broadcast.timer.label")}
            type="number"
            min={5}
            max={3600}
            value={timerSeconds}
            onChange={(event) => setTimerSeconds(Number(event.target.value))}
            containerClassName="w-32"
            size="sm"
          />
          <Button size="sm" onClick={() => void startTimer()}>
            <Play className="h-3.5 w-3.5" aria-hidden />
            {t("overlay:broadcast.timer.start")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!timerRunning}
            onClick={() => void stopTimer()}
          >
            <Pause className="h-3.5 w-3.5" aria-hidden />
            {t("overlay:broadcast.timer.stop")}
          </Button>
          {timerRunning && (
            <span className="flex items-center gap-1.5 pb-1 text-xs text-accent-success">
              <Timer className="h-3.5 w-3.5" aria-hidden />
              {t("overlay:broadcast.timer.running")}
            </span>
          )}
        </div>

        <div className="flex items-end gap-2">
          <Input
            label={t("overlay:broadcast.delay.label")}
            type="number"
            min={0}
            max={600}
            value={delay}
            onChange={(event) => setDelay(Number(event.target.value))}
            containerClassName="w-32"
            size="sm"
          />
          <Button size="sm" variant="secondary" onClick={() => void applyDelay()}>
            {t("overlay:broadcast.delay.apply")}
          </Button>
          <p className="pb-1 text-[11px] text-text-muted">
            {t("overlay:broadcast.delay.hint")}
          </p>
        </div>
      </div>
    </Card>
  );
}
