import { Controller } from "react-hook-form";
import type { Control } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { SettingsFormInput } from "@/lib/schemas";
import { ToggleRow } from "./ToggleRow";

interface SmartDetectionSectionProps {
  control: Control<SettingsFormInput, unknown>;
}

export function SmartDetectionSection({
  control,
}: SmartDetectionSectionProps) {
  const { t } = useTranslation(["settings", "common"]);

  return (
    <div className="space-y-3 rounded-lg border border-border-subtle bg-bg-base px-4 py-3">
      <div>
        <p className="text-sm font-medium text-text-secondary">
          {t("settings:smartDetection.title")}
        </p>
        <p className="text-xs text-text-muted">
          {t("settings:smartDetection.description")}
        </p>
      </div>

      <Controller
        name="warnOnProfileMismatch"
        control={control}
        render={({ field }) => (
          <ToggleRow
            label={t("settings:smartDetection.warnLabel")}
            description={t("settings:smartDetection.warnDescription")}
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
            label={t("settings:smartDetection.autoSwitchLabel")}
            description={t("settings:smartDetection.autoSwitchDescription")}
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
            label={t("settings:smartDetection.autoSyncLabel")}
            description={t("settings:smartDetection.autoSyncDescription")}
            checked={field.value}
            onChange={() => field.onChange(!field.value)}
          />
        )}
      />
    </div>
  );
}
