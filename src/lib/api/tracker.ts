import type { TrackerProfile } from "../types";
import { invokeCommand } from "./core";

// ─── Tracker Network / RLStats Profile ───────────────────────────────────────
// Live rlstats.net lookups go through the embedded WebView2 scraper on the
// Rust side; there is deliberately no HTTP client for it any more. This module
// only reads whatever profile was already cached locally.

export async function fetchTrackerProfile(): Promise<TrackerProfile> {
  return invokeCommand<TrackerProfile>("fetch_tracker_profile");
}

export async function getCachedProfile(): Promise<TrackerProfile | null> {
  return invokeCommand<TrackerProfile | null>("get_cached_profile");
}

export async function refreshTrackerProfile(): Promise<TrackerProfile> {
  return invokeCommand<TrackerProfile>("refresh_tracker_profile");
}

export async function getCachedRlstatsProfile(): Promise<TrackerProfile | null> {
  return invokeCommand<TrackerProfile | null>("get_cached_rlstats_profile");
}
