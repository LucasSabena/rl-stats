import { useState } from "react";
import { Eye, EyeOff, Save, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { AppSettings } from "@/lib/types";

export function ParseBotSetup() {
  const { t } = useTranslation("settings");
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [showKey, setShowKey] = useState(false);
  const [localKey, setLocalKey] = useState("");
  const [localScraperId, setLocalScraperId] = useState("");
  const [localEndpoint, setLocalEndpoint] = useState("");
  const [localEnabled, setLocalEnabled] = useState<boolean | null>(null);

  if (isLoading) return null;

  const apiKey = settings?.parsebotApiKey ?? "";
  const scraperId = settings?.parsebotScraperId ?? "";
  const endpoint = settings?.parsebotEndpoint ?? "";
  const enabled = localEnabled ?? settings?.parsebotEnabled ?? false;

  async function handleSave() {
    await updateSettings.mutateAsync({
      ...(settings ?? {}),
      parsebotApiKey: localKey || apiKey,
      parsebotScraperId: localScraperId || scraperId,
      parsebotEndpoint: localEndpoint || endpoint,
      parsebotEnabled: enabled,
    } as AppSettings);
  }

  return (
    <div className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary-subtle transition-colors group-hover:bg-accent-primary/20">
            <Globe size={16} className="text-accent-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text-primary">
              {t("parseBot.title")}
            </h4>
            <p className="text-xs text-text-muted">
              {t("parseBot.description")}
            </p>
          </div>
        </div>

        <Badge variant={enabled ? "live" : "default"} className="border border-border-subtle">
          {enabled ? t("parseBot.active") : t("parseBot.disabled")}
        </Badge>
      </div>

      <div className="space-y-4">
        <label className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-base px-3.5 py-3 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setLocalEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border-default"
          />
          <span>{t("parseBot.enableLabel")}</span>
        </label>

        <div className="space-y-2">
          <label className="text-xs font-medium text-text-secondary">
            {t("parseBot.apiKeyLabel")}
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={localKey || apiKey}
              onChange={(e) => setLocalKey(e.target.value)}
              placeholder={t("parseBot.apiKeyPlaceholder")}
              aria-label={t("parseBot.apiKeyLabel")}
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-3.5 py-2.5 pr-10 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all duration-200 hover:border-border-highlight"
            />
            <button
              type="button"
              onClick={() => setShowKey((current) => !current)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              aria-label={showKey ? t("parseBot.hideKey") : t("parseBot.showKey")}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary">
              {t("parseBot.scraperIdLabel")}
            </label>
            <input
              type="text"
              value={localScraperId || scraperId}
              onChange={(e) => setLocalScraperId(e.target.value)}
              placeholder={t("parseBot.scraperIdPlaceholder")}
              aria-label={t("parseBot.scraperIdLabel")}
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-3.5 py-2.5 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all duration-200 hover:border-border-highlight"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary">
              {t("parseBot.endpointLabel")}
            </label>
            <input
              type="text"
              value={localEndpoint || endpoint}
              onChange={(e) => setLocalEndpoint(e.target.value)}
              placeholder={t("parseBot.endpointPlaceholder")}
              aria-label={t("parseBot.endpointLabel")}
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-3.5 py-2.5 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all duration-200 hover:border-border-highlight"
            />
          </div>
        </div>

        <div className="rounded-lg border border-accent-info/20 bg-accent-info/5 px-4 py-3 text-[11px] leading-relaxed text-text-tertiary">
          <p className="mb-1 font-semibold text-text-secondary">
            {t("parseBot.howTo.title")}
          </p>
          <p>{t("parseBot.howTo.step1")}</p>
          <p>{t("parseBot.howTo.step2")}</p>
          <p>{t("parseBot.howTo.step3")}</p>
          <p>{t("parseBot.howTo.step4")}</p>
          <p className="mt-1.5">{t("parseBot.howTo.note")}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={handleSave} disabled={updateSettings.isPending}>
            <Save size={14} className="mr-1.5" />
            {updateSettings.isPending ? t("parseBot.saving") : t("parseBot.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
