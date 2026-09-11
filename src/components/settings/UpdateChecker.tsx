import { useEffect, useRef, useState } from "react";
import { check, type Update, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { useUIStore } from "@/stores/uiStore";
import { RefreshCw, Download, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function UpdateChecker() {
  const { t } = useTranslation(["settings", "common"]);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [installing, setInstalling] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const cancelledRef = useRef(false);
  const addToast = useUIStore((state) => state.addToast);

  useEffect(() => {
    void (async () => {
      try {
        const v = await getVersion();
        setCurrentVersion(v);
      } catch {
        setCurrentVersion(t("settings:update.unknownVersion"));
      }
    })();
  }, [t]);

  function handleCancel() {
    cancelledRef.current = true;
    // Closing the resource aborts the in-flight download; the promise rejects
    // and the catch below recognizes the cancellation flag.
    void update?.close();
  }

  async function downloadAndInstall(updateObj: Update) {
    cancelledRef.current = false;
    setDownloading(true);
    setInstalling(false);
    setDownloadProgress(0);
    try {
      let contentLength = 0;
      let downloaded = 0;
      // Separate download from install: a failed install can be retried
      // without re-downloading the package.
      await updateObj.download((event: DownloadEvent) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            setDownloadProgress(0);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress(Math.min(Math.round((downloaded / contentLength) * 100), 99));
            } else {
              setDownloadProgress((prev) => (prev < 90 ? prev + 5 : prev));
            }
            break;
          case "Finished":
            setDownloadProgress(100);
            break;
        }
      });

      if (cancelledRef.current) {
        addToast({ type: "info", title: t("settings:update.toasts.downloadCancelled") });
        return;
      }

      setDownloading(false);
      setInstalling(true);
      await updateObj.install();
      addToast({ type: "success", title: t("settings:update.toasts.installed") });
      await relaunch();
    } catch (e) {
      if (cancelledRef.current) {
        addToast({ type: "info", title: t("settings:update.toasts.downloadCancelled") });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      const friendly = msg.includes("signature")
        ? t("settings:update.errors.invalidSignature")
        : msg.includes("404") || msg.includes("not found")
          ? t("settings:update.errors.updateNotFound")
          : msg.includes("connection") || msg.includes("network") || msg.includes("fetch")
            ? t("settings:update.errors.connection")
            : msg;
      addToast({ type: "error", title: t("settings:update.toasts.downloadError.title"), message: friendly });
      setError(friendly);
    } finally {
      setDownloading(false);
      setInstalling(false);
    }
  }

  async function handleCheck() {
    setChecking(true);
    setError(null);
    try {
      const result = await check();
      setUpdate(result);
      setError(null);
      if (result) {
        addToast({
          type: "info",
          title: t("settings:update.toasts.available.title", { version: result.version }),
          message: result.body ?? "",
        });
      } else {
        setUpdate(null);
        addToast({ type: "success", title: t("settings:update.toasts.upToDate") });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[UpdateChecker] Raw error:", e);
      const friendly = msg.includes("signature")
        ? t("settings:update.errors.signatureMismatch")
        : msg.includes("404") || msg.includes("not found")
          ? t("settings:update.errors.latestJsonNotFound")
          : msg.includes("connection") || msg.includes("network") || msg.includes("fetch")
            ? t("settings:update.errors.connectionWithDetail", { detail: msg })
            : msg;
      setUpdate(null);
      setError(friendly);
      addToast({ type: "error", title: t("settings:update.toasts.checkError.title"), message: friendly });
    } finally {
      setChecking(false);
    }
  }

  const isBusy = checking || downloading || installing;
  const buttonLabel = installing
    ? t("settings:update.installing")
    : downloading
      ? t("settings:update.downloading", { progress: downloadProgress })
      : checking
        ? t("settings:update.searching")
        : t("settings:update.checkButton");

  return (
    <div className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-elevated transition-colors group-hover:bg-bg-elevated/80">
            <RefreshCw size={16} className={cn("text-text-muted transition-colors", isBusy && "animate-spin text-accent-primary")} />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">{t("settings:update.title")}</p>
            <p className="text-xs text-text-muted">
              {currentVersion ? t("settings:update.installedVersion", { version: currentVersion }) : t("settings:update.loadingVersion")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {downloading && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={X}
              onClick={handleCancel}
            >
              {t("common:buttons.cancel")}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            leftIcon={downloading ? Download : undefined}
            isLoading={isBusy}
            onClick={handleCheck}
            disabled={isBusy}
          >
            {buttonLabel}
          </Button>
        </div>
      </div>

      {error && !isBusy && (
        <div className="mt-4 rounded-lg border border-accent-danger/30 bg-accent-danger/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-danger/10">
              <AlertCircle size={14} className="text-accent-danger" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-accent-danger">{t("settings:update.errorTitle")}</p>
              <p className="mt-1 text-xs text-text-secondary break-words whitespace-pre-line">{error}</p>
              <p className="mt-2 text-[11px] text-text-tertiary">
                {t("settings:update.commonCauses")}
              </p>
              <Button
                variant="primary"
                size="sm"
                className="mt-3"
                leftIcon={RefreshCw}
                onClick={handleCheck}
              >
                {t("common:buttons.retry")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {update && !isBusy && !error && (
        <div className="mt-4 rounded-lg border border-accent-primary/20 bg-accent-primary/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-primary/10">
              <Download size={12} className="text-accent-primary" />
            </div>
            <p className="text-sm font-semibold text-accent-primary">{t("settings:update.versionAvailable", { version: update.version })}</p>
          </div>
          {update.body && <p className="mb-3 text-xs text-text-secondary">{update.body}</p>}
          <Button
            variant="primary"
            size="sm"
            leftIcon={Download}
            onClick={() => downloadAndInstall(update)}
          >
            {t("settings:update.download")}
          </Button>
        </div>
      )}
    </div>
  );
}