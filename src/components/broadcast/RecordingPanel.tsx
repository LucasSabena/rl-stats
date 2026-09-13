import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useUIStore } from "@/stores/uiStore";
import {
  deleteRecording,
  getRecordingStatus,
  listRecordings,
  replayRecording,
  startRecording,
  stopRecording,
  stopReplay,
} from "@/lib/api";
import type { RecordingSummary } from "@/lib/types";
import { Circle, Play, Square, Trash2 } from "lucide-react";

function formatDuration(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Match recording + replay ("retransmisión"): record the broadcast feed and
 * re-air it later with the original pacing, at 0.25x–4x speed.
 */
export function RecordingPanel() {
  const { t } = useTranslation(["overlay", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
  const [recording, setRecording] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [label, setLabel] = useState("");
  const [speed, setSpeed] = useState("1");
  const [loop, setLoop] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [list, status] = await Promise.all([
      listRecordings(),
      getRecordingStatus(),
    ]);
    setRecordings(list);
    setRecording(status.recording);
    setReplaying(status.replaying);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleRecord = async () => {
    setBusy(true);
    try {
      if (recording) {
        await stopRecording();
        addToast({ type: "success", title: t("overlay:broadcast.recording.stopped") });
      } else {
        await startRecording(label.trim() || undefined);
        setLabel("");
        addToast({ type: "success", title: t("overlay:broadcast.recording.started") });
      }
      await refresh();
    } catch (error) {
      addToast({
        type: "error",
        title: t("overlay:broadcast.toasts.error"),
        message: String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const play = async (id: string) => {
    try {
      await replayRecording(id, Number(speed) || 1, loop);
      addToast({
        type: "success",
        title: t("overlay:broadcast.recording.replayStarted"),
      });
      await refresh();
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Circle
            className={`h-4 w-4 ${
              recording ? "animate-pulse text-accent-danger" : "text-text-tertiary"
            }`}
            aria-hidden
          />
          {t("overlay:broadcast.recording.title")}
        </h2>
        <div className="flex items-center gap-1.5">
          {recording && <Badge variant="danger">{t("overlay:broadcast.recording.recording")}</Badge>}
          {replaying && <Badge variant="accent">{t("overlay:broadcast.recording.replaying")}</Badge>}
        </div>
      </div>
      <p className="mb-3 text-[11px] text-text-muted">
        {t("overlay:broadcast.recording.hint")}
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <Input
          label={t("overlay:broadcast.recording.label")}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={recording}
          size="sm"
          containerClassName="w-48"
        />
        <Button
          size="sm"
          variant={recording ? "danger" : "primary"}
          isLoading={busy}
          onClick={() => void toggleRecord()}
        >
          {recording ? (
            <Square className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Circle className="h-3.5 w-3.5" aria-hidden />
          )}
          {recording
            ? t("overlay:broadcast.recording.stop")
            : t("overlay:broadcast.recording.record")}
        </Button>
        {replaying && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void stopReplay().then(refresh)}
          >
            <Square className="h-3.5 w-3.5" aria-hidden />
            {t("overlay:broadcast.recording.stopReplay")}
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border-subtle pt-3">
        <Select
          aria-label={t("overlay:broadcast.recording.speed")}
          options={[
            { value: "0.25", label: "0.25×" },
            { value: "0.5", label: "0.5×" },
            { value: "1", label: "1×" },
            { value: "2", label: "2×" },
            { value: "4", label: "4×" },
          ]}
          value={speed}
          onChange={setSpeed}
          size="sm"
        />
        <Switch
          checked={loop}
          onChange={setLoop}
          label={t("overlay:broadcast.recording.loop")}
          size="sm"
        />
      </div>

      <ul className="mt-3 space-y-1.5">
        {recordings.length === 0 ? (
          <li className="text-xs text-text-muted">
            {t("overlay:broadcast.recording.empty")}
          </li>
        ) : (
          recordings.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle bg-bg-panel px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
                {entry.label}
              </span>
              <span className="font-mono text-[11px] text-text-tertiary">
                {formatDuration(entry.durationMs)} · {formatSize(entry.sizeBytes)}
              </span>
              <span className="text-[11px] text-text-muted">
                {t("overlay:broadcast.recording.events", { count: entry.events })}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={entry.active}
                onClick={() => void play(entry.id)}
              >
                <Play className="h-3.5 w-3.5" aria-hidden />
                {t("overlay:broadcast.recording.replay")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-accent-danger"
                disabled={entry.active}
                onClick={() =>
                  void deleteRecording(entry.id).then(async () => {
                    addToast({
                      type: "success",
                      title: t("overlay:broadcast.recording.deleted"),
                    });
                    await refresh();
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}
