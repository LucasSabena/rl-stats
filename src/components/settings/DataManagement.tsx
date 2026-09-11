import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  exportDataJson,
  importDataJson,
  getStorageStats,
  clearAllData,
  getSettings,
  setSettings,
  createCloudBackup,
} from "@/lib/api";
import { pullCurrentProfileFromCloud, wipeCurrentProfileFromCloud } from "@/lib/cloudSync";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/uiStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload, Trash2, Database, FolderOpen, CloudDownload, CalendarClock } from "lucide-react";

async function invalidateDataQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["matches"] }),
    queryClient.invalidateQueries({ queryKey: ["match-detail"] }),
    queryClient.invalidateQueries({ queryKey: ["analytics"] }),
    queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    queryClient.invalidateQueries({ queryKey: ["rollups"] }),
    queryClient.invalidateQueries({ queryKey: ["insights"] }),
    queryClient.invalidateQueries({ queryKey: ["storageStats"] }),
    queryClient.invalidateQueries({ queryKey: ["tracker-profile"] }),
  ]);
}

export function DataManagement() {
  const { t } = useTranslation(["settings", "common"]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [savedRetention, setSavedRetention] = useState<number | null>(null);
  const [isSavingRetention, setIsSavingRetention] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addToast = useUIStore((state) => state.addToast);
  const queryClient = useQueryClient();

  const { data: stats, isError, refetch } = useQuery({
    queryKey: ["storageStats"],
    queryFn: getStorageStats,
  });

  useEffect(() => {
    let cancelled = false;
    void getSettings().then((settings) => {
      if (cancelled) return;
      const days = settings.dataRetentionDays ?? 90;
      setRetentionDays(days);
      setSavedRetention(days);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleExport() {
    try {
      const json = await exportDataJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.href = url;
      link.download = `rl-stats-backup-${stamp}.json`;
      link.click();
      URL.revokeObjectURL(url);
      addToast({ type: "success", title: t("settings:data.exportSuccess"), message: t("settings:data.exportSuccessMessage") });
    } catch {
      addToast({ type: "error", title: t("settings:data.exportError") });
    }
  }

  async function handleImportFile(file: File) {
    try {
      setIsImporting(true);
      const content = await file.text();
      await importDataJson(content);
      addToast({ type: "success", title: t("settings:data.importSuccess"), message: t("settings:data.importSuccessMessage", { file: file.name }) });
      await invalidateDataQueries(queryClient);
    } catch {
      addToast({ type: "error", title: t("settings:data.importError") });
    } finally {
      setIsImporting(false);
    }
  }

  async function handleClear() {
    try {
      // Snapshot first: this is the most destructive action in the app.
      try {
        await createCloudBackup();
      } catch {
        // Backup is best-effort.
      }
      await clearAllData();

      // Remove the cloud copy too, otherwise the next pull would restore
      // everything that was just deleted.
      let cloudWiped = true;
      try {
        cloudWiped = await wipeCurrentProfileFromCloud();
      } catch {
        cloudWiped = false;
      }

      addToast({
        type: "success",
        title: t("settings:data.dataDeleted"),
        message: cloudWiped
          ? t("settings:data.dataDeletedCloud")
          : t("settings:data.dataDeletedLocalOnly"),
      });
      await invalidateDataQueries(queryClient);
      setConfirmOpen(false);
    } catch {
      addToast({ type: "error", title: t("settings:data.deleteError") });
    }
  }

  async function handlePull() {
    setIsPulling(true);
    try {
      const result = await pullCurrentProfileFromCloud();
      if (result.skippedReason) {
        addToast({
          type: "info",
          title: t("settings:data.pullSkipped"),
          message: t(`settings:data.pullSkippedReasons.${result.skippedReason}`),
        });
      } else if (result.applied === 0) {
        addToast({
          type: "info",
          title: t("settings:data.pullUpToDate"),
          message: t("settings:data.pullUpToDateMessage"),
        });
      } else {
        addToast({
          type: "success",
          title: t("settings:data.pullSuccess"),
          message: t("settings:data.pullSuccessMessage", {
            applied: result.applied,
            skipped: result.skipped,
          }),
        });
        await invalidateDataQueries(queryClient);
      }
    } catch {
      addToast({ type: "error", title: t("settings:data.pullError") });
    } finally {
      setIsPulling(false);
    }
  }

  async function handleSaveRetention() {
    if (retentionDays === null) return;
    setIsSavingRetention(true);
    try {
      const settings = await getSettings();
      await setSettings({ ...settings, dataRetentionDays: retentionDays });
      setSavedRetention(retentionDays);
      addToast({
        type: "success",
        title: t("settings:data.retentionSaved"),
        message:
          retentionDays > 0
            ? t("settings:data.retentionSavedMessage", { days: retentionDays })
            : t("settings:data.retentionUnlimited"),
      });
      await invalidateDataQueries(queryClient);
    } catch {
      addToast({ type: "error", title: t("settings:data.retentionError") });
    } finally {
      setIsSavingRetention(false);
    }
  }

  const retentionDirty =
    retentionDays !== null && savedRetention !== null && retentionDays !== savedRetention;

  return (
    <div className="space-y-4">
      {/* ── Storage Stats Card ── */}
      <div className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-primary-subtle transition-colors group-hover:bg-accent-primary/20">
            <Database size={20} className="text-accent-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">{t("settings:data.title")}</p>
            {isError ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-accent-danger">
                  {t("settings:data.statsError")}
                </p>
                <Button variant="ghost" size="sm" onClick={() => void refetch()}>
                  {t("common:buttons.retry")}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-text-secondary">
                {stats
                  ? t("settings:data.statsTemplate", { totalMatches: stats.totalMatches, size: (stats.databaseSizeBytes / 1024 / 1024).toFixed(1) })
                  : t("settings:data.loading")}
              </p>
            )}
            {stats?.dbPath && (
              <p className="mt-1 truncate text-[11px] font-mono text-text-tertiary">
                {stats.dbPath}
              </p>
            )}
          </div>
          {stats?.dbPath && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigator.clipboard.writeText(stats.dbPath ?? "")}
              className="shrink-0"
            >
              <FolderOpen size={14} className="mr-1" />
              {t("settings:data.copyPath")}
            </Button>
          )}
        </div>
      </div>

      {/* ── Retention Card ── */}
      <div className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-info/10">
            <CalendarClock size={20} className="text-accent-info" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              {t("settings:data.retention")}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {t("settings:data.retentionHint")}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                aria-label={t("settings:data.retention")}
                value={retentionDays ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setRetentionDays(raw === "" ? 0 : Math.min(3650, Number(raw)));
                }}
                className="w-20 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-center text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
                placeholder="90"
              />
              <span className="text-xs text-text-muted">
                {t("settings:data.retentionUnit")}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleSaveRetention()}
                disabled={!retentionDirty}
                isLoading={isSavingRetention}
              >
                {t("common:buttons.save")}
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-text-tertiary">
              {t("settings:data.retentionZero")}
            </p>
          </div>
        </div>
      </div>

      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        aria-label={t("settings:data.import")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleImportFile(file);
          }
          event.target.value = "";
        }}
      />

      {/* ── Action Buttons ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant="secondary" leftIcon={Download} onClick={handleExport} className="justify-center">
          {t("settings:data.export")}
        </Button>
        <Button variant="secondary" leftIcon={Upload} onClick={() => fileInputRef.current?.click()} isLoading={isImporting} className="justify-center">
          {t("settings:data.import")}
        </Button>
        <Button
          variant="secondary"
          leftIcon={CloudDownload}
          onClick={() => void handlePull()}
          isLoading={isPulling}
          className="justify-center"
        >
          {t("settings:data.pull")}
        </Button>
        <Button variant="danger" leftIcon={Trash2} onClick={() => setConfirmOpen(true)} className="justify-center">
          {t("settings:data.deleteAll")}
        </Button>
      </div>

      {/* ── Confirmation Modal ── */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("settings:data.deleteModalTitle")}
        description={t("settings:data.deleteModalDescription")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              {t("settings:data.cancel")}
            </Button>
            <Button variant="danger" onClick={handleClear}>
              {t("settings:data.deleteAll")}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">{t("settings:data.deleteModalWarning")}</p>
      </Modal>
    </div>
  );
}
