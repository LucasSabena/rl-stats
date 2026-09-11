import { useTranslation } from "react-i18next";
import { DatabaseZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface CloudSyncSectionProps {
  busyAction: string | null;
  uploadDisabled: boolean;
  syncDisabled: boolean;
  onUploadHistory: () => void;
  onSyncNow: () => void;
}

export function CloudSyncSection({
  busyAction,
  uploadDisabled,
  syncDisabled,
  onUploadHistory,
  onSyncNow,
}: CloudSyncSectionProps) {
  const { t } = useTranslation("settings");

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-surface/60 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <DatabaseZap className="mt-0.5 h-5 w-5 text-accent-primary" />
          <div>
            <h4 className="text-sm font-semibold text-text-primary">
              {t("cloud.syncProfile")}
            </h4>
            <p className="text-xs text-text-tertiary">
              {t("cloud.syncProfileDescription")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            isLoading={busyAction === "backfill"}
            disabled={uploadDisabled}
            onClick={onUploadHistory}
          >
            {t("cloud.uploadHistory")}
          </Button>
          <Button
            type="button"
            variant="accent"
            leftIcon={RefreshCw}
            isLoading={busyAction === "sync"}
            disabled={syncDisabled}
            onClick={onSyncNow}
          >
            {t("cloud.syncNow")}
          </Button>
        </div>
      </div>
    </section>
  );
}
