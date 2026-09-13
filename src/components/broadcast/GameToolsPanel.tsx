import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useUIStore } from "@/stores/uiStore";
import { sendGameCommand } from "@/lib/api";
import { Eye, EyeOff, Gauge, Pause, Play, Video } from "lucide-react";

const PERSPECTIVES = [
  { value: "", label: "—" },
  { value: "AutoCam", label: "Auto Cam" },
  { value: "Camera_Director", label: "Director" },
  { value: "Fly", label: "Fly" },
  { value: "SoftAttach", label: "Soft Attach" },
  { value: "HardAttach", label: "Hard Attach" },
  { value: "PlayerView", label: "Player View" },
];

const SPEEDS = [
  { value: "0.25", label: "0.25×" },
  { value: "0.5", label: "0.5×" },
  { value: "1", label: "1×" },
  { value: "2", label: "2×" },
];

/**
 * Stats API outbound commands (spectator/replay): pause the match, hide the
 * HUD for clean overlays, switch POV, load/seek a replay and control playback
 * speed. Only the app's own socket can reach these; the game must be
 * streaming (attached as admin in competitive/private matches).
 */
export function GameToolsPanel() {
  const { t } = useTranslation(["overlay", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const [paused, setPaused] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [focus, setFocus] = useState("Ball");
  const [perspective, setPerspective] = useState("");
  const [replayFile, setReplayFile] = useState("");
  const [seekSeconds, setSeekSeconds] = useState("120");
  const [speed, setSpeed] = useState("1");

  const run = async (command: string, data: Record<string, unknown>) => {
    try {
      await sendGameCommand(command, data);
      addToast({
        type: "success",
        title: t("overlay:broadcast.tools.sent", { command }),
      });
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    }
  };

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Video className="h-4 w-4 text-accent-primary" aria-hidden />
        {t("overlay:broadcast.tools.title")}
      </h2>
      <p className="mb-3 text-[11px] text-text-muted">
        {t("overlay:broadcast.tools.hint")}
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            {t("overlay:broadcast.tools.match")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={paused ? "primary" : "secondary"}
              onClick={() => {
                const next = !paused;
                setPaused(next);
                void run("SetMatchPaused", { paused: next });
              }}
            >
              {paused ? (
                <Play className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Pause className="h-3.5 w-3.5" aria-hidden />
              )}
              {paused
                ? t("overlay:broadcast.tools.resume")
                : t("overlay:broadcast.tools.pause")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const next = !hudVisible;
                setHudVisible(next);
                void run("SetHUDVisibility", { visible: next });
              }}
            >
              {hudVisible ? (
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden />
              )}
              {hudVisible
                ? t("overlay:broadcast.tools.hideHud")
                : t("overlay:broadcast.tools.showHud")}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            {t("overlay:broadcast.tools.pov")}
          </p>
          <div className="flex items-end gap-2">
            <Select
              aria-label="Focus"
              options={[
                { value: "Ball", label: t("overlay:broadcast.tools.ball") },
                ...Array.from({ length: 6 }, (_, index) => ({
                  value: String(index + 1),
                  label: `Jugador ${index + 1}`,
                })),
              ]}
              value={focus}
              onChange={setFocus}
              size="sm"
            />
            <Select
              aria-label="Perspective"
              options={PERSPECTIVES}
              value={perspective}
              onChange={setPerspective}
              size="sm"
            />
            <Button
              size="sm"
              onClick={() =>
                void run("ChangePOV", {
                  focus,
                  perspective: perspective || undefined,
                })
              }
            >
              {t("overlay:broadcast.tools.applyPov")}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            {t("overlay:broadcast.tools.replay")}
          </p>
          <div className="flex items-end gap-2">
            <Input
              label={t("overlay:broadcast.tools.replayFile")}
              value={replayFile}
              onChange={(event) => setReplayFile(event.target.value)}
              size="sm"
              containerClassName="flex-1"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!replayFile.trim()}
              onClick={() => void run("LoadReplay", { fileName: replayFile.trim() })}
            >
              {t("overlay:broadcast.tools.load")}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            {t("overlay:broadcast.tools.playback")}
          </p>
          <div className="flex items-end gap-2">
            <Input
              label={t("overlay:broadcast.tools.seek")}
              type="number"
              value={seekSeconds}
              onChange={(event) => setSeekSeconds(event.target.value)}
              size="sm"
              containerClassName="w-28"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                void run("SeekReplay", { timeSeconds: Number(seekSeconds) })
              }
            >
              {t("overlay:broadcast.tools.seekButton")}
            </Button>
            <Select
              aria-label={t("overlay:broadcast.tools.speed")}
              options={SPEEDS}
              value={speed}
              onChange={(value) => {
                setSpeed(value);
                void run("SetGameSpeed", { speed: Number(value) });
              }}
              size="sm"
              icon={<Gauge className="h-3.5 w-3.5" aria-hidden />}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
