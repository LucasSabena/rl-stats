import { useCallback, useEffect, useMemo, useState } from "react";
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

function planLabel(planCode?: string | null): string {
  if (planCode === "cloud_supporter") return "Supporter";
  if (planCode === "cloud_basic") return "Basic";
  return "No plan";
}

function getCredentials(config: CloudConfig) {
  const supabaseUrl = config.supabase_url?.trim();
  const supabaseAnonKey = config.supabase_anon_key?.trim();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return { supabaseUrl, supabaseAnonKey };
}

export function CloudSyncPanel() {
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
        title: "Cloud sync",
        message:
          error instanceof Error
            ? error.message
            : "Could not load cloud status",
      });
    });
  }, [addToast, refresh]);

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
        title: "Cloud sync",
        message: "Set Supabase URL and anon key first.",
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
        title: "Cloud account connected",
        message: "Your RL Stats account is ready.",
      });
    } catch (error) {
      addToast({
        type: "error",
        title: "Cloud login failed",
        message: error instanceof Error ? error.message : "Please try again.",
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
        title: "Checkout opened",
        message: "Complete Stripe Checkout, then refresh this panel.",
      });
    } catch (error) {
      addToast({
        type: "error",
        title: "Checkout failed",
        message:
          error instanceof Error ? error.message : "Could not open checkout.",
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
        title: "Billing portal failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not open billing portal.",
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
        title: "Cloud sync locked",
        message: "Choose a plan before syncing.",
      });
      return;
    }

    setBusyAction("sync");
    try {
      const result = await syncCurrentProfileToCloud();
      addToast({
        type: "success",
        title: "Cloud sync complete",
        message:
          result.uploaded > 0
            ? `${result.uploaded} local changes uploaded.`
            : "No pending changes to upload.",
      });
    } catch (error) {
      addToast({
        type: "error",
        title: "Cloud sync failed",
        message: error instanceof Error ? error.message : "Cloud sync failed.",
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
        title: "Existing history queued",
        message: `${enqueued} local records queued; ${result.uploaded} changes uploaded in this batch.`,
      });
    } catch (error) {
      addToast({
        type: "error",
        title: "History upload failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not upload existing history.",
      });
    } finally {
      setBusyAction(null);
      await refresh();
    }
  };

  if (!config || !cloudStatus || !profileStatus) {
    return (
      <div className="rounded-xl border border-border-subtle bg-bg-surface/60 p-5 text-sm text-text-secondary">
        Loading cloud sync…
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
                  Cloud Sync
                </h3>
                <p className="text-xs text-text-tertiary">
                  Local-first backup for profiles, matches, players and
                  settings.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={credentials ? "success" : "danger"}>
                {credentials
                  ? "Supabase configured"
                  : "Missing Supabase config"}
              </Badge>
              <Badge variant={session ? "success" : "default"}>
                {session ? (session.user.email ?? "Signed in") : "Signed out"}
              </Badge>
              <Badge variant={hasActivePlan ? "success" : "accent"}>
                {hasCloudAccess
                  ? "Owner / tester"
                  : planLabel(subscription?.plan_code ?? config.plan_code)}
              </Badge>
              <Badge variant={config.enabled ? "live" : "default"}>
                {config.enabled ? "Sync enabled" : "Manual/off"}
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right text-xs sm:grid-cols-4 lg:min-w-105">
            <StatusMetric
              label="Pending"
              value={profileStatus.pending_changes}
            />
            <StatusMetric
              label="Failed"
              value={profileStatus.failed_changes}
              danger={profileStatus.failed_changes > 0}
            />
            <StatusMetric
              label="App queue"
              value={cloudStatus.pending_app_changes}
            />
            <StatusMetric
              label="Last sync"
              value={
                config.last_sync_at
                  ? new Date(config.last_sync_at).toLocaleDateString()
                  : "Never"
              }
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-surface/60 p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 text-accent-primary" />
          <h4 className="text-sm font-semibold text-text-secondary">
            Connection
          </h4>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <input
            className={inputClass}
            value={config.supabase_url ?? ""}
            onChange={(event) =>
              setConfigState({ ...config, supabase_url: event.target.value })
            }
            placeholder="Supabase URL"
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
            placeholder="Supabase anon key"
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
            Save cloud config
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={RefreshCw}
            onClick={refresh}
          >
            Refresh status
          </Button>
        </div>
      </section>

      {!session ? (
        <section className="rounded-xl border border-border-subtle bg-bg-surface/60 p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <UserRound className="h-4 w-4 text-accent-primary" />
            <h4 className="text-sm font-semibold text-text-secondary">
              Cloud account
            </h4>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@example.com"
            />
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
            />
            <Button
              type="button"
              isLoading={busyAction === "auth"}
              onClick={handleAuth}
            >
              {authMode === "sign-in" ? "Sign in" : "Create account"}
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
              ? "Need an account? Create one"
              : "Already have an account? Sign in"}
          </button>
        </section>
      ) : (
        <section className="rounded-xl border border-border-subtle bg-bg-surface/60 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Signed in as {session.user.email ?? session.user.id}
              </p>
              <p className="text-xs text-text-tertiary">
                Subscription:{" "}
                {subscription?.status ?? config.plan_status ?? "inactive"}
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
                Manage billing
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leftIcon={LogOut}
                onClick={handleSignOut}
                isLoading={busyAction === "sign-out"}
              >
                Sign out
              </Button>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <PlanCard
          title="Basic"
          price="$3/mo"
          description="Cloud backup and sync for your RL Stats data."
          action="Choose Basic"
          active={subscription?.plan_code === "cloud_basic"}
          loading={busyAction === "cloud_basic"}
          onClick={() => openCheckout("cloud_basic")}
        />
        <PlanCard
          title="Supporter"
          price="$6/mo"
          description="Same features, extra support for development."
          action="Choose Supporter"
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
                Sync this profile
              </h4>
              <p className="text-xs text-text-tertiary">
                Uploads a bounded batch from the local outbox. Pull/merge is
                still intentionally not automatic.
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
              Upload existing history
            </Button>
            <Button
              type="button"
              variant="accent"
              leftIcon={RefreshCw}
              isLoading={busyAction === "sync"}
              disabled={!session || !credentials}
              onClick={syncNow}
            >
              Sync now
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
      <p className="text-[10px] uppercase tracking-wide text-text-muted">
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
        {active && <Badge variant="success">Active</Badge>}
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
        {active ? "Current plan" : action}
      </Button>
    </div>
  );
}
