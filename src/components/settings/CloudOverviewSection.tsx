import { useTranslation } from "react-i18next";
import { Cloud } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type {
  CloudConfig,
  CloudSyncStatus,
  SyncStatus,
} from "@/lib/types";
import type { CloudSession, CloudSubscription } from "@/lib/cloudClient";
import { CloudStatusMetric } from "./CloudStatusMetric";

function planKey(planCode?: string | null): string {
  if (planCode === "cloud_supporter") return "cloud.plans.supporter";
  if (planCode === "cloud_basic") return "cloud.plans.basic";
  return "cloud.plans.none";
}

interface CloudOverviewSectionProps {
  hasCredentials: boolean;
  session: CloudSession | null;
  subscription: CloudSubscription | null;
  config: CloudConfig;
  profileStatus: SyncStatus;
  cloudStatus: CloudSyncStatus;
  hasActivePlan: boolean;
  hasCloudAccess: boolean;
}

export function CloudOverviewSection({
  hasCredentials,
  session,
  subscription,
  config,
  profileStatus,
  cloudStatus,
  hasActivePlan,
  hasCloudAccess,
}: CloudOverviewSectionProps) {
  const { t, i18n } = useTranslation("settings");

  return (
    <section className="relative overflow-hidden rounded-2xl border border-accent-primary/20 bg-bg-surface/80 p-5 shadow-level-1">
      <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-accent-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-primary-subtle">
              <Cloud className="h-5 w-5 text-accent-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                {t("cloud.title")}
              </h3>
              <p className="text-xs text-text-tertiary">
                {t("cloud.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={hasCredentials ? "success" : "danger"}>
              {hasCredentials
                ? t("cloud.badges.supabaseConfigured")
                : t("cloud.badges.supabaseMissing")}
            </Badge>
            <Badge variant={session ? "success" : "default"}>
              {session
                ? (session.user.email ?? t("cloud.badges.signedIn"))
                : t("cloud.badges.signedOut")}
            </Badge>
            <Badge variant={hasActivePlan ? "success" : "accent"}>
              {hasCloudAccess
                ? t("cloud.badges.ownerTester")
                : t(planKey(subscription?.plan_code ?? config.plan_code))}
            </Badge>
            <Badge variant={config.enabled ? "live" : "default"}>
              {config.enabled
                ? t("cloud.badges.syncEnabled")
                : t("cloud.badges.manualOff")}
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-right text-xs sm:grid-cols-4 lg:min-w-105">
          <CloudStatusMetric
            label={t("cloud.metrics.pending")}
            value={profileStatus.pending_changes}
          />
          <CloudStatusMetric
            label={t("cloud.metrics.failed")}
            value={profileStatus.failed_changes}
            danger={profileStatus.failed_changes > 0}
          />
          <CloudStatusMetric
            label={t("cloud.metrics.appQueue")}
            value={cloudStatus.pending_app_changes}
          />
          <CloudStatusMetric
            label={t("cloud.metrics.lastSync")}
            value={
              config.last_sync_at
                ? new Date(config.last_sync_at).toLocaleDateString(
                    i18n.language,
                  )
                : t("cloud.never")
            }
          />
        </div>
      </div>
    </section>
  );
}
