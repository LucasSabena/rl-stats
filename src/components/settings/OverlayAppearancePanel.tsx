import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TFunction } from "i18next";
import type { UseFormSetValue } from "react-hook-form";
import type { OverlayConfigForm } from "@/lib/types";

interface OverlayAppearancePanelProps {
  watched: OverlayConfigForm;
  setValue: UseFormSetValue<OverlayConfigForm>;
  t: TFunction;
}

export function OverlayAppearancePanel({ watched, setValue, t }: OverlayAppearancePanelProps) {
  return (
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
                    ? "bg-accent-secondary text-[var(--accent-fg)] shadow"
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
  );
}
