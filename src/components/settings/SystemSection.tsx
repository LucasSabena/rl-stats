import { Controller } from "react-hook-form";
import type { Control, FieldErrors } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { MonitorUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SettingsFormInput } from "@/lib/schemas";
import { inputClass } from "./inputClass";
import { LanguageSelector } from "./LanguageSelector";
import { PromptSection } from "./PromptSection";
import { SmartDetectionSection } from "./SmartDetectionSection";
import { ToggleRow } from "./ToggleRow";
import { TourCard } from "./TourCard";

interface SystemSectionProps {
  control: Control<SettingsFormInput, unknown>;
  errors: FieldErrors<SettingsFormInput>;
  onRestartOnboarding: () => void;
}

export function SystemSection({
  control,
  errors,
  onRestartOnboarding,
}: SystemSectionProps) {
  const { t } = useTranslation(["settings", "common"]);

  return (
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
                    ? "bg-accent-primary shadow-[0_0_8px_color-mix(in_oklab,var(--accent)_40%,transparent)]"
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
              {t("settings:training.title")}
            </p>
            <p className="text-xs text-text-muted">
              {t("settings:training.description")}
            </p>
          </div>

          <Controller
            name="trainingTrackingEnabled"
            control={control}
            render={({ field }) => (
              <ToggleRow
                label={t("settings:training.enabled")}
                description={t("settings:training.enabledHint")}
                checked={field.value}
                onChange={() => field.onChange(!field.value)}
              />
            )}
          />
        </div>

        <SmartDetectionSection control={control} />

        <PromptSection control={control} errors={errors} />

        <LanguageSelector />

        <TourCard onStart={onRestartOnboarding} />
      </div>
    </section>
  );
}
