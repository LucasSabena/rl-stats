import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { configureRlIniAll } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useUIStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { AlertTriangle } from "lucide-react";
import { ManualMmr } from "./ManualMmr";
import { RocketLeagueSection } from "./RocketLeagueSection";
import { SystemSection } from "./SystemSection";
import {
  settingsSchema,
  type SettingsFormInput,
  type SettingsFormValues,
} from "@/lib/schemas";

export function SettingsPanel() {
  const { t } = useTranslation(["settings", "common"]);
  const { data: settings, isLoading, isError, refetch } = useSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const restartOnboarding = useSettingsStore((state) => state.restartOnboarding);
  const addToast = useUIStore((state) => state.addToast);

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
      promptFocusEnabled: false,
      promptTimeoutSecs: 30,
      promptOnlyWhenGameRunning: true,
      trainingTrackingEnabled: true,
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
        promptFocusEnabled: settings.promptFocusEnabled ?? false,
        promptTimeoutSecs: settings.promptTimeoutSecs ?? 30,
        promptOnlyWhenGameRunning: settings.promptOnlyWhenGameRunning ?? true,
        trainingTrackingEnabled: settings.trainingTrackingEnabled ?? true,
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
          promptFocusEnabled: data.promptFocusEnabled,
          promptTimeoutSecs: data.promptTimeoutSecs,
          promptOnlyWhenGameRunning: data.promptOnlyWhenGameRunning,
          trainingTrackingEnabled: data.trainingTrackingEnabled,
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
      <RocketLeagueSection
        register={register}
        control={control}
        errors={errors}
        setValue={setValue}
        rlPaths={rlPaths}
        activePlatform={activePlatform}
      />

      <ManualMmr />

      <SystemSection
        control={control}
        errors={errors}
        onRestartOnboarding={restartOnboarding}
      />

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
