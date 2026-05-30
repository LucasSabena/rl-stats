import {
  getActiveProfile,
  getCloudConfig,
  getCloudSyncStatus,
  getSettings,
  markCloudPushFailed,
  markCloudPushSucceeded,
  prepareCloudPushBatch,
  setCloudConfig,
} from "./api";
import type { CloudConfig, CloudPushRequest, Profile } from "./types";
import {
  ensureFreshCloudSession,
  getCloudSubscription,
  hasCloudSyncAccess,
  listCloudProfiles,
  pushCloudChanges,
  type CloudSubscription,
} from "./cloudClient";

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

function withEnvDefaults(config: CloudConfig): CloudConfig {
  return {
    ...config,
    supabase_url: config.supabase_url ?? DEFAULT_SUPABASE_URL ?? null,
    supabase_anon_key:
      config.supabase_anon_key ?? DEFAULT_SUPABASE_ANON_KEY ?? null,
    cloud_profile_ids: config.cloud_profile_ids ?? {},
  };
}

function getCredentials(config: CloudConfig) {
  const supabaseUrl = config.supabase_url?.trim();
  const supabaseAnonKey = config.supabase_anon_key?.trim();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return { supabaseUrl, supabaseAnonKey };
}

function buildProfileBootstrapRequest(
  profile: Profile,
  deviceId: string,
): CloudPushRequest {
  return {
    p_local_device_id: deviceId,
    p_device_name: null,
    p_platform: navigator.platform || "desktop",
    p_app_version: import.meta.env.PACKAGE_VERSION ?? "dev",
    p_batch_idempotency_key: `${deviceId}:profile-bootstrap:${profile.id}:${Date.now()}`,
    p_profile_id: null,
    p_changes: [
      {
        local_outbox_id: -1,
        entity_type: "profile",
        entity_key: profile.id,
        operation: "upsert",
        payload_json: {
          local_profile_id: profile.id,
          name: profile.name,
          created_at: profile.createdAt,
        },
        idempotency_key: `${deviceId}:profile:${profile.id}`,
      },
    ],
  };
}

async function ensureCloudProfile(
  config: CloudConfig,
  credentials: { supabaseUrl: string; supabaseAnonKey: string },
  session: Awaited<ReturnType<typeof ensureFreshCloudSession>>,
): Promise<{ config: CloudConfig; cloudProfileId: string }> {
  if (!session) throw new Error("Cloud session is required");

  const activeProfile = await getActiveProfile();
  const existingCloudProfileId = config.cloud_profile_ids?.[activeProfile.id];
  if (existingCloudProfileId) {
    return { config, cloudProfileId: existingCloudProfileId };
  }

  const deviceId =
    (await getCloudSyncStatus()).device_id || crypto.randomUUID();
  await pushCloudChanges(
    credentials,
    session,
    buildProfileBootstrapRequest(activeProfile, deviceId),
  );
  const profiles = await listCloudProfiles(credentials, session);
  const matchingProfile =
    profiles.find((profile) => profile.entity_key === activeProfile.id) ??
    profiles[0];
  if (!matchingProfile) throw new Error("Could not create cloud profile");

  const cloudProfileIds = {
    ...(config.cloud_profile_ids ?? {}),
    [activeProfile.id]: matchingProfile.id,
  };
  const nextConfig = {
    ...config,
    cloud_profile_id: matchingProfile.id,
    cloud_profile_ids: cloudProfileIds,
  };
  await setCloudConfig(nextConfig);

  return { config: nextConfig, cloudProfileId: matchingProfile.id };
}

export async function syncCurrentProfileToCloud(): Promise<{
  uploaded: number;
  skippedReason?: string;
}> {
  const settings = await getSettings();
  if (settings.autoSyncOnMatchEnd === false) {
    return { uploaded: 0, skippedReason: "auto_sync_disabled" };
  }

  let config = withEnvDefaults(await getCloudConfig());
  const credentials = getCredentials(config);
  if (!credentials) return { uploaded: 0, skippedReason: "missing_config" };

  const session = await ensureFreshCloudSession(credentials);
  if (!session) return { uploaded: 0, skippedReason: "signed_out" };

  const [subscription, hasAccess] = await Promise.all([
    getCloudSubscription(credentials, session),
    hasCloudSyncAccess(credentials, session),
  ]);
  const hasActivePlan =
    hasAccess ||
    isActiveSubscription(subscription) ||
    config.plan_status === "active";
  if (!hasActivePlan) return { uploaded: 0, skippedReason: "inactive_plan" };

  const ensured = await ensureCloudProfile(config, credentials, session);
  config = ensured.config;
  const cloudProfileId = ensured.cloudProfileId;

  await setCloudConfig({
    ...config,
    enabled: true,
    cloud_sync_enabled: true,
    cloud_profile_id: cloudProfileId,
    plan_code: subscription?.plan_code ?? config.plan_code ?? null,
    plan_status: subscription?.status ?? config.plan_status ?? null,
  });

  const batch = await prepareCloudPushBatch(250);
  if (!batch) return { uploaded: 0 };

  const outboxIds = batch.p_changes
    .map((change) => change.local_outbox_id)
    .filter((id) => id > 0);

  try {
    await pushCloudChanges(credentials, session, {
      ...batch,
      p_profile_id: cloudProfileId,
    });
    await markCloudPushSucceeded(outboxIds);
    await setCloudConfig({
      ...config,
      enabled: true,
      cloud_sync_enabled: true,
      cloud_profile_id: cloudProfileId,
      last_sync_at: new Date().toISOString(),
      plan_code: subscription?.plan_code ?? config.plan_code ?? null,
      plan_status: subscription?.status ?? config.plan_status ?? null,
    });
    return { uploaded: outboxIds.length };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cloud sync failed";
    if (outboxIds.length > 0) await markCloudPushFailed(outboxIds, message);
    throw error;
  }
}
