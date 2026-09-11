import {
  applyCloudPullBatch,
  createCloudBackup,
  getActiveProfile,
  getCloudConfig,
  getCloudSyncStatus,
  getLastPulledRevision,
  getSettings,
  markCloudPushFailed,
  markCloudPushSucceeded,
  prepareCloudPushBatch,
  setCloudConfig,
  setLastPulledRevision,
} from "./api";
import type { CloudConfig, CloudPushRequest, Profile } from "./types";
import {
  ensureFreshCloudSession,
  getCloudSubscription,
  getLatestServerRevision,
  hasCloudSyncAccess,
  listCloudProfiles,
  pullCloudChanges,
  pushCloudChanges,
  wipeCloudProfile,
  type CloudSession,
  type CloudSubscription,
} from "./cloudClient";

const DEFAULT_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as
  | string
  | undefined;
const DEFAULT_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

const PULL_PAGE_SIZE = 500;
const MAX_PULL_PAGES = 20;

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

interface CloudAccess {
  config: CloudConfig;
  credentials: { supabaseUrl: string; supabaseAnonKey: string };
  session: CloudSession;
  subscription: CloudSubscription | null;
  cloudProfileId: string;
}

type CloudAccessResult =
  | ({ ok: true } & CloudAccess)
  | { ok: false; skippedReason: string };

/**
 * Resolves config, credentials, session, plan and the cloud profile id.
 *
 * Shared by push, pull and wipe so all three follow the exact same gating.
 */
async function resolveCloudAccess(): Promise<CloudAccessResult> {
  let config = withEnvDefaults(await getCloudConfig());
  const credentials = getCredentials(config);
  if (!credentials) return { ok: false, skippedReason: "missing_config" };

  const session = await ensureFreshCloudSession(credentials);
  if (!session) return { ok: false, skippedReason: "signed_out" };

  const [subscription, hasAccess] = await Promise.all([
    getCloudSubscription(credentials, session),
    hasCloudSyncAccess(credentials, session),
  ]);
  const hasActivePlan =
    hasAccess ||
    isActiveSubscription(subscription) ||
    config.plan_status === "active";
  if (!hasActivePlan) return { ok: false, skippedReason: "inactive_plan" };

  const ensured = await ensureCloudProfile(config, credentials, session);
  config = ensured.config;

  return {
    ok: true,
    config,
    credentials,
    session,
    subscription,
    cloudProfileId: ensured.cloudProfileId,
  };
}

function persistedConfig(
  access: CloudAccess,
): CloudConfig {
  return {
    ...access.config,
    enabled: true,
    cloud_sync_enabled: true,
    cloud_profile_id: access.cloudProfileId,
    plan_code: access.subscription?.plan_code ?? access.config.plan_code ?? null,
    plan_status: access.subscription?.status ?? access.config.plan_status ?? null,
  };
}

export async function syncCurrentProfileToCloud(): Promise<{
  uploaded: number;
  skippedReason?: string;
}> {
  const settings = await getSettings();
  if (settings.autoSyncOnMatchEnd === false) {
    return { uploaded: 0, skippedReason: "auto_sync_disabled" };
  }

  const access = await resolveCloudAccess();
  if (!access.ok) return { uploaded: 0, skippedReason: access.skippedReason };

  await setCloudConfig(persistedConfig(access));

  const batch = await prepareCloudPushBatch(250);
  if (!batch) return { uploaded: 0 };

  const outboxIds = batch.p_changes
    .map((change) => change.local_outbox_id)
    .filter((id) => id > 0);

  try {
    const response = await pushCloudChanges(access.credentials, access.session, {
      ...batch,
      p_profile_id: access.cloudProfileId,
    });

    // The response used to be ignored: a 200 with `processed: 0` (or a
    // partial batch) still marked every row as synced, silently dropping
    // data. Accept only a processed batch or an idempotent replay.
    const accepted =
      response.duplicate ||
      (response.status === "processed" &&
        response.processed >= outboxIds.length);
    if (!accepted) {
      throw new Error(
        `Cloud accepted ${response.processed}/${outboxIds.length} changes`
      );
    }

    // Record the server revision when we can read it; 0 only means "unknown".
    let revision = 0;
    try {
      revision = await getLatestServerRevision(
        access.credentials,
        access.session,
      );
    } catch {
      // Non-fatal: the revision is bookkeeping for future conflict handling.
    }

    await markCloudPushSucceeded(outboxIds, revision);
    await setCloudConfig({
      ...persistedConfig(access),
      last_sync_at: new Date().toISOString(),
    });
    return { uploaded: outboxIds.length };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cloud sync failed";
    if (outboxIds.length > 0) await markCloudPushFailed(outboxIds, message);
    throw error;
  }
}

export interface CloudPullResult {
  applied: number;
  skipped: number;
  pages: number;
  skippedReason?: string;
}

/**
 * Pulls remote changes and applies them to SQLite.
 *
 * The first pull on a device snapshots the database first: applying a full
 * remote history is the most destructive sync operation there is.
 */
export async function pullCurrentProfileFromCloud(): Promise<CloudPullResult> {
  const access = await resolveCloudAccess();
  if (!access.ok) {
    return { applied: 0, skipped: 0, pages: 0, skippedReason: access.skippedReason };
  }

  const lastRevision = await getLastPulledRevision();
  if (lastRevision === 0) {
    try {
      await createCloudBackup();
    } catch {
      // Backup is best-effort; the pull itself is idempotent.
    }
  }

  let after = lastRevision;
  let applied = 0;
  let skipped = 0;
  let pages = 0;

  for (let page = 0; page < MAX_PULL_PAGES; page++) {
    const changes = await pullCloudChanges(
      access.credentials,
      access.session,
      after,
      PULL_PAGE_SIZE,
    );
    if (changes.length === 0) break;

    const summary = await applyCloudPullBatch(
      changes.map((change) => ({
        server_revision: change.server_revision,
        entity_type: change.entity_type,
        entity_key: change.entity_key,
        operation: change.operation,
        payload_json: change.payload_json,
      })),
    );
    applied += summary.applied;
    skipped += summary.skipped;
    pages += 1;
    after = Math.max(after, summary.max_revision);

    if (changes.length < PULL_PAGE_SIZE) break;
  }

  return { applied, skipped, pages };
}

/** Deletes this profile's cloud data. Returns false when cloud is not set up. */
export async function wipeCurrentProfileFromCloud(): Promise<boolean> {
  const access = await resolveCloudAccess();
  if (!access.ok) return false;

  await wipeCloudProfile(
    access.credentials,
    access.session,
    access.cloudProfileId,
  );
  // Everything was deleted server-side, including the change log; restart
  // the local cursor so nothing can resurrect the wiped rows.
  await setLastPulledRevision(0);
  return true;
}
