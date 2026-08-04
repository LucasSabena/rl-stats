import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation, Trans } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { RadioTower, Wifi, WifiOff, Copy, Check, Monitor, ExternalLink } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverlayServerStatus {
  running: boolean;
  port: number;
  connected_clients: number;
}

interface OverlayUrl {
  name: string;
  url: string;
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OverlayStreaming() {
  const { t } = useTranslation(["overlay", "common"]);
  const addToast = useUIStore((s) => s.addToast);

  const [status, setStatus] = useState<OverlayServerStatus | null>(null);
  const [urls, setUrls] = useState<OverlayUrl[]>([]);
  const [port, setPort] = useState<number>(DEFAULT_PORT);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // Server may not be responding — not an error worth surfacing as a toast
      return null;
    }
  }, []);

  const fetchUrls = useCallback(async () => {
    try {
      const list = await invoke<OverlayUrl[]>("get_overlay_urls");
      setUrls(list);
    } catch {
      // Silently ignore — overlay URLs aren't critical
    }
  }, []);

  // -----------------------------------------------------------------------
  // Polling
  // -----------------------------------------------------------------------

  useEffect(() => {
    // Initial fetch
    const init = async () => {
      const current = await fetchStatus();
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
      // Stop polling when server is stopped
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

  // Clean up copy timer on unmount
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
      addToast({ type: "success", title: t("overlay:streaming.toasts.stopped"), message: t("overlay:streaming.toasts.stoppedMessage") });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : typeof err === "string" ? err : t("overlay:streaming.toasts.unknownError");
      addToast({ type: "error", title: t("overlay:streaming.toasts.stopError"), message });
    } finally {
      setIsToggling(false);
    }
  }, [addToast, t]);

  const handleCopy = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);

      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedUrl(null), COPY_FEEDBACK_MS);
    } catch {
      addToast({ type: "error", title: t("overlay:streaming.toasts.copyError"), message: t("overlay:streaming.toasts.copyErrorMessage") });
    }
  }, [addToast, t]);

  const handlePortChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    const parsed = raw === "" ? DEFAULT_PORT : Number(raw);
    // Clamp to valid port range
    setPort(Math.max(1, Math.min(65535, parsed)));
  }, []);

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------

  const connectedClients = status?.connected_clients ?? 0;
  const activePort = status?.port ?? port;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2.5">
            {/* Status dot */}
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

              {/* Tooltip */}
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
        </div>

        {/* Toggle button */}
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

      {/* ── Connected clients + URLs (shown when running) ── */}
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

          {/* URL list */}
          {urls.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-text-secondary">{t("overlay:streaming.overlayUrls")}</p>
              <div className="space-y-2">
                {urls.map((item) => {
                  const isCopied = copiedUrl === item.url;
                  return (
                    <div
                      key={item.url}
                      className="group/url flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-base px-3.5 py-2.5 transition-all duration-200 hover:border-border-default"
                    >
                      <span className="flex-1 min-w-0 text-xs font-semibold text-text-secondary truncate">
                        {item.name}
                      </span>
                      <code className="max-w-[200px] truncate text-[11px] font-mono text-text-tertiary select-all">
                        {item.url}
                      </code>
                      <Tooltip content={isCopied ? t("overlay:streaming.copiedTooltipDone") : t("overlay:streaming.copyTooltip")}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(item.url)}
                          leftIcon={isCopied ? Check : Copy}
                          className={cn(
                            "h-7 px-2 shrink-0",
                            isCopied && "text-accent-primary"
                          )}
                        >
                          {isCopied ? t("overlay:streaming.copied") : t("overlay:streaming.copy")}
                        </Button>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fallback when no URLs yet */}
          {urls.length === 0 && (
            <p className="text-xs text-text-muted italic">{t("overlay:streaming.loadingUrls")}</p>
          )}
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
