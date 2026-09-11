import { Controller } from "react-hook-form";
import type { Control, FieldErrors } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { SettingsFormInput } from "@/lib/schemas";
import { inputClass } from "./inputClass";
import { ToggleRow } from "./ToggleRow";

interface PromptSectionProps {
  control: Control<SettingsFormInput, unknown>;
  errors: FieldErrors<SettingsFormInput>;
}

export function PromptSection({ control, errors }: PromptSectionProps) {
  const { t } = useTranslation(["settings", "common"]);

  return (
    <div className="space-y-3 rounded-lg border border-border-subtle bg-bg-base px-4 py-3">
      <div>
        <p className="text-sm font-medium text-text-secondary">
          {t("settings:prompt.title")}
        </p>
        <p className="text-xs text-text-muted">
          {t("settings:prompt.description")}
        </p>
      </div>

      <Controller
        name="promptFocusEnabled"
        control={control}
        render={({ field }) => (
          <ToggleRow
            label={t("settings:prompt.enabled")}
            description={t("settings:prompt.enabledHint")}
            checked={field.value}
            onChange={() => field.onChange(!field.value)}
          />
        )}
      />

      <Controller
        name="promptOnlyWhenGameRunning"
        control={control}
        render={({ field }) => (
          <ToggleRow
            label={t("settings:prompt.onlyWhenRunning")}
            description={t("settings:prompt.onlyWhenRunningHint")}
            checked={field.value}
            onChange={() => field.onChange(!field.value)}
          />
        )}
      />

      <div className="space-y-2">
        <label
          htmlFor="promptTimeoutSecs"
          className="text-sm font-medium text-text-secondary"
        >
          {t("settings:prompt.timeout")}
        </label>
        <Controller
          name="promptTimeoutSecs"
          control={control}
          render={({ field }) => (
            <input
              id="promptTimeoutSecs"
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
          {t("settings:prompt.timeoutHint")}
        </p>
        {errors.promptTimeoutSecs && (
          <p className="text-xs text-accent-danger">
            {errors.promptTimeoutSecs.message}
          </p>
        )}
      </div>
    </div>
  );
}
