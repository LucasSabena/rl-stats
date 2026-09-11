import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
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
import { syncCurrentProfileToCloud } from "@/lib/cloudSync";
import { CloudAccountSection } from "./CloudAccountSection";
import { CloudConnectionSection } from "./CloudConnectionSection";
import { CloudOverviewSection } from "./CloudOverviewSection";
import { CloudPlansSection } from "./CloudPlansSection";
import { CloudSyncSection } from "./CloudSyncSection";

const DEFAULT_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as
  | string
  | undefined;
const DEFAULT_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

function isActiveSubscription(subscription: CloudSubscription | null): boolean {
  return (
    subscription?.status === "active" || subscription?.status === "trialing"
  );
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
  const { t } = useTranslation("settings");
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
      <CloudOverviewSection
        hasCredentials={Boolean(credentials)}
        session={session}
        subscription={subscription}
        config={config}
        profileStatus={profileStatus}
        cloudStatus={cloudStatus}
        hasActivePlan={hasActivePlan}
        hasCloudAccess={hasCloudAccess}
      />

      <CloudConnectionSection
        config={config}
        setConfigState={setConfigState}
        onSave={() =>
          saveConfig({
            supabase_url: config.supabase_url,
            supabase_anon_key: config.supabase_anon_key,
          })
        }
        onRefresh={refresh}
      />

      <CloudAccountSection
        session={session}
        email={email}
        password={password}
        authMode={authMode}
        busyAction={busyAction}
        planStatusLabel={planStatusLabel}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onToggleAuthMode={() =>
          setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in")
        }
        onAuth={handleAuth}
        onSignOut={handleSignOut}
        onOpenPortal={openPortal}
      />

      <CloudPlansSection
        subscription={subscription}
        busyAction={busyAction}
        onCheckout={openCheckout}
      />

      <CloudSyncSection
        busyAction={busyAction}
        uploadDisabled={!session || !credentials || !hasActivePlan}
        syncDisabled={!session || !credentials}
        onUploadHistory={uploadExistingHistory}
        onSyncNow={syncNow}
      />
    </div>
  );
}
