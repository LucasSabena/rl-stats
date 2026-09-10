import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Cloud,
  CreditCard,
  DatabaseZap,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useUIStore } from "@/stores/uiStore";
import {
  enqueueExistingProfileHistoryForSync,
  getCloudConfig,
  getCloudSyncStatus,
  getProfileSyncStatus,
  setCloudConfig,
} from "@/lib/api";
import type { CloudConfig, CloudSyncStatus, SyncStatus } from "@/lib/types";
import {
  clearCloudSession,
  createCheckoutSession,
  createPortalSession,
  getCloudSubscription,
  getStoredCloudSession,
  hasCloudSyncAccess,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  type CloudPlanCode,
  type CloudSession,
  type CloudSubscription,
} from "@/lib/cloudClient";
import { cn } from "@/lib/utils";
import { syncCurrentProfileToCloud } from "@/lib/cloudSync";

const DEFAULT_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as
  | string
  | undefined;
const DEFAULT_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

const inputClass = cn(
  "w-full rounded-lg border bg-bg-base px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-all duration-200",
  "border-border-subtle focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20",
  "hover:border-border-highlight",
);

function isActiveSubscription(subscription: CloudSubscription | null): boolean {
  return (
    subscription?.status === "active" || subscription?.status === "trialing"
  );
}

function planKey(planCode?: string | null): string {
  if (planCode === "cloud_supporter") return "cloud.plans.supporter";
  if (planCode === "cloud_basic") return "cloud.plans.basic";
  return "cloud.plans.none";
}

const STATUS_KEYS: Record<string, string> = {
  active: "cloud.status.active",
  trialing: "cloud.status.trialing",
  past_due: "cloud.status.pastDue",
  canceled: "cloud.status.canceled",
  inactive: "cloud.status.inactive",
};

function getCredentials(config: CloudConfig) {
  const supabaseUrl = config.supabase_url?.trim();
  const supabaseAnonKey = config.supabase_anon_key?.trim();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return { supabaseUrl, supabaseAnonKey };
}

export function CloudSyncPanel() {
  const { t, i18n } = useTranslation("settings");
  const addToast = useUIStore((state) => state.addToast);
  const [config, setConfigState] = useState<CloudConfig | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus | null>(null);
  const [profileStatus, setProfileStatus] = useState<SyncStatus | null>(null);
  const [session, setSession] = useState<CloudSession | null>(() =>
    getStoredCloudSession(),
  );
  const [subscription, setSubscription] = useState<CloudSubscription | null>(
    null,
  );
  const [hasCloudAccess, setHasCloudAccess] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const credentials = useMemo(
    () => (config ? getCredentials(config) : null),
    [config],
  );
  const hasActivePlan =
    hasCloudAccess ||
    isActiveSubscription(subscription) ||
    config?.plan_status === "active";
  const planStatus = subscription?.status ?? config?.plan_status ?? "inactive";
  const planStatusLabel = STATUS_KEYS[planStatus]
    ? t(STATUS_KEYS[planStatus])
    : planStatus;

  const refresh = useCallback(async () => {
    const [nextConfig, nextCloudStatus, nextProfileStatus] = await Promise.all([
      getCloudConfig(),
      getCloudSyncStatus(),
      getProfileSyncStatus(),
    ]);
    const hydratedConfig = {
      ...nextConfig,
      supabase_url: nextConfig.supabase_url ?? DEFAULT_SUPABASE_URL ?? null,
      supabase_anon_key:
        nextConfig.supabase_anon_key ?? DEFAULT_SUPABASE_ANON_KEY ?? null,
    };
    setConfigState(hydratedConfig);
    setCloudStatus(nextCloudStatus);
    setProfileStatus(nextProfileStatus);

    const storedSession = getStoredCloudSession();
    setSession(storedSession);
    const nextCredentials = getCredentials(hydratedConfig);
    if (storedSession && nextCredentials) {
      const [nextSubscription, nextHasCloudAccess] = await Promise.all([
        getCloudSubscription(nextCredentials, storedSession),
        hasCloudSyncAccess(nextCredentials, storedSession),
      ]);
      setSubscription(nextSubscription);
      setHasCloudAccess(nextHasCloudAccess);
      if (
        nextSubscription?.status !== nextConfig.plan_status ||
        nextSubscription?.plan_code !== nextConfig.plan_code
      ) {
        await setCloudConfig({
          ...hydratedConfig,
          plan_code: nextSubscription?.plan_code ?? null,
          plan_status: nextSubscription?.status ?? null,
          cloud_sync_enabled:
            nextHasCloudAccess || isActiveSubscription(nextSubscription),
          enabled:
            hydratedConfig.enabled &&
            (nextHasCloudAccess || isActiveSubscription(nextSubscription)),
        });
      }
    } else {
      setSubscription(null);
      setHasCloudAccess(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch((error: unknown) => {
      addToast({
        type: "error",
        title: t("cloud.title"),
        message:
          error instanceof Error
            ? error.message
            : t("cloud.toasts.loadError"),
      });
    });
  }, [addToast, refresh, t]);

  const saveConfig = async (patch: Partial<CloudConfig>) => {
    if (!config) return;
    const nextConfig = { ...config, ...patch };
    setConfigState(nextConfig);
    await setCloudConfig(nextConfig);
    await refresh();
  };

  const handleAuth = async () => {
    if (!credentials) {
      addToast({
        type: "warning",
        title: t("cloud.title"),
        message: t("cloud.toasts.missingCredentials"),
      });
      return;
    }
    setBusyAction("auth");
    try {
      const nextSession =
        authMode === "sign-in"
          ? await signInWithPassword(credentials, email.trim(), password)
          : await signUpWithPassword(credentials, email.trim(), password);
      setSession(nextSession);
      await saveConfig({ enabled: false });
      addToast({
        type: "success",
        title: t("cloud.toasts.connectedTitle"),
        message: t("cloud.toasts.connectedMessage"),
      });
    } catch (error) {
      addToast({
        type: "error",
        title: t("cloud.toasts.loginFailedTitle"),
        message:
          error instanceof Error
            ? error.message
            : t("cloud.toasts.loginFailed"),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSignOut = async () => {
    setBusyAction("sign-out");
    try {
      if (credentials && session) await signOut(credentials, session);
      clearCloudSession();
      setSession(null);
      setSubscription(null);
      setHasCloudAccess(false);
      await saveConfig({ enabled: false, cloud_sync_enabled: false });
    } finally {
      setBusyAction(null);
    }
  };

  const openCheckout = async (planCode: CloudPlanCode) => {
    if (!credentials || !session) return;
    setBusyAction(planCode);
    try {
      const url = await createCheckoutSession(credentials, session, planCode);
      await openUrl(url);
      addToast({
        type: "info",
        title: t("cloud.toasts.checkoutOpenedTitle"),
        message: t("cloud.toasts.checkoutOpenedMessage"),
      });
    } catch (error) {
      addToast({
        type: "error",
        title: t("cloud.toasts.checkoutFailedTitle"),
        message:
          error instanceof Error
            ? error.message
            : t("cloud.toasts.checkoutFailed"),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const openPortal = async () => {
    if (!credentials || !session) return;
    setBusyAction("portal");
    try {
      const url = await createPortalSession(credentials, session);
      await openUrl(url);
    } catch (error) {
      addToast({
        type: "error",
        title: t("cloud.toasts.portalFailedTitle"),
        message:
          error instanceof Error
            ? error.message
            : t("cloud.toasts.portalFailed"),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const syncNow = async () => {
    if (!credentials || !session || !config) return;
    if (!hasActivePlan) {
      addToast({
        type: "warning",
        title: t("cloud.toasts.lockedTitle"),
        message: t("cloud.toasts.locked"),
      });
      return;
    }

    setBusyAction("sync");
    try {
      const result = await syncCurrentProfileToCloud();
      addToast({
        type: "success",
        title: t("cloud.toasts.completeTitle"),
        message:
          result.uploaded > 0
            ? t("cloud.toasts.completeUploaded", { uploaded: result.uploaded })
            : t("cloud.toasts.completeNoChanges"),
      });
    } catch (error) {
      addToast({
        type: "error",
        title: t("cloud.toasts.failedTitle"),
        message:
          error instanceof Error ? error.message : t("cloud.toasts.failed"),
      });
    } finally {
      setBusyAction(null);
      await refresh();
    }
  };

  const uploadExistingHistory = async () => {
    setBusyAction("backfill");
    try {
      const enqueued = await enqueueExistingProfileHistoryForSync();
      const result = await syncCurrentProfileToCloud();
      addToast({
        type: "success",
        title: t("cloud.toasts.historyQueuedTitle"),
        message: t("cloud.toasts.historyQueued", {
          queued: enqueued,
          uploaded: result.uploaded,
        }),
      });
    } catch (error) {
      addToast({
        type: "error",
        title: t("cloud.toasts.historyFailedTitle"),
        message:
          error instanceof Error
            ? error.message
            : t("cloud.toasts.historyFailed"),
      });
    } finally {
      setBusyAction(null);
      await refresh();
    }
  };

  if (!config || !cloudStatus || !profileStatus) {
    return (
      <div className="rounded-xl border border-border-subtle bg-bg-surface/60 p-5 text-sm text-text-secondary">
        {t("cloud.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
              <Badge variant={credentials ? "success" : "danger"}>
                {credentials
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
            <StatusMetric
              label={t("cloud.metrics.pending")}
              value={profileStatus.pending_changes}
            />
            <StatusMetric
              label={t("cloud.metrics.failed")}
              value={profileStatus.failed_changes}
              danger={profileStatus.failed_changes > 0}
            />
            <StatusMetric
              label={t("cloud.metrics.appQueue")}
              value={cloudStatus.pending_app_changes}
            />
            <StatusMetric
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
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              saveConfig({
                supabase_url: config.supabase_url,
                supabase_anon_key: config.supabase_anon_key,
              })
            }
          >
            {t("cloud.saveConfig")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={RefreshCw}
            onClick={refresh}
          >
            {t("cloud.refreshStatus")}
          </Button>
        </div>
      </section>

      {!session ? (
        <section className="rounded-xl border border-border-subtle bg-bg-surface/60 p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <UserRound className="h-4 w-4 text-accent-primary" />
            <h4 className="text-sm font-semibold text-text-secondary">
              {t("cloud.account")}
            </h4>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("cloud.emailPlaceholder")}
            />
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("cloud.passwordPlaceholder")}
            />
            <Button
              type="button"
              isLoading={busyAction === "auth"}
              onClick={handleAuth}
            >
              {authMode === "sign-in"
                ? t("cloud.signIn")
                : t("cloud.createAccount")}
            </Button>
          </div>
          <button
            type="button"
            className="mt-3 text-xs text-accent-primary hover:underline"
            onClick={() =>
              setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in")
            }
          >
            {authMode === "sign-in"
              ? t("cloud.needAccount")
              : t("cloud.haveAccount")}
          </button>
        </section>
      ) : (
        <section className="rounded-xl border border-border-subtle bg-bg-surface/60 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {t("cloud.signedInAs", {
                  email: session.user.email ?? session.user.id,
                })}
              </p>
              <p className="text-xs text-text-tertiary">
                {t("cloud.subscription", { status: planStatusLabel })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={CreditCard}
                onClick={openPortal}
                isLoading={busyAction === "portal"}
              >
                {t("cloud.manageBilling")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leftIcon={LogOut}
                onClick={handleSignOut}
                isLoading={busyAction === "sign-out"}
              >
                {t("cloud.signOut")}
              </Button>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <PlanCard
          title={t("cloud.plans.basic")}
          price={t("cloud.plans.basicPrice")}
          description={t("cloud.plans.basicDescription")}
          action={t("cloud.plans.chooseBasic")}
          active={subscription?.plan_code === "cloud_basic"}
          loading={busyAction === "cloud_basic"}
          onClick={() => openCheckout("cloud_basic")}
        />
        <PlanCard
          title={t("cloud.plans.supporter")}
          price={t("cloud.plans.supporterPrice")}
          description={t("cloud.plans.supporterDescription")}
          action={t("cloud.plans.chooseSupporter")}
          active={subscription?.plan_code === "cloud_supporter"}
          loading={busyAction === "cloud_supporter"}
          onClick={() => openCheckout("cloud_supporter")}
        />
      </section>

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
              disabled={!session || !credentials || !hasActivePlan}
              onClick={uploadExistingHistory}
            >
              {t("cloud.uploadHistory")}
            </Button>
            <Button
              type="button"
              variant="accent"
              leftIcon={RefreshCw}
              isLoading={busyAction === "sync"}
              disabled={!session || !credentials}
              onClick={syncNow}
            >
              {t("cloud.syncNow")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusMetric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-base/70 px-3 py-2">
      <p className="text-[10px] tracking-wide text-text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-semibold text-text-primary",
          danger && "text-accent-danger",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PlanCard({
  title,
  price,
  description,
  action,
  active,
  loading,
  onClick,
}: {
  title: string;
  price: string;
  description: string;
  action: string;
  active: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <div
      className={cn(
        "rounded-xl border bg-bg-surface/60 p-5 transition-all",
        active
          ? "border-accent-success/40 shadow-[0_0_24px_rgba(16,185,129,0.12)]"
          : "border-border-subtle hover:border-border-default",
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-primary" />
            <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
          </div>
          <p className="mt-2 text-2xl font-bold text-text-primary">{price}</p>
        </div>
        {active && (
          <Badge variant="success">{t("cloud.badges.active")}</Badge>
        )}
      </div>
      <p className="mb-5 text-sm text-text-tertiary">{description}</p>
      <Button
        type="button"
        variant={active ? "secondary" : "primary"}
        size="sm"
        isLoading={loading}
        onClick={onClick}
        disabled={active}
      >
        {active ? t("cloud.plans.current") : action}
      </Button>
    </div>
  );
}
