import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation, Trans } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import {
  RadioTower,
  Wifi,
  WifiOff,
  Copy,
  Check,
  Monitor,
  ExternalLink,
  ChevronDown,
  Eye,
  Bot,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverlayServerStatus {
  running: boolean;
  port: number;
  connected_clients: number;
  token?: string;
}

interface OverlayUrl {
  id: string;
  name: string;
  description: string;
  url: string;
}

interface SceneConfig {
  title: string;
  blueName: string;
  orangeName: string;
  series: number | null;
  hide: string[];
  alertTypes: string[];
}

const HIDE_MODULES = ["scorebug", "rosters", "ball", "series"] as const;
const ALERT_TYPES = [
  "Goal",
  "Save",
  "Demo",
  "HatTrick",
  "EpicSave",
  "AerialGoal",
] as const;

const STREAMERBOT_EVENTS = [
  "state",
  "goal",
  "statfeed",
  "ball_hit",
  "clock",
  "match_started",
  "match_ended",
  "countdown_begin",
  "replay_start",
  "replay_end",
  "match_paused",
  "match_unpaused",
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 9528;
const POLL_INTERVAL_MS = 3000;
const COPY_FEEDBACK_MS = 2000;

const inputClass = cn(
  "rounded-lg border bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-all duration-200",
  "border-border-subtle focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20",
  "hover:border-border-highlight"
);

function defaultScene(): SceneConfig {
  return {
    title: "",
    blueName: "",
    orangeName: "",
    series: null,
    hide: [],
    alertTypes: [...ALERT_TYPES],
  };
}

function toScenePayload(scene: SceneConfig) {
  return {
    title: scene.title,
    blueName: scene.blueName,
    orangeName: scene.orangeName,
    blueLogo: "",
    orangeLogo: "",
    series: scene.series,
    hide: scene.hide.join(","),
    alertTypes: scene.alertTypes.join(","),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OverlayStreaming() {
  const { t } = useTranslation(["overlay", "common"]);
  const addToast = useUIStore((s) => s.addToast);

  const [status, setStatus] = useState<OverlayServerStatus | null>(null);
  const [urls, setUrls] = useState<OverlayUrl[]>([]);
  const [port, setPort] = useState<number>(DEFAULT_PORT);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [scene, setScene] = useState<SceneConfig>(defaultScene);
  const [showScene, setShowScene] = useState(false);
  const [showStreamerbot, setShowStreamerbot] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const isRunning = status?.running ?? false;

  // -----------------------------------------------------------------------
  // Fetch helpers
  // -----------------------------------------------------------------------

  const fetchStatus = useCallback(async () => {
    try {
      const current = await invoke<OverlayServerStatus>("get_overlay_server_status");
      setStatus(current);
      return current;
    } catch {
      return null;
    }
  }, []);

  const fetchUrls = useCallback(async (sceneOverride?: SceneConfig) => {
    try {
      const list = await invoke<OverlayUrl[]>("get_overlay_urls", {
        config: toScenePayload(sceneOverride ?? sceneRef.current),
      });
      setUrls(list);
    } catch {
      // Silently ignore — overlay URLs aren't critical
    }
  }, []);

  const refreshUrls = useCallback(async () => {
    await fetchUrls();
  }, [fetchUrls]);

  // -----------------------------------------------------------------------
  // Polling
  // -----------------------------------------------------------------------

  useEffect(() => {
    const init = async () => {
      const current = await fetchStatus();
      // Use the persisted port when the server is stopped so the setting
      // survives app restarts.
      try {
        const settings = await invoke<{ overlay_server_port?: number }>(
          "get_settings_cmd"
        );
        if (settings.overlay_server_port) {
          setPort(settings.overlay_server_port);
        }
      } catch {
        // Defaults are fine.
      }
      if (current?.running) {
        await fetchUrls();
      }
      setInitialLoadDone(true);
    };
    init();

    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (isRunning && initialLoadDone) {
      const poll = async () => {
        if (cancelled) return;
        const current = await fetchStatus();
        if (cancelled) return;
        if (current?.running) {
          await fetchUrls();
          if (!cancelled) {
            pollTimeoutRef.current = setTimeout(() => {
              void poll();
            }, POLL_INTERVAL_MS);
          }
        }
      };

      void poll();
    } else {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    }

    return () => {
      cancelled = true;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [isRunning, initialLoadDone, fetchStatus, fetchUrls]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleStart = useCallback(async () => {
    setIsToggling(true);
    try {
      const result = await invoke<OverlayServerStatus>("start_overlay_server", { port });
      setStatus(result);
      await fetchUrls();
      addToast({ type: "success", title: t("overlay:streaming.toasts.started"), message: t("overlay:streaming.toasts.startedMessage", { port }) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : typeof err === "string" ? err : t("overlay:streaming.toasts.unknownError");
      addToast({ type: "error", title: t("overlay:streaming.toasts.startError"), message });
    } finally {
      setIsToggling(false);
    }
  }, [port, addToast, fetchUrls, t]);

  const handleStop = useCallback(async () => {
    setIsToggling(true);
    try {
      await invoke("stop_overlay_server");
      setStatus(null);
      setUrls([]);
      setPreviewId(null);
      addToast({ type: "success", title: t("overlay:streaming.toasts.stopped"), message: t("overlay:streaming.toasts.stoppedMessage") });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : typeof err === "string" ? err : t("overlay:streaming.toasts.unknownError");
      addToast({ type: "error", title: t("overlay:streaming.toasts.stopError"), message });
    } finally {
      setIsToggling(false);
    }
  }, [addToast, t]);

  const handleCopy = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);

      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedKey(null), COPY_FEEDBACK_MS);
    } catch {
      addToast({ type: "error", title: t("overlay:streaming.toasts.copyError"), message: t("overlay:streaming.toasts.copyErrorMessage") });
    }
  }, [addToast, t]);

  const handlePortChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    const parsed = raw === "" ? DEFAULT_PORT : Number(raw);
    setPort(Math.max(1, Math.min(65535, parsed)));
  }, []);

  const updateScene = useCallback((patch: Partial<SceneConfig>) => {
    setScene((prev) => {
      const next = { ...prev, ...patch };
      return next;
    });
  }, []);

  const toggleListValue = useCallback(
    (field: "hide" | "alertTypes", value: string) => {
      setScene((prev) => {
        const current = prev[field];
        const next = current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current, value];
        return { ...prev, [field]: next };
      });
    },
    []
  );

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------

  const connectedClients = status?.connected_clients ?? 0;
  const activePort = status?.port ?? port;
  const token = status?.token ?? "";
  const wsUrl = isRunning
    ? `ws://127.0.0.1:${activePort}/ws${token ? `?token=${token}` : ""}`
    : "";
  const streamerbotJson = isRunning
    ? JSON.stringify(
        {
          url: wsUrl,
          events: STREAMERBOT_EVENTS,
          sample: { type: "state", data: { scoreBlue: 0, scoreOrange: 0, timeRemaining: 300 } },
        },
        null,
        2
      )
    : "";
  const previewUrl = urls.find((item) => item.id === previewId)?.url ?? null;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full rounded-full",
                  isRunning ? "bg-accent-primary" : "bg-text-muted"
                )}
              />
              {isRunning && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-primary opacity-75" />
              )}
            </span>

            <div className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
              isRunning ? "bg-accent-primary-subtle" : "bg-bg-elevated"
            )}>
              <RadioTower size={18} className={isRunning ? "text-accent-primary" : "text-text-muted"} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-text-primary">
                {isRunning ? t("overlay:streaming.activeTitle") : t("overlay:streaming.title")}
              </h4>

              <Tooltip content={t("overlay:streaming.tooltip")}>
                <Monitor size={13} className="mt-0.5 cursor-help text-text-muted hover:text-text-secondary transition-colors" />
              </Tooltip>
            </div>
          </div>

          <p className="mt-2 text-xs text-text-muted">
            {isRunning
              ? `${t("overlay:streaming.serverRunning", { port: activePort })} ${connectedClients > 0 ? t("overlay:streaming.clientsConnected", { count: connectedClients }) : t("overlay:streaming.waitingConnections")}`
              : t("overlay:streaming.description")}
          </p>
          {isRunning && (
            <p className="mt-1 text-[11px] text-text-tertiary">
              {t("overlay:streaming.autostartHint")}
            </p>
          )}
        </div>

        <Button
          variant={isRunning ? "secondary" : "primary"}
          size="sm"
          onClick={isRunning ? handleStop : handleStart}
          isLoading={isToggling}
          disabled={isToggling}
          leftIcon={isRunning ? WifiOff : Wifi}
          className="shrink-0"
        >
          {isRunning ? t("overlay:streaming.stop") : t("overlay:streaming.startStreaming")}
        </Button>
      </div>

      {/* ── Port input (shown when stopped) ── */}
      {!isRunning && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-border-subtle bg-bg-base/50 px-4 py-3">
          <label htmlFor="overlay-port" className="text-xs font-medium text-text-secondary shrink-0">
            {t("overlay:streaming.port")}
          </label>
          <input
            id="overlay-port"
            type="text"
            inputMode="numeric"
            value={port}
            onChange={handlePortChange}
            disabled={isToggling}
            className={cn(inputClass, "w-24 text-center")}
            placeholder="9528"
          />
          <p className="text-xs text-text-muted">{t("overlay:streaming.portDefault")}</p>
        </div>
      )}

      {/* ── Running content ── */}
      {isRunning && (
        <div className="mt-5 space-y-4">
          {/* Client count */}
          <div className="flex items-center gap-2 rounded-lg bg-bg-base px-3 py-2">
            <Wifi
              size={14}
              className={cn(connectedClients > 0 ? "text-accent-primary" : "text-text-muted")}
            />
            <span className="text-xs text-text-secondary">
              {t("overlay:streaming.connectedClients")}{" "}
              <span className={cn("font-semibold", connectedClients > 0 ? "text-accent-primary" : "text-text-tertiary")}>
                {connectedClients}
              </span>
            </span>
          </div>

          {/* ── Scene customization ── */}
          <div className="rounded-lg border border-border-subtle bg-bg-base/40">
            <button
              type="button"
              onClick={() => setShowScene((v) => !v)}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
            >
              <span className="text-xs font-semibold tracking-wide text-text-secondary">
                {t("overlay:streaming.scene.title")}
              </span>
              <ChevronDown
                size={14}
                className={cn("text-text-muted transition-transform", showScene && "rotate-180")}
              />
            </button>

            {showScene && (
              <div className="space-y-3 border-t border-border-subtle px-3.5 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-[11px] text-text-muted">
                    {t("overlay:streaming.scene.matchTitle")}
                    <input
                      className={cn(inputClass, "w-full")}
                      value={scene.title}
                      onChange={(e) => updateScene({ title: e.target.value })}
                      placeholder={t("overlay:streaming.scene.matchTitlePlaceholder")}
                    />
                  </label>
                  <label className="space-y-1 text-[11px] text-text-muted">
                    {t("overlay:streaming.scene.series")}
                    <input
                      type="text"
                      inputMode="numeric"
                      className={cn(inputClass, "w-full")}
                      value={scene.series ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        updateScene({ series: raw === "" ? null : Math.min(9, Number(raw)) });
                      }}
                      placeholder="0"
                    />
                  </label>
                  <label className="space-y-1 text-[11px] text-text-muted">
                    {t("overlay:streaming.scene.blueName")}
                    <input
                      className={cn(inputClass, "w-full")}
                      value={scene.blueName}
                      onChange={(e) => updateScene({ blueName: e.target.value })}
                      placeholder="BLUE"
                    />
                  </label>
                  <label className="space-y-1 text-[11px] text-text-muted">
                    {t("overlay:streaming.scene.orangeName")}
                    <input
                      className={cn(inputClass, "w-full")}
                      value={scene.orangeName}
                      onChange={(e) => updateScene({ orangeName: e.target.value })}
                      placeholder="ORANGE"
                    />
                  </label>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-text-muted">
                    {t("overlay:streaming.scene.hideModules")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {HIDE_MODULES.map((module) => (
                      <button
                        key={module}
                        type="button"
                        onClick={() => toggleListValue("hide", module)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                          scene.hide.includes(module)
                            ? "border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
                            : "border-border-subtle text-text-muted hover:text-text-secondary"
                        )}
                      >
                        {t(`overlay:streaming.scene.modules.${module}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-text-muted">
                    {t("overlay:streaming.scene.alertTypes")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALERT_TYPES.map((alert) => (
                      <button
                        key={alert}
                        type="button"
                        onClick={() => toggleListValue("alertTypes", alert)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                          scene.alertTypes.includes(alert)
                            ? "border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
                            : "border-border-subtle text-text-muted hover:text-text-secondary"
                        )}
                      >
                        {t(`overlay:streaming.alerts.${alert}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <Button size="sm" variant="secondary" onClick={() => void refreshUrls()}>
                  {t("overlay:streaming.scene.apply")}
                </Button>
              </div>
            )}
          </div>

          {/* URL list */}
          {urls.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-text-secondary">{t("overlay:streaming.overlayUrls")}</p>
              <div className="space-y-2">
                {urls.map((item) => {
                  const isCopied = copiedKey === item.id;
                  return (
                    <div
                      key={item.id}
                      className="group/url rounded-lg border border-border-subtle bg-bg-base px-3.5 py-2.5 transition-all duration-200 hover:border-border-default"
                    >
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-text-secondary">
                            {item.name}
                          </p>
                          <p className="truncate text-[11px] text-text-tertiary">
                            {item.description}
                          </p>
                        </div>
                        <Tooltip content={t("overlay:streaming.preview")}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreviewId((id) => (id === item.id ? null : item.id))}
                            leftIcon={Eye}
                            className={cn("h-7 px-2 shrink-0", previewId === item.id && "text-accent-primary")}
                          >
                            {""}
                          </Button>
                        </Tooltip>
                        <Tooltip content={isCopied ? t("overlay:streaming.copiedTooltipDone") : t("overlay:streaming.copyTooltip")}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleCopy(item.id, item.url)}
                            leftIcon={isCopied ? Check : Copy}
                            className={cn("h-7 px-2 shrink-0", isCopied && "text-accent-primary")}
                          >
                            {isCopied ? t("overlay:streaming.copied") : t("overlay:streaming.copy")}
                          </Button>
                        </Tooltip>
                      </div>
                      <code className="mt-1.5 block truncate text-[10px] font-mono text-text-tertiary select-all">
                        {item.url}
                      </code>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {urls.length === 0 && (
            <p className="text-xs text-text-muted italic">{t("overlay:streaming.loadingUrls")}</p>
          )}

          {/* Preview */}
          {previewUrl && (
            <div className="overflow-hidden rounded-lg border border-border-subtle bg-black">
              <div className="flex items-center justify-between border-b border-border-subtle bg-bg-base px-3 py-1.5">
                <span className="text-[11px] font-semibold text-text-secondary">
                  {t("overlay:streaming.previewTitle")}
                </span>
                <span className="text-[10px] text-text-muted">
                  {t("overlay:streaming.previewHint")}
                </span>
              </div>
              <iframe
                key={previewUrl}
                src={previewUrl}
                title={t("overlay:streaming.previewTitle")}
                className="h-40 w-full bg-black/60"
              />
            </div>
          )}

          {/* Streamer.bot */}
          <div className="rounded-lg border border-border-subtle bg-bg-base/40">
            <button
              type="button"
              onClick={() => setShowStreamerbot((v) => !v)}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-text-secondary">
                <Bot size={13} />
                {t("overlay:streaming.streamerbot.title")}
              </span>
              <ChevronDown
                size={14}
                className={cn("text-text-muted transition-transform", showStreamerbot && "rotate-180")}
              />
            </button>
            {showStreamerbot && (
              <div className="space-y-2 border-t border-border-subtle px-3.5 py-3">
                <p className="text-[11px] text-text-muted">
                  {t("overlay:streaming.streamerbot.description")}
                </p>
                <pre className="max-h-48 overflow-auto rounded-md bg-bg-base p-2.5 text-[10px] leading-relaxed text-text-secondary">
                  {streamerbotJson}
                </pre>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleCopy("streamerbot", streamerbotJson)}
                  leftIcon={copiedKey === "streamerbot" ? Check : Copy}
                >
                  {copiedKey === "streamerbot"
                    ? t("overlay:streaming.copied")
                    : t("overlay:streaming.streamerbot.copyJson")}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Info box: how to use with OBS ── */}
      <div className="mt-5 rounded-lg border border-accent-info/20 bg-accent-info/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-info/10">
            <ExternalLink size={12} className="text-accent-info" />
          </div>
          <p className="text-xs font-semibold text-accent-info">{t("overlay:streaming.howToOBS")}</p>
        </div>
        <ol className="list-decimal pl-5 space-y-1 text-xs text-text-tertiary">
          <li>{t("overlay:streaming.step1")}</li>
          <li><Trans i18nKey="overlay:streaming.step2" components={{ bold: <strong className="text-text-secondary" /> }} /></li>
          <li><Trans i18nKey="overlay:streaming.step3" components={{ bold: <strong className="text-text-secondary" /> }} /></li>
          <li>{t("overlay:streaming.step4")}</li>
          <li>{t("overlay:streaming.step5", { port: activePort })}</li>
        </ol>
      </div>
    </div>
  );
}
