import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { CloudConfig } from "@/lib/types";
import { inputClass } from "./inputClass";

interface CloudConnectionSectionProps {
  config: CloudConfig;
  setConfigState: Dispatch<SetStateAction<CloudConfig | null>>;
  onSave: () => void;
  onRefresh: () => void;
}

export function CloudConnectionSection({
  config,
  setConfigState,
  onSave,
  onRefresh,
}: CloudConnectionSectionProps) {
  const { t } = useTranslation("settings");

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-surface/60 p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <ShieldCheck className="h-4 w-4 text-accent-primary" />
        <h4 className="text-sm font-semibold text-text-secondary">
          {t("cloud.connection")}
        </h4>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <input
          className={inputClass}
          value={config.supabase_url ?? ""}
          onChange={(event) =>
            setConfigState({ ...config, supabase_url: event.target.value })
          }
          placeholder={t("cloud.supabaseUrlPlaceholder")}
          aria-label={t("cloud.supabaseUrlLabel")}
        />
        <input
          className={inputClass}
          value={config.supabase_anon_key ?? ""}
          onChange={(event) =>
            setConfigState({
              ...config,
              supabase_anon_key: event.target.value,
            })
          }
          placeholder={t("cloud.supabaseAnonKeyPlaceholder")}
          aria-label={t("cloud.supabaseAnonKeyLabel")}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onSave}>
          {t("cloud.saveConfig")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leftIcon={RefreshCw}
          onClick={onRefresh}
        >
          {t("cloud.refreshStatus")}
        </Button>
      </div>
    </section>
  );
}
