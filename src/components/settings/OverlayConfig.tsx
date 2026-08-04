import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
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
  Eye,
  Grip,
  Move,
  Users,
  User,
  LayoutTemplate,
  Monitor,
} from "lucide-react";
import type { OverlayWindowState, OverlayConfigForm, OverlayPositionPreset } from "@/lib/types";

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
                  watched.enabled ? "bg-accent-primary shadow-[0_0_12px_rgba(59,130,246,0.5)]" : "bg-text-muted/30"
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
            
            <div className="rounded-xl border border-border-subtle bg-bg-panel/50 p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 border-b border-border-subtle pb-3">
                <Move className="text-accent-primary" size={18} />
                <h3 className="font-semibold text-text-primary">{t("overlay:config.sections.position")}</h3>
              </div>
              
              <div className="grid grid-cols-3 gap-2 mb-4">
                {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handlePresetChange(preset)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-lg border p-2 transition-all duration-200",
                      preset === "top-right" || preset === "bottom-right" ? "col-span-1" : "col-span-1",
                      watched.positionPreset === preset
                        ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                        : "border-border-subtle bg-bg-base text-text-muted hover:bg-bg-elevated hover:text-text-secondary"
                    )}
                  >
                    <div className="h-6 w-8 rounded border border-current opacity-60 flex relative">
                      <div className={cn("absolute w-2 h-1.5 bg-current rounded-sm", 
                        preset.includes("top") ? "top-0.5" : "bottom-0.5",
                        preset.includes("left") ? "left-0.5" : "right-0.5"
                      )} />
                    </div>
                    <span className="text-[10px] font-medium leading-none">
                      {t(`overlay:config.positionPresets.${{ "top-left": "topLeft", "top-right": "topRight", "bottom-left": "bottomLeft", "bottom-right": "bottomRight" }[preset]}` as const)}
                    </span>
                  </button>
                ))}
                
                <button
                  type="button"
                  onClick={() => handlePresetChange("custom")}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1.5 rounded-lg border p-2 col-span-2 transition-all duration-200",
                    watched.positionPreset === "custom"
                      ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                      : "border-border-subtle bg-bg-base text-text-muted hover:bg-bg-elevated hover:text-text-secondary"
                  )}
                >
                  <Grip size={18} className="opacity-60" />
                  <span className="text-[10px] font-medium leading-none">{t("overlay:config.positionPresets.custom")}</span>
                </button>
              </div>

              {watched.positionPreset === "custom" && (
                <div className="flex items-center gap-3 rounded-lg bg-bg-base p-3 border border-border-subtle">
                  <div className="flex-1">
                    <label className="text-[10px] font-medium text-text-muted block mb-1">{t("overlay:config.axis.x")}</label>
                    <input type="number" {...register("positionX", { valueAsNumber: true })} className="w-full rounded bg-bg-surface px-2 py-1.5 text-sm outline-none border border-border-subtle focus:border-accent-primary" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-medium text-text-muted block mb-1">{t("overlay:config.axis.y")}</label>
                    <input type="number" {...register("positionY", { valueAsNumber: true })} className="w-full rounded bg-bg-surface px-2 py-1.5 text-sm outline-none border border-border-subtle focus:border-accent-primary" />
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-border-subtle flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-medium text-text-muted block mb-1">{t("overlay:config.dimensions.width")}</label>
                  <input type="number" min={300} max={1000} {...register("width", { valueAsNumber: true })} className="w-full rounded bg-bg-base px-2 py-1.5 text-sm outline-none border border-border-subtle focus:border-accent-primary" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-medium text-text-muted block mb-1">{t("overlay:config.dimensions.height")}</label>
                  <input type="number" min={200} max={800} {...register("height", { valueAsNumber: true })} className="w-full rounded bg-bg-base px-2 py-1.5 text-sm outline-none border border-border-subtle focus:border-accent-primary" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-bg-panel/50 p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 border-b border-border-subtle pb-3">
                <Eye className="text-accent-secondary" size={18} />
                <h3 className="font-semibold text-text-primary">{t("overlay:config.sections.appearance")}</h3>
              </div>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-medium text-text-secondary">{t("overlay:config.transparency")}</label>
                    <span className="text-sm font-mono text-accent-secondary">{Math.round(watched.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={10} max={100}
                    value={Math.round(watched.opacity * 100)}
                    onChange={(e) => setValue("opacity", Number(e.target.value) / 100)}
                    className="w-full h-2 rounded-full appearance-none bg-border-highlight accent-accent-secondary outline-none"
                  />
                </div>

                <div className="pt-2">
                  <label className="text-sm font-medium text-text-secondary block mb-2">{t("overlay:config.fontSize")}</label>
                  <div className="flex rounded-lg border border-border-subtle bg-bg-base p-1">
                    {(["small", "medium", "large"] as const).map((scale) => (
                      <button
                        key={scale}
                        type="button"
                        onClick={() => setValue("fontScale", scale)}
                        className={cn(
                          "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                          watched.fontScale === scale
                            ? "bg-accent-secondary text-white shadow"
                            : "text-text-muted hover:text-text-primary hover:bg-bg-elevated"
                        )}
                      >
                        {scale === "small" ? t("overlay:config.fontSizeOptions.small") : scale === "medium" ? t("overlay:config.fontSizeOptions.medium") : t("overlay:config.fontSizeOptions.large")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT COL: Datos y Visibilidad */}
          <div className="lg:col-span-7 space-y-6">
            
            <div className="rounded-xl border border-border-subtle bg-bg-panel/50 p-5 shadow-sm h-full flex flex-col">
              <div className="mb-4 flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <LayoutTemplate className="text-accent-success" size={18} />
                  <h3 className="font-semibold text-text-primary">{t("overlay:config.sections.displayData")}</h3>
                </div>
                
                {/* Clickthrough Toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted" title={t("overlay:config.clickThroughTooltip")}>
                    {t("overlay:config.clickThrough")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setValue("clickthrough", !watched.clickthrough)}
                    className={cn(
                      "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                      watched.clickthrough ? "bg-accent-success" : "bg-border-highlight"
                    )}
                  >
                    <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform", watched.clickthrough ? "translate-x-4" : "translate-x-1")} />
                  </button>
                </div>
              </div>

              <div className="mb-6">
                <label className="text-sm font-medium text-text-secondary block mb-3">{t("overlay:config.playersOnScreen")}</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setValue("playerScope", "all")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 rounded-lg border py-3 transition-all",
                      watched.playerScope === "all" ? "border-accent-success bg-accent-success/10 text-accent-success" : "border-border-subtle bg-bg-base text-text-muted hover:border-border-highlight"
                    )}
                  >
                    <Users size={18} />
                    <span className="font-medium text-sm">{t("overlay:config.allPlayers")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setValue("playerScope", "team")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 rounded-lg border py-3 transition-all",
                      watched.playerScope === "team" ? "border-accent-success bg-accent-success/10 text-accent-success" : "border-border-subtle bg-bg-base text-text-muted hover:border-border-highlight"
                    )}
                  >
                    <User size={18} />
                    <span className="font-medium text-sm">{t("overlay:config.myTeam")}</span>
                  </button>
                </div>
              </div>

              <div className="flex-1">
                <label className="text-sm font-medium text-text-secondary block mb-3">{t("overlay:config.displayElements.visibleElements")}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {[
                    { key: "showScore", label: t("overlay:config.displayElements.mainScore") },
                    { key: "showTimer", label: t("overlay:config.displayElements.gameTimer") },
                    { key: "showPlayers", label: t("overlay:config.displayElements.playerList") },
                    { key: "showNames", label: t("overlay:config.displayElements.playerNames") },
                    { key: "showPlayerScore", label: t("overlay:config.displayElements.playerScore") },
                    { key: "showStats", label: t("overlay:config.displayElements.stats") },
                    { key: "showBoost", label: t("overlay:config.displayElements.boost") },
                    { key: "showSpeed", label: t("overlay:config.displayElements.speed") },
                    { key: "showMmr", label: t("overlay:config.displayElements.mmr") },
                  ].map(({ key, label }) => (
                    <label key={key} className={cn(
                      "group flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors",
                      watched[key as keyof OverlayConfigForm] ? "border-accent-success/30 bg-accent-success/5" : "border-border-subtle bg-bg-base hover:bg-bg-elevated"
                    )}>
                      <div className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                        watched[key as keyof OverlayConfigForm] ? "border-accent-success bg-accent-success text-white" : "border-border-highlight bg-transparent"
                      )}>
                        {watched[key as keyof OverlayConfigForm] && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <input type="checkbox" className="sr-only" {...register(key as keyof OverlayConfigForm)} />
                      <span className={cn(
                        "text-sm font-medium transition-colors",
                        watched[key as keyof OverlayConfigForm] ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"
                      )}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Botones de accion integrados en la caja derecha al fondo */}
              <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-border-subtle">
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={handlePreview} 
                  isLoading={previewing} 
                  disabled={previewing}
                  className="bg-bg-base"
                >
                  <Move size={16} className="mr-2" />
                  {t("overlay:config.buttons.testPosition")}
                </Button>
                <Button type="submit" isLoading={saving} disabled={saving}>
                  {t("overlay:config.buttons.apply")}
                </Button>
              </div>

            </div>

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
