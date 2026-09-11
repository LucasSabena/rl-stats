import { LayoutTemplate, Move, User, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { TFunction } from "i18next";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";
import type { OverlayConfigForm } from "@/lib/types";

interface OverlayDisplayPanelProps {
  watched: OverlayConfigForm;
  register: UseFormRegister<OverlayConfigForm>;
  setValue: UseFormSetValue<OverlayConfigForm>;
  handlePreview: () => void;
  previewing: boolean;
  saving: boolean;
  t: TFunction;
}

export function OverlayDisplayPanel({ watched, register, setValue, handlePreview, previewing, saving, t }: OverlayDisplayPanelProps) {
  return (
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
                watched[key as keyof OverlayConfigForm] ? "border-accent-success bg-accent-success text-[var(--accent-fg)]" : "border-border-highlight bg-transparent"
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
  );
}
