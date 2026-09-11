import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useUIStore } from "@/stores/uiStore";
import {
  createOverlayWindow,
  destroyOverlayWindow,
  getOverlayWindowState,
  updateOverlayOpacity,
  updateOverlayPosition,
  updateOverlaySize,
  setOverlayClickthrough,
  setOverlayInteractive,
  notifyOverlaySettingsChanged,
  getSettings,
  setSettings,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  MonitorPlay,
  MonitorX,
  Monitor,
} from "lucide-react";
import type { OverlayWindowState, OverlayConfigForm, OverlayPositionPreset } from "@/lib/types";
import { OverlayPositionPanel } from "./OverlayPositionPanel";
import { OverlayAppearancePanel } from "./OverlayAppearancePanel";
import { OverlayDisplayPanel } from "./OverlayDisplayPanel";

const PRESETS: Record<OverlayPositionPreset, { x: number; y: number }> = {
  "top-left": { x: 20, y: 40 },
  "top-right": { x: 1420, y: 40 },
  "bottom-left": { x: 20, y: 700 },
  "bottom-right": { x: 1420, y: 700 },
  "custom": { x: 0, y: 0 },
};

export function OverlayConfig() {
  const { t } = useTranslation(["overlay", "common"]);
  const addToast = useUIStore((state) => state.addToast);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<OverlayWindowState | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const { register, watch, setValue, handleSubmit, reset } = useForm<OverlayConfigForm>({
    defaultValues: {
      enabled: false,
      opacity: 0.85,
      positionPreset: "top-left",
      positionX: 20,
      positionY: 40,
      width: 480,
      height: 360,
      showScore: true,
      showPlayers: true,
      showStats: true,
      showTimer: true,
      fontScale: "medium",
      clickthrough: true,
      playerScope: "all",
      showNames: true,
      showPlayerScore: true,
      showBoost: true,
      showMmr: true,
      showSpeed: true,
    },
  });

  const watched = watch();

  useEffect(() => {
    (async () => {
      try {
        const [appSettings, overlayState] = await Promise.all([
          getSettings(),
          getOverlayWindowState().catch(() => null),
        ]);
        const st = overlayState ?? { visible: false, clickthrough: true, opacity: 0.85, position_x: 20, position_y: 40, width: 480, height: 360 };
        setState(st);
        const preset = findPreset(st.position_x, st.position_y);
        reset({
          enabled: st.visible || (appSettings.overlayEnabled ?? false),
          opacity: appSettings.overlayOpacity ?? st.opacity,
          positionPreset: preset,
          positionX: st.position_x,
          positionY: st.position_y,
          width: st.width || 480,
          height: st.height || 360,
          showScore: appSettings.overlayShowScore ?? true,
          showPlayers: appSettings.overlayShowPlayers ?? true,
          showStats: appSettings.overlayShowStats ?? true,
          showTimer: appSettings.overlayShowTimer ?? true,
          fontScale: (appSettings.overlayFontScale as OverlayConfigForm["fontScale"]) ?? "medium",
          clickthrough: appSettings.overlayClickthrough ?? true,
          playerScope: (appSettings.overlayPlayerScope ?? "all") as "all" | "team",
          showNames: appSettings.overlayShowNames ?? true,
          showPlayerScore: appSettings.overlayShowPlayerScore ?? true,
          showBoost: appSettings.overlayShowBoost ?? true,
          showMmr: appSettings.overlayShowMmr ?? true,
          showSpeed: appSettings.overlayShowSpeed ?? true,
        });
      } catch {
        addToast({ type: "error", title: "Error", message: t("overlay:config.loadError") });
      } finally {
        setLoading(false);
      }
    })();
  }, [addToast, reset, t]);

  const handlePresetChange = (preset: OverlayPositionPreset) => {
    setValue("positionPreset", preset);
    if (preset !== "custom") {
      const pos = PRESETS[preset];
      setValue("positionX", pos.x);
      setValue("positionY", pos.y);
    }
  };

  const handleToggleEnabled = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    try {
      const newEnabled = !watched.enabled;
      if (newEnabled) {
        setState(await createOverlayWindow());
        addToast({ type: "success", title: t("overlay:config.toasts.overlayActivated") });
      } else {
        setState(await destroyOverlayWindow());
        addToast({ type: "info", title: t("overlay:config.toasts.overlayDeactivated") });
      }
      setValue("enabled", newEnabled);
      const s = await getSettings();
      await setSettings({ ...s, overlayEnabled: newEnabled });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: "error", title: "Error", message: msg });
    }
  };

  const handlePreview = async () => {
    if (!state?.visible) return;
    setPreviewing(true);
    try {
      await setOverlayInteractive(8);
      addToast({ type: "info", title: t("overlay:config.toasts.interactiveMode"), message: t("overlay:config.toasts.interactiveMessage") });
      setTimeout(() => setPreviewing(false), 8000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: "error", title: "Error", message: msg });
      setPreviewing(false);
    }
  };

  const onSubmit = async (data: OverlayConfigForm) => {
    setSaving(true);
    try {
      const appSettings = await getSettings();
      await setSettings({
        ...appSettings,
        overlayEnabled: data.enabled,
        overlayOpacity: data.opacity,
        overlayPositionX: data.positionX,
        overlayPositionY: data.positionY,
        overlayWidth: data.width,
        overlayHeight: data.height,
        overlayShowScore: data.showScore,
        overlayShowPlayers: data.showPlayers,
        overlayShowStats: data.showStats,
        overlayShowTimer: data.showTimer,
        overlayFontScale: data.fontScale,
        overlayClickthrough: data.clickthrough,
        overlayPlayerScope: data.playerScope,
        overlayShowNames: data.showNames,
        overlayShowPlayerScore: data.showPlayerScore,
        overlayShowBoost: data.showBoost,
        overlayShowMmr: data.showMmr,
        overlayShowSpeed: data.showSpeed,
      });

      if (state?.visible) {
        await updateOverlayOpacity(data.opacity);
        await updateOverlayPosition(data.positionX, data.positionY);
        await updateOverlaySize(data.width, data.height);
        await setOverlayClickthrough(data.clickthrough);
        await notifyOverlaySettingsChanged();
      }

      setState(await getOverlayWindowState().catch(() => state));
      addToast({ type: "success", title: t("overlay:config.toasts.settingsSaved"), message: t("overlay:config.toasts.settingsSavedMessage") });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: "error", title: t("overlay:config.toasts.saveError"), message: msg });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-border-subtle bg-bg-surface/40">
        <div className="flex animate-pulse flex-col items-center gap-2">
          <Monitor className="text-text-muted" size={24} />
          <span className="text-sm text-text-muted">{t("overlay:config.loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* HEADER / MASTER SWITCH */}
      <div className="relative overflow-hidden rounded-2xl border border-border-highlight bg-gradient-to-b from-bg-panel to-bg-surface p-6 shadow-lg">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent-primary/10 blur-[50px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl shadow-inner transition-colors duration-500",
              watched.enabled ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/30" : "bg-bg-elevated text-text-muted border border-border-subtle"
            )}>
              {watched.enabled ? <MonitorPlay size={28} /> : <MonitorX size={28} />}
            </div>
            <div>
              <h2 className="text-xl font-display font-semibold text-text-primary">
                {t("overlay:config.title")}
              </h2>
              <p className="mt-1 text-sm text-text-secondary max-w-[360px]">
                {t("overlay:config.description")}
              </p>
              {watched.enabled && (
                <p className="mt-1.5 max-w-[380px] text-xs text-accent-warning/90">
                  {t("overlay:config.fullscreenHint")}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex shrink-0 items-center">
            <label className="flex cursor-pointer items-center gap-3 rounded-full bg-bg-elevated py-2 pl-3 pr-2 border border-border-subtle shadow-inner">
                <span className="text-sm font-medium text-text-secondary select-none">
                  {watched.enabled ? t("overlay:config.active") : t("overlay:config.inactive")}
                </span>
              <button
                type="button"
                onClick={handleToggleEnabled}
                className={cn(
                  "relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 outline-none",
                  watched.enabled ? "bg-accent-primary shadow-[0_0_12px_color-mix(in_oklab,var(--accent)_50%,transparent)]" : "bg-text-muted/30"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-300",
                    watched.enabled ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </label>
          </div>
        </div>
      </div>

      {watched.enabled && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-slide-in-up">
          {/* LEFT COL: Posicion y Dimensiones */}
          <div className="lg:col-span-5 space-y-6">
            <OverlayPositionPanel
              watched={watched}
              register={register}
              handlePresetChange={handlePresetChange}
              t={t}
            />
            <OverlayAppearancePanel
              watched={watched}
              setValue={setValue}
              t={t}
            />
          </div>

          {/* RIGHT COL: Datos y Visibilidad */}
          <div className="lg:col-span-7 space-y-6">
            <OverlayDisplayPanel
              watched={watched}
              register={register}
              setValue={setValue}
              handlePreview={handlePreview}
              previewing={previewing}
              saving={saving}
              t={t}
            />
          </div>
        </div>
      )}
    </form>
  );
}

function findPreset(x: number, y: number): OverlayPositionPreset {
  for (const [key, pos] of Object.entries(PRESETS)) {
    if (key === "custom") continue;
    if (Math.abs(pos.x - x) < 10 && Math.abs(pos.y - y) < 10) {
      return key as OverlayPositionPreset;
    }
  }
  return "custom";
}
