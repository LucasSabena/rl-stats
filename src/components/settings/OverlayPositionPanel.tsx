import { Grip, Move } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TFunction } from "i18next";
import type { UseFormRegister } from "react-hook-form";
import type { OverlayConfigForm, OverlayPositionPreset } from "@/lib/types";

interface OverlayPositionPanelProps {
  watched: OverlayConfigForm;
  register: UseFormRegister<OverlayConfigForm>;
  handlePresetChange: (preset: OverlayPositionPreset) => void;
  t: TFunction;
}

export function OverlayPositionPanel({ watched, register, handlePresetChange, t }: OverlayPositionPanelProps) {
  return (
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
            <input type="number" {...register("positionX", { valueAsNumber: true })} aria-label={t("overlay:config.axis.x")} className="w-full rounded bg-bg-surface px-2 py-1.5 text-sm outline-none border border-border-subtle focus:border-accent-primary" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-medium text-text-muted block mb-1">{t("overlay:config.axis.y")}</label>
            <input type="number" {...register("positionY", { valueAsNumber: true })} aria-label={t("overlay:config.axis.y")} className="w-full rounded bg-bg-surface px-2 py-1.5 text-sm outline-none border border-border-subtle focus:border-accent-primary" />
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border-subtle flex gap-3">
        <div className="flex-1">
          <label className="text-[10px] font-medium text-text-muted block mb-1">{t("overlay:config.dimensions.width")}</label>
          <input type="number" min={300} max={1000} {...register("width", { valueAsNumber: true })} aria-label={t("overlay:config.dimensions.width")} className="w-full rounded bg-bg-base px-2 py-1.5 text-sm outline-none border border-border-subtle focus:border-accent-primary" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-medium text-text-muted block mb-1">{t("overlay:config.dimensions.height")}</label>
          <input type="number" min={200} max={800} {...register("height", { valueAsNumber: true })} aria-label={t("overlay:config.dimensions.height")} className="w-full rounded bg-bg-base px-2 py-1.5 text-sm outline-none border border-border-subtle focus:border-accent-primary" />
        </div>
      </div>
    </div>
  );
}
