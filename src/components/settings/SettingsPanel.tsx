import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { detectRlPath } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { AlertTriangle, FolderSearch, MonitorUp } from "lucide-react";
import { LanguageSelector } from "./LanguageSelector";
import {
  settingsSchema,
  type SettingsFormInput,
  type SettingsFormValues,
} from "@/lib/schemas";

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

export function SettingsPanel() {
  const { t } = useTranslation(["settings", "common"]);
  const { data: settings, isLoading, isError, refetch } = useSettings();
  const updateSettings = useUpdateSettings();
  const addToast = useUIStore((state) => state.addToast);
  const [isDetecting, setIsDetecting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<SettingsFormInput, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      playerName: "",
      autoStart: false,
      rlPath: null,
      platform: null,
      defaultMatchType: "ranked",
      sessionGapMinutes: 30,
      kickoffGoalThresholdSeconds: 7,
      warnOnProfileMismatch: true,
      autoSwitchProfileOnExactMatch: false,
      autoSyncOnMatchEnd: true,
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        autoStart: settings.autoStart,
        playerName: settings.playerName ?? "",
        rlPath: settings.rlPath ?? null,
        platform: settings.platform as "steam" | "epic" | null,
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

  const onSubmit = (data: SettingsFormValues) => {
    updateSettings.mutate(
      {
        ...settings,
        playerName: data.playerName.trim(),
        autoStart: data.autoStart,
        rlPath: data.rlPath,
        platform: data.platform,
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
  };

  const handleDetectPath = async () => {
    setIsDetecting(true);
    try {
      const platform = settings?.platform ?? null;
      const results = await detectRlPath(platform);
      const valid = results.find((r) => r.valid) ?? results[0];
      if (valid) {
        setValue("rlPath", valid.path);
        setValue("platform", valid.platform);
        addToast({
          type: "success",
          title: t("settings:toasts.installFound.title"),
          message: t("settings:toasts.installFound.message", {
            platform: valid.platform === "steam" ? "Steam" : "Epic Games",
            path: valid.path,
          }),
        });
      } else {
        addToast({
          type: "warning",
          title: t("settings:toasts.notFound.title"),
          message: t("settings:toasts.notFound.message"),
        });
      }
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
            <label className="text-sm font-medium text-text-secondary">
              {t("settings:fields.installPath")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                {...register("rlPath")}
                className={cn(inputClass, "flex-1")}
                placeholder={t("settings:fields.installPathPlaceholder")}
              />
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
            {errors.rlPath && (
              <p className="text-xs text-accent-danger">
                {errors.rlPath.message}
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
