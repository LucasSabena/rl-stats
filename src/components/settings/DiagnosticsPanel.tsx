import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/Button";
import { useUIStore } from "@/stores/uiStore";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Stethoscope, FolderOpen, Copy, Download, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiagnosticsInfo {
  logDirectory: string;
  appVersion: string;
  os: string;
  arch: string;
}

const COPY_FEEDBACK_MS = 2000;

export function DiagnosticsPanel() {
  const { t } = useTranslation(["settings", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const [copied, setCopied] = useState(false);

  const [info, setInfo] = useState<DiagnosticsInfo | null>(null);

  const ensureInfo = useCallback(async (): Promise<DiagnosticsInfo | null> => {
    if (info) return info;
    try {
      const fetched = await invoke<DiagnosticsInfo>("get_diagnostics_info");
      setInfo(fetched);
      return fetched;
    } catch {
      return null;
    }
  }, [info]);

  const handleOpenFolder = useCallback(async () => {
    try {
      await invoke("open_log_folder");
    } catch {
      addToast({
        type: "error",
        title: t("settings:diagnostics.openError"),
      });
    }
  }, [addToast, t]);

  const handleCopy = useCallback(async () => {
    try {
      const [details, logs] = await Promise.all([
        ensureInfo(),
        invoke<string>("get_recent_logs", { maxBytes: 120_000 }),
      ]);
      const payload = [
        `RL Stats ${details?.appVersion ?? "?"} (${details?.os ?? "?"}/${details?.arch ?? "?"})`,
        `Logs: ${details?.logDirectory ?? "?"}`,
        "",
        logs,
      ].join("\n");
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      addToast({
        type: "error",
        title: t("settings:diagnostics.copyError"),
      });
    }
  }, [addToast, ensureInfo, t]);

  const handleDownload = useCallback(async () => {
    try {
      const logs = await invoke<string>("get_recent_logs", {
        maxBytes: 2_000_000,
      });
      const blob = new Blob([logs || "No logs yet."], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.href = url;
      link.download = `rl-stats-logs-${stamp}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      addToast({
        type: "error",
        title: t("settings:diagnostics.downloadError"),
      });
    }
  }, [addToast, t]);

  const handleOpenGithub = useCallback(async () => {
    try {
      await openUrl("https://github.com/LucasSabena/rl-stats/issues");
    } catch {
      // Ignore — the browser may be blocked by policy.
    }
  }, []);

  return (
    <div className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-purple/10">
          <Stethoscope size={20} className="text-accent-purple" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">
            {t("settings:diagnostics.title")}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {t("settings:diagnostics.description")}
          </p>
          {info && (
            <p className="mt-1 text-[11px] text-text-tertiary">
              {info.appVersion} · {info.os}/{info.arch}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={FolderOpen}
              onClick={() => void handleOpenFolder()}
            >
              {t("settings:diagnostics.openFolder")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={copied ? Check : Copy}
              onClick={() => void handleCopy()}
              className={cn(copied && "text-accent-primary")}
            >
              {copied
                ? t("settings:diagnostics.copied")
                : t("settings:diagnostics.copy")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={Download}
              onClick={() => void handleDownload()}
            >
              {t("settings:diagnostics.download")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void handleOpenGithub()}>
              {t("settings:diagnostics.reportIssue")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
