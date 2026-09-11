import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Globe,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { getMmrProviderHealth, testMmrProvider } from "@/lib/api";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { AppSettings, MmrProviderTestResult } from "@/lib/types";

const PRIMARY_PROVIDER = "rlstats-webview";

function formatTimestamp(
  value: string | null | undefined,
  neverLabel: string,
): string {
  if (!value) return neverLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusBadge(
  health: { lastStatus: string } | undefined,
  t: TFunction,
) {
  if (!health) return { label: t("mmrSources.noData"), variant: "default" as const };
  switch (health.lastStatus) {
    case "ok":
      return { label: t("mmrSources.ok"), variant: "live" as const };
    case "error":
      return { label: t("mmrSources.error"), variant: "default" as const };
    default:
      return { label: health.lastStatus, variant: "default" as const };
  }
}

export function MmrSourcesSetup() {
  const { t } = useTranslation("settings");
  const healthQuery = useQuery({
    queryKey: ["mmr-provider-health"],
    queryFn: getMmrProviderHealth,
    refetchInterval: 30_000,
  });

  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const scraperEnabled = settings?.mmrScraperEnabled ?? true;

  const testMutation = useMutation<MmrProviderTestResult, Error>({
    mutationFn: () => testMmrProvider(PRIMARY_PROVIDER),
  });

  const health = healthQuery.data?.find(
    (entry) => entry.provider === PRIMARY_PROVIDER,
  );
  const result = testMutation.data;
  const badge = scraperEnabled
    ? statusBadge(health, t)
    : { label: t("mmrSources.disabled"), variant: "default" as const };
  const lastTestOk = result?.ok ?? (health?.lastStatus === "ok");

  async function toggleScraper() {
    await updateSettings.mutateAsync({
      ...(settings ?? {}),
      mmrScraperEnabled: !scraperEnabled,
    } as AppSettings);
  }

  return (
    <div className="group rounded-xl border border-border-subtle bg-bg-surface/60 p-5 transition-all duration-200 hover:border-border-default hover:bg-bg-surface/80">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary-subtle transition-colors group-hover:bg-accent-primary/20">
            <ShieldCheck size={16} className="text-accent-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text-primary">
              {t("mmrSources.title")}
            </h4>
            <p className="text-xs text-text-muted">
              {t("mmrSources.description")}
            </p>
          </div>
        </div>
        <Badge variant={badge.variant} className="border border-border-subtle">
          {badge.label}
        </Badge>
      </div>

      <div className="space-y-4">
        <label className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-base px-3.5 py-3 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={scraperEnabled}
            onChange={() => void toggleScraper()}
            disabled={updateSettings.isPending}
            className="h-4 w-4 rounded border-border-default"
          />
          <span>{t("mmrSources.enableLabel")}</span>
        </label>

        <div className="rounded-lg border border-border-subtle bg-bg-base px-3.5 py-3">
          <div className="flex items-center gap-2 text-sm text-text-primary">
            <Globe size={14} className="text-accent-primary" />
            <span className="font-medium">{t("mmrSources.providerTitle")}</span>
            <span className="text-[11px] text-text-muted">
              {t("mmrSources.primaryProvider")}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-text-tertiary sm:grid-cols-4">
            <span>
              {t("mmrSources.lastAttempt", {
                timestamp: formatTimestamp(
                  health?.lastAttemptAt,
                  t("mmrSources.never"),
                ),
              })}
            </span>
            <span>
              {t("mmrSources.lastOk", {
                timestamp: formatTimestamp(health?.lastOkAt, t("mmrSources.never")),
              })}
            </span>
            <span>
              {t("mmrSources.latency", {
                latency:
                  health?.latencyMs != null ? `${health.latencyMs} ms` : "—",
              })}
            </span>
            <span>
              {t("mmrSources.okFailures", {
                ok: health?.successCount ?? 0,
                failures: health?.failureCount ?? 0,
              })}
            </span>
          </div>
          {health?.lastError ? (
            <p className="mt-2 line-clamp-2 text-[11px] text-accent-danger">
              {health.lastError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            <RefreshCw
              size={14}
              className={`mr-1.5 ${testMutation.isPending ? "animate-spin" : ""}`}
            />
            {testMutation.isPending
              ? t("mmrSources.testing")
              : t("mmrSources.testNow")}
          </Button>
        </div>

        {result ? (
          <div className="rounded-lg border border-border-subtle bg-bg-base px-3.5 py-3">
            <div className="flex items-center gap-2 text-xs">
              {result.ok ? (
                <CheckCircle2 size={14} className="text-accent-success" />
              ) : (
                <XCircle size={14} className="text-accent-danger" />
              )}
              <span className="text-text-secondary">{result.message}</span>
            </div>
            {lastTestOk && result.entries.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-text-tertiary sm:grid-cols-3">
                {result.entries.map((entry) => (
                  <span key={entry.playlist}>
                    <span className="text-text-secondary">
                      {entry.playlist}
                    </span>
                    {": "}
                    {entry.mmr ?? "—"}
                    {entry.rankName ? ` (${entry.rankName})` : ""}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-lg border border-accent-info/20 bg-accent-info/5 px-4 py-3 text-[11px] leading-relaxed text-text-tertiary">
          <p className="mb-1 font-semibold text-text-secondary">
            {t("mmrSources.howItWorks.title")}
          </p>
          <p>{t("mmrSources.howItWorks.description1")}</p>
          <p className="mt-1.5">{t("mmrSources.howItWorks.description2")}</p>
        </div>
      </div>
    </div>
  );
}
