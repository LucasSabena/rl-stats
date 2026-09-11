import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  exportDataJson,
  importDataJson,
  getStorageStats,
  clearAllData,
  getSettings,
  setDataRetention,
  previewDataRetention,
  applyDataRetention,
  listDatabaseBackups,
  restoreDatabaseBackup,
  createCloudBackup,
  type DatabaseBackupInfo,
  type RetentionPreview,
} from "@/lib/api";
import { pullCurrentProfileFromCloud, wipeCurrentProfileFromCloud } from "@/lib/cloudSync";
import { useActiveProfile } from "@/hooks/useProfiles";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { useUIStore } from "@/stores/uiStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload, Trash2, Database, FolderOpen, CloudDownload, CalendarClock, RotateCcw } from "lucide-react";

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
  const [retentionDays, setRetentionDays] = useState<number>(365);
  const [savedRetention, setSavedRetention] = useState<number>(0);
  const [retentionConfigureOpen, setRetentionConfigureOpen] = useState(false);
  const [retentionFinalOpen, setRetentionFinalOpen] = useState(false);
  const [retentionPreview, setRetentionPreview] = useState<RetentionPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isApplyingRetention, setIsApplyingRetention] = useState(false);
  const [backups, setBackups] = useState<DatabaseBackupInfo[]>([]);
  const [restoreTarget, setRestoreTarget] = useState<DatabaseBackupInfo | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addToast = useUIStore((state) => state.addToast);
  const queryClient = useQueryClient();
  const { data: activeProfile } = useActiveProfile();

  const { data: stats, isError, refetch } = useQuery({
    queryKey: ["storageStats"],
    queryFn: getStorageStats,
  });

  const refreshBackups = async () => {
    try {
      setBackups(await listDatabaseBackups());
    } catch {
      // Backups are best-effort; an empty list is fine.
    }
  };

  useEffect(() => {
    let cancelled = false;
    void getSettings().then((settings) => {
      if (cancelled) return;
      // 0 = retention disabled. Nothing is ever deleted automatically.
      const days = settings.dataRetentionDays ?? 0;
      setSavedRetention(days);
      if (days > 0) setRetentionDays(days);
    });
    void refreshBackups();
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

  async function loadRetentionPreview(days: number) {
    setIsPreviewLoading(true);
    try {
      setRetentionPreview(await previewDataRetention(days));
    } catch {
      setRetentionPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }

  function openRetentionSetup() {
    setRetentionConfigureOpen(true);
    void loadRetentionPreview(retentionDays);
  }

  function handleRetentionDaysChange(value: string) {
    const parsed = Number(value.replace(/\D/g, ""));
    const days = Number.isFinite(parsed) && parsed > 0 ? Math.min(3650, parsed) : 1;
    setRetentionDays(days);
    void loadRetentionPreview(days);
  }

  async function handleDisableRetention() {
    try {
      await setDataRetention(0);
      setSavedRetention(0);
      addToast({
        type: "success",
        title: t("settings:data.retentionDisabled"),
        message: t("settings:data.retentionDisabledMessage"),
      });
    } catch {
      addToast({ type: "error", title: t("settings:data.retentionError") });
    }
  }

  async function handleApplyRetention() {
    setIsApplyingRetention(true);
    try {
      // Fresh snapshot right before the destructive action.
      try {
        await createCloudBackup();
      } catch {
        // The daily backup still covers this.
      }
      const deleted = await applyDataRetention(retentionDays);
      setSavedRetention(retentionDays);
      addToast({
        type: "success",
        title: t("settings:data.retentionApplied"),
        message: t("settings:data.retentionAppliedMessage", {
          deleted,
          days: retentionDays,
        }),
      });
      await invalidateDataQueries(queryClient);
      await refreshBackups();
    } catch {
      addToast({ type: "error", title: t("settings:data.retentionError") });
    } finally {
      setIsApplyingRetention(false);
      setRetentionFinalOpen(false);
      setRetentionConfigureOpen(false);
    }
  }

  async function handleRestore() {
    if (!restoreTarget) return;
    setIsRestoring(true);
    try {
      await restoreDatabaseBackup(restoreTarget.path);
      addToast({
        type: "success",
        title: t("settings:data.restoreStaged"),
        message: t("settings:data.restoreStagedMessage"),
      });
      setTimeout(() => {
        void relaunch();
      }, 1500);
    } catch {
      addToast({ type: "error", title: t("settings:data.restoreError") });
      setIsRestoring(false);
      setRestoreTarget(null);
    }
  }

  const retentionEnabled = savedRetention > 0;

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

      {/* ── Retention Card (locked unless explicitly armed) ── */}
      <div className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-info/10">
            <CalendarClock size={20} className="text-accent-info" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-text-primary">
                {t("settings:data.retention")}
              </p>
              <Switch
                checked={retentionEnabled}
                onChange={(next) => {
                  if (next) openRetentionSetup();
                  else void handleDisableRetention();
                }}
                aria-label={t("settings:data.retention")}
                size="sm"
              />
            </div>
            <p className="mt-0.5 text-xs text-text-secondary">
              {t("settings:data.retentionHint")}
            </p>
            <p
              className={
                retentionEnabled
                  ? "mt-2 inline-flex rounded-full bg-accent-warning/10 px-2.5 py-0.5 text-[11px] font-medium text-accent-warning"
                  : "mt-2 inline-flex rounded-full bg-accent-success/10 px-2.5 py-0.5 text-[11px] font-medium text-accent-success"
              }
            >
              {retentionEnabled
                ? t("settings:data.retentionActiveBadge", { days: savedRetention })
                : t("settings:data.retentionBlockedBadge")}
            </p>
            {retentionEnabled && (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="danger"
                  leftIcon={Trash2}
                  onClick={openRetentionSetup}
                >
                  {t("settings:data.retentionSetupButton")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Backups Card ── */}
      <div className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-success/10">
            <RotateCcw size={20} className="text-accent-success" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              {t("settings:data.backups")}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {t("settings:data.backupsHint")}
            </p>
            {backups.length === 0 ? (
              <p className="mt-3 text-xs text-text-muted">
                {t("settings:data.backupsEmpty")}
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {backups.slice(0, 5).map((backup) => {
                  const belongsToOtherProfile =
                    !!backup.profileId && backup.profileId !== activeProfile?.id;
                  return (
                  <li
                    key={backup.path}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-base px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-text-primary">
                        {backup.name}
                      </p>
                      <p className="text-[11px] text-text-tertiary">
                        {backup.playerName
                          ? `${t("settings:data.backupPlayer", { name: backup.playerName })} · `
                          : ""}
                        {backup.modifiedAt
                          ? new Date(backup.modifiedAt).toLocaleString()
                          : "—"}{" "}
                        · {(backup.sizeBytes / 1024 / 1024).toFixed(1)} MB
                      </p>
                      {belongsToOtherProfile && (
                        <p className="text-[11px] text-accent-warning">
                          {t("settings:data.backupOtherProfile", {
                            profile: backup.profileId ?? "",
                          })}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={RotateCcw}
                      disabled={belongsToOtherProfile}
                      onClick={() => setRestoreTarget(backup)}
                      className="shrink-0"
                    >
                      {t("settings:data.restore")}
                    </Button>
                  </li>
                  );
                })}
              </ul>
            )}
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

      {/* ── Retention step 1: configure + preview ── */}
      <Modal
        isOpen={retentionConfigureOpen}
        onClose={() => setRetentionConfigureOpen(false)}
        title={t("settings:data.retentionSetupTitle")}
        description={t("settings:data.retentionSetupDescription")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRetentionConfigureOpen(false)}>
              {t("settings:data.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => setRetentionFinalOpen(true)}
              disabled={isPreviewLoading || (retentionPreview?.count ?? 0) === 0}
            >
              {t("settings:data.retentionContinue")}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              aria-label={t("settings:data.retentionDaysLabel")}
              value={retentionDays}
              onChange={(e) => handleRetentionDaysChange(e.target.value)}
              className="w-20 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-center text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
            />
            <span className="text-xs text-text-muted">
              {t("settings:data.retentionUnit")}
            </span>
          </div>
          <div className="rounded-lg border border-accent-danger/30 bg-accent-danger/5 p-3 text-xs text-text-secondary">
            {isPreviewLoading ? (
              t("settings:data.retentionPreviewLoading")
            ) : retentionPreview && retentionPreview.count > 0 ? (
              <span>
                {t("settings:data.retentionPreviewCount", {
                  count: retentionPreview.count,
                })}
                {retentionPreview.oldestStartTime && (
                  <span className="mt-1 block text-text-tertiary">
                    {t("settings:data.retentionPreviewOldest", {
                      date: new Date(retentionPreview.oldestStartTime).toLocaleDateString(),
                    })}
                  </span>
                )}
              </span>
            ) : (
              t("settings:data.retentionPreviewEmpty")
            )}
          </div>
        </div>
      </Modal>

      {/* ── Retention step 2: final confirmation ── */}
      <Modal
        isOpen={retentionFinalOpen}
        onClose={() => setRetentionFinalOpen(false)}
        title={t("settings:data.retentionFinalTitle")}
        description={t("settings:data.retentionFinalDescription")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRetentionFinalOpen(false)}>
              {t("settings:data.cancel")}
            </Button>
            <Button
              variant="danger"
              isLoading={isApplyingRetention}
              onClick={() => void handleApplyRetention()}
            >
              {t("settings:data.retentionFinalAction", {
                count: retentionPreview?.count ?? 0,
              })}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">
          {t("settings:data.retentionFinalWarning", {
            count: retentionPreview?.count ?? 0,
            days: retentionDays,
          })}
        </p>
      </Modal>

      {/* ── Restore confirmation ── */}
      <Modal
        isOpen={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        title={t("settings:data.restoreConfirmTitle")}
        description={t("settings:data.restoreConfirmDescription")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRestoreTarget(null)}>
              {t("settings:data.cancel")}
            </Button>
            <Button variant="danger" isLoading={isRestoring} onClick={() => void handleRestore()}>
              {t("settings:data.restoreConfirmAction")}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">
          {t("settings:data.restoreConfirmWarning", {
            name: restoreTarget?.name ?? "",
          })}
        </p>
      </Modal>

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
