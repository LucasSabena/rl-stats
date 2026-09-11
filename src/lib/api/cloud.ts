import {
  type CloudConfig,
  type CloudPushRequest,
  type CloudSyncStatus,
  type SyncStatus,
} from "../types";
import { invokeCommand } from "./core";

// ─── Cloud Sync ─────────────────────────────────────────────────────────────

export async function getCloudConfig(): Promise<CloudConfig> {
  return invokeCommand<CloudConfig>("get_cloud_config_cmd");
}

export async function setCloudConfig(config: CloudConfig): Promise<void> {
  return invokeCommand<void>("set_cloud_config_cmd", { config });
}

export async function getCloudSyncStatus(): Promise<CloudSyncStatus> {
  return invokeCommand<CloudSyncStatus>("get_cloud_sync_status_cmd");
}

export async function getProfileSyncStatus(): Promise<SyncStatus> {
  return invokeCommand<SyncStatus>("get_profile_sync_status_cmd");
}

export async function prepareCloudPushBatch(
  limit?: number,
): Promise<CloudPushRequest | null> {
  return invokeCommand<CloudPushRequest | null>(
    "prepare_cloud_push_batch_cmd",
    { limit },
  );
}

export async function markCloudPushSucceeded(
  outboxIds: number[],
  serverRevision = 0,
): Promise<void> {
  return invokeCommand<void>("mark_cloud_push_succeeded_cmd", {
    outboxIds,
    serverRevision,
  });
}

export async function markCloudPushFailed(
  outboxIds: number[],
  error: string,
): Promise<void> {
  return invokeCommand<void>("mark_cloud_push_failed_cmd", {
    outboxIds,
    error,
  });
}

export async function enqueueExistingProfileHistoryForSync(): Promise<number> {
  return invokeCommand<number>("enqueue_existing_profile_history_for_sync_cmd");
}

/** One change returned by the server's `sync_pull` RPC. */
export interface CloudRemoteChange {
  server_revision: number;
  entity_type: string;
  entity_key: string;
  operation: string;
  profile_id?: string | null;
  payload_json: unknown;
  created_at?: string;
}

export interface CloudApplySummary {
  applied: number;
  skipped: number;
  max_revision: number;
  touched_matches: boolean;
}

export async function applyCloudPullBatch(
  changes: CloudRemoteChange[],
): Promise<CloudApplySummary> {
  return invokeCommand<CloudApplySummary>("apply_cloud_pull_batch_cmd", {
    changes,
  });
}

export async function getLastPulledRevision(): Promise<number> {
  return invokeCommand<number>("get_last_pulled_revision_cmd");
}

export async function setLastPulledRevision(revision: number): Promise<void> {
  return invokeCommand<void>("set_last_pulled_revision_cmd", { revision });
}

export async function pruneSyncOutbox(olderThanDays = 30): Promise<number> {
  return invokeCommand<number>("prune_sync_outbox_cmd", { olderThanDays });
}

export async function createCloudBackup(): Promise<string> {
  return invokeCommand<string>("create_cloud_backup_cmd");
}
