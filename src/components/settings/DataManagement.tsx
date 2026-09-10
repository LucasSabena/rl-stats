import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { exportDataJson, importDataJson, getStorageStats, clearAllData } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/uiStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload, Trash2, Database, FolderOpen } from "lucide-react";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addToast = useUIStore((state) => state.addToast);
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ["storageStats"],
    queryFn: getStorageStats,
  });

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
      await clearAllData();
      addToast({ type: "success", title: t("settings:data.dataDeleted") });
      await invalidateDataQueries(queryClient);
      setConfirmOpen(false);
    } catch {
      addToast({ type: "error", title: t("settings:data.deleteError") });
    }
  }

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
            <p className="text-xs text-text-secondary">
              {stats
                ? t("settings:data.statsTemplate", { totalMatches: stats.totalMatches, size: (stats.databaseSizeBytes / 1024 / 1024).toFixed(1) })
                : t("settings:data.loading")}
            </p>
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

      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
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
        <Button variant="danger" leftIcon={Trash2} onClick={() => setConfirmOpen(true)} className="col-span-2 sm:col-span-2 justify-center">
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
