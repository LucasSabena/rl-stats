import type { TrackerProfile } from "../types";
import { invokeCommand } from "./core";

// ─── Tracker Network / RLStats Profile ───────────────────────────────────────

export async function fetchTrackerProfile(): Promise<TrackerProfile> {
  return invokeCommand<TrackerProfile>("fetch_tracker_profile");
}

export async function getCachedProfile(): Promise<TrackerProfile | null> {
  return invokeCommand<TrackerProfile | null>("get_cached_profile");
}

export async function refreshTrackerProfile(): Promise<TrackerProfile> {
  return invokeCommand<TrackerProfile>("refresh_tracker_profile");
}

export async function fetchRlstatsProfile(): Promise<TrackerProfile> {
  return invokeCommand<TrackerProfile>("fetch_rlstats_profile");
}

export async function getCachedRlstatsProfile(): Promise<TrackerProfile | null> {
  return invokeCommand<TrackerProfile | null>("get_cached_rlstats_profile");
}

export async function refreshRlstatsProfile(): Promise<TrackerProfile> {
  return invokeCommand<TrackerProfile>("refresh_rlstats_profile");
}
