import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/PageContainer";
import { PlaylistCard } from "@/components/tracker/PlaylistCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { ShareModal } from "@/components/share/ShareModal";
import { CareerOverview } from "@/components/profile/CareerOverview";
import { UserPresetList } from "@/components/profile/UserPresetList";
import { UserPresetEditor } from "@/components/profile/UserPresetEditor";
import { useTrackerProfile } from "@/hooks/useTrackerProfile";
import { useAnalytics, useInsights } from "@/hooks/useAnalytics";
import {
  useUserPresets,
  useSaveUserPreset,
  useDeleteUserPreset,
  useExportPreset,
  useImportPreset,
} from "@/hooks/useUserPresets";
import { User, Plus, Upload, RefreshCw, AlertTriangle } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import type { UserPreset, UserPresetInput, ShareContext, ShareStat } from "@/lib/types";

type TabValue = "profile" | "configs";

export function ProfilePage() {
  const { t, i18n } = useTranslation(["profiles", "presets", "common"]);
  // Cached tracker data only; nothing re-fetches it now that the API key
  // can no longer be obtained.
  const { data: profile } = useTrackerProfile();
  const {
    data: analytics,
    isLoading: analyticsLoading,
    isError: analyticsError,
    refetch: refetchAnalytics,
  } = useAnalytics("alltime");
  const { data: insights } = useInsights("alltime");

  const {
    data: presets = [],
    isLoading: presetsLoading,
    isError: presetsError,
    refetch: refetchPresets,
  } = useUserPresets();
  const savePreset = useSaveUserPreset();
  const deletePreset = useDeleteUserPreset();
  const exportPreset = useExportPreset();
  const importPreset = useImportPreset();
  const addToast = useUIStore((state) => state.addToast);

  const [activeTab, setActiveTab] = useState<TabValue>("profile");
  const [editingPreset, setEditingPreset] = useState<UserPreset | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<UserPreset | null>(null);

  const [shareContext, setShareContext] = useState<ShareContext | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNew = useCallback(() => {
    setEditingPreset(null);
    setIsCreating(true);
  }, []);

  const handleEdit = useCallback((p: UserPreset) => {
    setEditingPreset(p);
    setIsCreating(true);
  }, []);

  const handleSave = useCallback(
    (input: UserPresetInput) => {
      const payload = editingPreset ? { ...input, id: editingPreset.id } : input;
      savePreset.mutate(payload as UserPresetInput & { id?: number }, {
        onSuccess: () => {
          setIsCreating(false);
          setEditingPreset(null);
        },
      });
    },
    [editingPreset, savePreset]
  );

  const handleCancel = useCallback(() => {
    setIsCreating(false);
    setEditingPreset(null);
  }, []);

  const handleDelete = useCallback(
    (id: number) => {
      setPresetToDelete(presets.find((p) => p.id === id) ?? null);
    },
    [presets]
  );

  const confirmDelete = useCallback(() => {
    if (!presetToDelete) return;
    deletePreset.mutate(presetToDelete.id, {
      onSuccess: () => setPresetToDelete(null),
      onError: () =>
        addToast({ type: "error", title: t("presets:errors.deleteFailed") }),
    });
  }, [presetToDelete, deletePreset, addToast, t]);

  const handleShare = useCallback(
    (preset: UserPreset) => {
      const stats: ShareStat[] = [];
      if (preset.camera) {
        stats.push({ label: t("presets:fields.fov"), value: String(preset.camera.fov) });
        stats.push({ label: t("presets:fields.height"), value: String(preset.camera.height) });
        stats.push({ label: t("presets:fields.distance"), value: String(preset.camera.distance) });
        stats.push({ label: t("presets:fields.stiffness"), value: String(preset.camera.stiffness) });
        stats.push({ label: t("presets:fields.swivelSpeed"), value: String(preset.camera.swivelSpeed) });
        stats.push({ label: t("presets:fields.transitionSpeed"), value: String(preset.camera.transitionSpeed) });
        stats.push({ label: t("presets:fields.ballCam"), value: preset.camera.ballCamera });
        stats.push({ label: t("presets:fields.cameraShake"), value: preset.camera.cameraShake });
      }
      if (preset.deadzone) {
        stats.push({ label: t("presets:fields.deadzoneShape"), value: preset.deadzone.deadzoneShape });
        stats.push({ label: t("presets:fields.deadzone"), value: String(preset.deadzone.deadzone) });
        stats.push({ label: t("presets:fields.dodgeDeadzone"), value: String(preset.deadzone.dodgeDeadzone) });
        stats.push({ label: t("presets:fields.aerialSensitivity"), value: String(preset.deadzone.aerialSensitivity) });
        stats.push({ label: t("presets:fields.steeringSensitivity"), value: String(preset.deadzone.steeringSensitivity) });
      }
      if (preset.controls) {
        stats.push({ label: t("presets:fields.powerslide"), value: preset.controls.powerslide });
        stats.push({ label: t("presets:fields.boost"), value: preset.controls.boost });
        stats.push({ label: t("presets:fields.airRollLeft"), value: preset.controls.airRollLeft });
        stats.push({ label: t("presets:fields.airRollRight"), value: preset.controls.airRollRight });
      }
      if (preset.hardware) {
        stats.push({ label: t("presets:fields.controller"), value: preset.hardware.controller });
        stats.push({ label: t("presets:fields.monitor"), value: preset.hardware.monitor });
        stats.push({ label: t("presets:fields.headset"), value: preset.hardware.headset });
      }

      const ctx: ShareContext = {
        type: "config",
        title: preset.name,
        subtitle: preset.description || undefined,
        stats,
        dateLabel: new Date().toLocaleDateString(i18n.language || "es", { dateStyle: "long" }),
      };
      setShareContext(ctx);
      setShareOpen(true);
    },
    [i18n.language, t]
  );

  const handleExport = useCallback(
    (preset: UserPreset) => {
      exportPreset.mutate(preset.id, {
        onSuccess: (json) => {
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${preset.name.replace(/\s+/g, "_")}_preset.json`;
          a.click();
          URL.revokeObjectURL(url);
          addToast({ type: "success", title: t("presets:exportSuccess") });
        },
        onError: () =>
          addToast({ type: "error", title: t("presets:errors.exportFailed") }),
      });
    },
    [exportPreset, addToast, t]
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const json = String(ev.target?.result || "");
        if (json) {
          importPreset.mutate(json, {
            onSuccess: () =>
              addToast({ type: "success", title: t("presets:importSuccess") }),
            onError: () =>
              addToast({ type: "error", title: t("presets:errors.importFailed") }),
          });
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [importPreset, addToast, t]
  );

  return (
    <PageContainer>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <div className="mb-6 flex items-center justify-end">
          <TabsList>
            <TabsTrigger value="profile">{t("profiles:profilePage.title")}</TabsTrigger>
            <TabsTrigger value="configs">{t("presets:title")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile">
          <CareerOverview
            data={analytics?.data}
            insights={insights}
            isLoading={analyticsLoading}
          />

          {analyticsError && (
            <EmptyState
              icon={AlertTriangle}
              title={t("profiles:career.errorTitle")}
              description={t("profiles:career.errorDescription")}
              actionLabel={t("common:buttons.retry")}
              onAction={() => void refetchAnalytics()}
            />
          )}

          {!analyticsLoading && !analyticsError && (analytics?.data.totalMatches ?? 0) === 0 && (
            <EmptyState
              icon={User}
              title={t("profiles:career.emptyTitle", {
                defaultValue: "Todavía no hay partidas",
              })}
              description={t("profiles:career.emptyDescription", {
                defaultValue:
                  "Jugá una partida con Rocket League abierto y tu carrera se arma sola desde acá.",
              })}
            />
          )}

          {/* Legacy tracker data, only if a profile was cached before the
              integration stopped being usable. Nothing fetches it any more. */}
          {profile && (
            <section className="mt-8 border-t border-border-subtle pt-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium text-text-primary">
                  {t("profiles:profilePage.sections.ranked")}
                </h3>
                <span className="text-xs text-text-tertiary">
                  {profile.username} · {profile.platform}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <PlaylistCard name="duel" stats={profile.stats.ranked.duel} />
                <PlaylistCard name="double" stats={profile.stats.ranked.double} />
                <PlaylistCard name="standard" stats={profile.stats.ranked.standard} />
              </div>
            </section>
          )}
        </TabsContent>

        <TabsContent value="configs">
          <div className="space-y-4">
            {presetsError && !isCreating ? (
              <EmptyState
                icon={AlertTriangle}
                title={t("presets:errors.loadFailed")}
                actionLabel={t("common:buttons.retry")}
                onAction={() => void refetchPresets()}
              />
            ) : !isCreating ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button variant="primary" size="sm" leftIcon={Plus} onClick={handleNew}>
                      {t("presets:newPreset")}
                    </Button>
                    <Button variant="secondary" size="sm" leftIcon={Upload} onClick={handleImportClick}>
                      {t("presets:import")}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json"
                      aria-label={t("presets:import")}
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                  {presetsLoading && (
                    <RefreshCw size={16} className="animate-spin text-text-tertiary" />
                  )}
                </div>

                <UserPresetList
                  presets={presets}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onShare={handleShare}
                  onExport={handleExport}
                />
              </>
            ) : (
              <div className="rounded-xl border border-border-subtle bg-bg-surface p-6">
                <h3 className="mb-4 text-lg font-semibold text-text-primary">
                  {editingPreset ? t("presets:editPreset") : t("presets:newPreset")}
                </h3>
                <UserPresetEditor
                  preset={editingPreset}
                  onSave={handleSave}
                  onCancel={handleCancel}
                />
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ShareModal isOpen={shareOpen} onClose={() => setShareOpen(false)} context={shareContext} />

      <Modal
        isOpen={!!presetToDelete}
        onClose={() => setPresetToDelete(null)}
        title={t("presets:deleteConfirmTitle")}
        description={t("presets:deleteConfirm")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPresetToDelete(null)}>
              {t("common:buttons.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              isLoading={deletePreset.isPending}
            >
              {t("presets:delete")}
            </Button>
          </div>
        }
      />
    </PageContainer>
  );
}
