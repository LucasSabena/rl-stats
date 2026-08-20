import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { configureRlIniAll, detectRlPath, inspectRlPath } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { useUIStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  FolderSearch,
  LoaderCircle,
  MonitorUp,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { LanguageSelector } from "./LanguageSelector";
import { ManualMmr } from "./ManualMmr";
import {
  settingsSchema,
  type SettingsFormInput,
  type SettingsFormValues,
} from "@/lib/schemas";
import type { RlInstallation } from "@/lib/types";

const inputClass = cn(
  "w-full rounded-lg border bg-bg-base px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-all duration-200",
  "border-border-subtle focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20",
  "hover:border-border-highlight",
);

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-bg-surface px-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all duration-200",
          checked
            ? "bg-accent-primary shadow-[0_0_8px_rgba(59,130,246,0.4)]"
            : "bg-border-highlight",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-all duration-200",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}

function platformLabel(platform: string | null | undefined): string {
  if (platform === "steam") return "Steam";
  if (platform === "epic") return "Epic Games";
  return "—";
}

export function SettingsPanel() {
  const { t } = useTranslation(["settings", "common"]);
  const { data: settings, isLoading, isError, refetch } = useSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const restartOnboarding = useSettingsStore((state) => state.restartOnboarding);
  const addToast = useUIStore((state) => state.addToast);
  const [isDetecting, setIsDetecting] = useState(false);
  const [manualPath, setManualPath] = useState("");
  const [isValidatingManual, setIsValidatingManual] = useState(false);

  // Refresh the settings (and the active-platform badge) when the running
  // game switches platforms, without requiring a reload.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("game-status-changed", () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        // Outside Tauri (dev in a plain browser) there is no event backend.
      });
    return () => unlisten?.();
  }, [queryClient]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SettingsFormInput, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      playerName: "",
      autoStart: false,
      rlPath: null,
      rlPaths: [],
      platform: null,
      activePlatform: null,
      defaultMatchType: "ranked",
      sessionGapMinutes: 30,
      kickoffGoalThresholdSeconds: 7,
      warnOnProfileMismatch: true,
      autoSwitchProfileOnExactMatch: false,
      autoSyncOnMatchEnd: true,
    },
  });

  const activePlatform = watch("activePlatform");
  const rlPaths = watch("rlPaths") ?? [];

  useEffect(() => {
    if (settings) {
      reset({
        autoStart: settings.autoStart,
        playerName: settings.playerName ?? "",
        rlPath: settings.rlPath ?? null,
        rlPaths: settings.rlPaths?.length
          ? settings.rlPaths
          : settings.rlPath
            ? [settings.rlPath]
            : [],
        platform: settings.platform as "steam" | "epic" | null,
        activePlatform: settings.activePlatform as "steam" | "epic" | null,
        defaultMatchType: settings.defaultMatchType ?? "ranked",
        sessionGapMinutes: settings.sessionGapMinutes ?? 30,
        kickoffGoalThresholdSeconds: settings.kickoffGoalThresholdSeconds ?? 7,
        warnOnProfileMismatch: settings.warnOnProfileMismatch ?? true,
        autoSwitchProfileOnExactMatch:
          settings.autoSwitchProfileOnExactMatch ?? false,
        autoSyncOnMatchEnd: settings.autoSyncOnMatchEnd ?? true,
      });
    }
  }, [settings, reset]);

  const onSubmit = async (data: SettingsFormValues) => {
    try {
      const paths = (data.rlPaths ?? []).filter((path) => path.trim().length > 0);
      if (paths.length > 0) {
        await configureRlIniAll(paths);
      }
      updateSettings.mutate(
        {
          ...settings,
          playerName: data.playerName.trim(),
          autoStart: data.autoStart,
          rlPath: paths[0] ?? data.rlPath,
          rlPaths: paths,
          platform:
            paths.length > 0
              ? (data.platform ??
                (paths[0].toLowerCase().includes("epic") ? "epic" : "steam"))
              : data.platform,
          defaultMatchType: data.defaultMatchType,
          sessionGapMinutes: data.sessionGapMinutes,
          kickoffGoalThresholdSeconds: data.kickoffGoalThresholdSeconds,
          warnOnProfileMismatch: data.warnOnProfileMismatch,
          autoSwitchProfileOnExactMatch: data.autoSwitchProfileOnExactMatch,
          autoSyncOnMatchEnd: data.autoSyncOnMatchEnd,
        },
        {
          onSuccess: () =>
            addToast({
              type: "success",
              title: t("settings:toasts.saved.title"),
              message: t("settings:toasts.saved.message"),
            }),
          onError: (err) =>
            addToast({
              type: "error",
              title: t("settings:toasts.saveError.title"),
              message: err.message || t("settings:toasts.saveError.message"),
            }),
        },
      );
    } catch {
      addToast({
        type: "error",
        title: t("settings:toasts.detectError.title"),
        message: t("settings:toasts.detectError.message"),
      });
    }
  };

  const applyDetected = (results: RlInstallation[]) => {
    const valid = results.filter((r) => r.valid);
    const paths = valid.map((r) => r.path);
    if (paths.length > 0) {
      setValue("rlPaths", paths);
      setValue("rlPath", paths[0]);
      addToast({
        type: "success",
        title: t("settings:toasts.installFound.title"),
        message: t("settings:toasts.installFound.message", {
          platform: valid
            .map((r) => platformLabel(r.platform))
            .join(" + "),
          path: paths.join(", "),
        }),
      });
    } else {
      addToast({
        type: "warning",
        title: t("settings:toasts.notFound.title"),
        message: t("settings:toasts.notFound.message"),
      });
    }
  };

  const handleDetectPath = async () => {
    setIsDetecting(true);
    try {
      const results = await detectRlPath();
      applyDetected(results);
    } catch {
      addToast({
        type: "error",
        title: t("settings:toasts.detectError.title"),
        message: t("settings:toasts.detectError.message"),
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const handleAddManualPath = async () => {
    const path = manualPath.trim();
    if (!path) return;
    setIsValidatingManual(true);
    try {
      const detected = await inspectRlPath(path);
      const existing = rlPaths.some(
        (p) => p.toLowerCase() === detected.path.toLowerCase(),
      );
      if (!existing) {
        setValue("rlPaths", [...rlPaths, detected.path]);
      }
      setManualPath("");
      addToast({
        type: "success",
        title: t("settings:toasts.installFound.title"),
        message: t("settings:toasts.installFound.message", {
          platform: platformLabel(detected.platform),
          path: detected.path,
        }),
      });
    } catch (error) {
      addToast({
        type: "error",
        title: t("settings:toasts.detectError.title"),
        message: error instanceof Error ? error.message : t("settings:toasts.detectError.message"),
      });
    } finally {
      setIsValidatingManual(false);
    }
  };

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  if (isError || !settings)
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t("settings:errors.loadingTitle")}
        description={t("settings:errors.loadingMessage")}
        actionLabel={t("common:buttons.retry")}
        onAction={() => refetch()}
      />
    );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <section className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary-subtle transition-colors group-hover:bg-accent-primary/20">
            <FolderSearch className="h-4 w-4 text-accent-primary" />
          </div>
          <h3 className="text-sm font-semibold tracking-wide text-text-secondary">
            {t("settings:sections.rocketLeague")}
          </h3>
        </div>
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              {t("settings:fields.playerName")}
            </label>
            <input
              type="text"
              {...register("playerName")}
              className={inputClass}
              placeholder={t("settings:fields.playerNamePlaceholder")}
            />
            {errors.playerName && (
              <p className="text-xs text-accent-danger">
                {errors.playerName.message}
              </p>
            )}
            <p className="text-xs text-text-muted">
              {t("settings:fields.playerNameHelper")}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-text-secondary">
                {t("settings:fields.installPath")}
              </label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleDetectPath}
                isLoading={isDetecting}
                disabled={isDetecting}
                className="shrink-0"
              >
                <FolderSearch size={14} className="mr-1" />
                {t("settings:fields.detectPath")}
              </Button>
            </div>
            <p className="text-xs text-text-muted">
              {t("settings:fields.installPathsHelper")}
            </p>

            <div className="space-y-2">
              {rlPaths.length === 0 && (
                <p className="rounded-lg border border-dashed border-border-subtle bg-bg-base/60 px-3 py-3 text-xs text-text-muted">
                  {t("settings:fields.noPaths")}
                </p>
              )}
              {rlPaths.map((path, index) => {
                const lower = path.toLowerCase();
                const isEpic = lower.includes("epic");
                const platform = isEpic ? "epic" : "steam";
                const isActive =
                  activePlatform === "epic" || activePlatform === "steam"
                    ? activePlatform === platform
                    : false;
                return (
                  <div
                    key={`${path}-${index}`}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border bg-bg-base px-3 py-2",
                      isActive
                        ? "border-accent-success/40"
                        : "border-border-subtle",
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        platform === "steam"
                          ? "bg-accent-info/15 text-accent-info"
                          : "bg-accent-primary/15 text-accent-primary",
                      )}
                    >
                      {platformLabel(platform)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-secondary">
                      {path}
                    </span>
                    {isActive && (
                      <span className="shrink-0 rounded-full bg-accent-success/15 px-2 py-0.5 text-[10px] font-bold text-accent-success">
                        {t("settings:fields.activePlatform")}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const next = rlPaths.filter((_, i) => i !== index);
                        setValue("rlPaths", next);
                        if (next.length === 0) setValue("rlPath", null);
                      }}
                      className="shrink-0 rounded-md p-1 text-text-muted transition hover:bg-bg-surface hover:text-accent-danger"
                      aria-label={t("settings:fields.removePath")}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={manualPath}
                onChange={(event) => setManualPath(event.target.value)}
                className={cn(inputClass, "flex-1")}
                placeholder={t("settings:fields.installPathPlaceholder")}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddManualPath}
                isLoading={isValidatingManual}
                disabled={isValidatingManual || !manualPath.trim()}
                className="shrink-0"
              >
                {isValidatingManual ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} className="mr-1" />
                )}
                {t("settings:fields.addPath")}
              </Button>
            </div>
            {errors.rlPaths && (
              <p className="text-xs text-accent-danger">
                {errors.rlPaths.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              {t("settings:fields.platform")}
            </label>
            <Controller
              name="platform"
              control={control}
              render={({ field }) => (
                <Select
                  value={(field.value as string) || ""}
                  onChange={(val) => field.onChange(val || null)}
                  options={[
                    {
                      value: "",
                      label: String(t("settings:fields.platformAutoDetect")),
                    },
                    { value: "steam", label: "Steam" },
                    { value: "epic", label: "Epic Games" },
                  ]}
                  className="w-full"
                />
              )}
            />
            <p className="text-xs text-text-muted">
              {t("settings:fields.platformHelper")}
            </p>
            {errors.platform && (
              <p className="text-xs text-accent-danger">
                {errors.platform.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              {t("settings:fields.defaultMatchType")}
            </label>
            <div className="flex flex-wrap gap-2">
              {(["ranked", "casual", "tournament", "other"] as const).map(
                (type) => (
                  <Controller
                    key={type}
                    name="defaultMatchType"
                    control={control}
                    render={({ field }) => (
                      <button
                        type="button"
                        onClick={() => field.onChange(type)}
                        className={cn(
                          "rounded-lg px-4 py-2 text-xs font-medium transition-all duration-200 active:scale-95",
                          field.value === type
                            ? "bg-accent-primary text-white shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                            : "bg-bg-base text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated border border-border-subtle",
                        )}
                      >
                        {t(`settings:matchTypes.${type}`)}
                      </button>
                    )}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      <ManualMmr />

      <section className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary-subtle transition-colors group-hover:bg-accent-primary/20">
            <MonitorUp className="h-4 w-4 text-accent-primary" />
          </div>
          <h3 className="text-sm font-semibold tracking-wide text-text-secondary">
            {t("settings:sections.system")}
          </h3>
        </div>
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-base px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text-secondary">
                {t("settings:fields.autoStart")}
              </p>
              <p className="text-xs text-text-muted">
                {t("settings:fields.autoStartDescription")}
              </p>
            </div>
            <Controller
              name="autoStart"
              control={control}
              render={({ field }) => (
                <button
                  type="button"
                  role="switch"
                  aria-checked={field.value}
                  id="autoStart"
                  onClick={() => field.onChange(!field.value)}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200",
                    field.value
                      ? "bg-accent-primary shadow-[0_0_8px_rgba(59,130,246,0.4)]"
                      : "bg-border-highlight",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-all duration-200",
                      field.value ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                </button>
              )}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="sessionGapMinutes"
              className="text-sm font-medium text-text-secondary"
            >
              {t("settings:fields.sessionGap")}
            </label>
            <Controller
              name="sessionGapMinutes"
              control={control}
              render={({ field }) => (
                <input
                  id="sessionGapMinutes"
                  type="number"
                  min={5}
                  max={120}
                  value={field.value}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  className={cn(inputClass, "w-28 text-center")}
                />
              )}
            />
            <p className="text-xs text-text-muted">
              {t("settings:fields.sessionGapHelper")}
            </p>
            {errors.sessionGapMinutes && (
              <p className="text-xs text-accent-danger">
                {errors.sessionGapMinutes.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="kickoffGoalThresholdSeconds"
              className="text-sm font-medium text-text-secondary"
            >
              {t("settings:fields.kickoffGoalThreshold")}
            </label>
            <Controller
              name="kickoffGoalThresholdSeconds"
              control={control}
              render={({ field }) => (
                <input
                  id="kickoffGoalThresholdSeconds"
                  type="number"
                  min={1}
                  max={20}
                  value={field.value}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  className={cn(inputClass, "w-28 text-center")}
                />
              )}
            />
            <p className="text-xs text-text-muted">
              {t("settings:fields.kickoffGoalThresholdHelper")}
            </p>
            {errors.kickoffGoalThresholdSeconds && (
              <p className="text-xs text-accent-danger">
                {errors.kickoffGoalThresholdSeconds.message}
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-border-subtle bg-bg-base px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text-secondary">
                Smart profile detection
              </p>
              <p className="text-xs text-text-muted">
                Detect Rocket League account mismatches and keep stats under the
                right profile.
              </p>
            </div>

            <Controller
              name="warnOnProfileMismatch"
              control={control}
              render={({ field }) => (
                <ToggleRow
                  label="Warn on profile mismatch"
                  description="Show a warning when the detected Rocket League account belongs to another profile."
                  checked={field.value}
                  onChange={() => field.onChange(!field.value)}
                />
              )}
            />

            <Controller
              name="autoSwitchProfileOnExactMatch"
              control={control}
              render={({ field }) => (
                <ToggleRow
                  label="Auto-switch exact profile matches"
                  description="When the detected account exactly matches another profile, switch profiles and restart automatically."
                  checked={field.value}
                  onChange={() => field.onChange(!field.value)}
                />
              )}
            />

            <Controller
              name="autoSyncOnMatchEnd"
              control={control}
              render={({ field }) => (
                <ToggleRow
                  label="Auto-sync after each match"
                  description="If signed in with Cloud Sync enabled, upload pending changes after every completed match."
                  checked={field.value}
                  onChange={() => field.onChange(!field.value)}
                />
              )}
            />
          </div>

          <LanguageSelector />

          <div className="flex items-center justify-between gap-4 rounded-lg border border-accent-primary/20 bg-accent-primary-subtle px-4 py-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Sparkles size={15} className="text-accent-primary" />
                Recorrido interactivo
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Volvé a recorrer las áreas principales y revisá la detección del juego y tu cuenta.
              </p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={restartOnboarding}>
              Iniciar guía
            </Button>
          </div>
        </div>
      </section>

      <Button
        type="submit"
        isLoading={updateSettings.isPending}
        disabled={updateSettings.isPending}
        className="w-full"
      >
        {t("settings:buttons.saveSettings")}
      </Button>
    </form>
  );
}
