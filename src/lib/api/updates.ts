import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

// ─── App lifecycle & Updates ────────────────────────────────────────────────

export async function restartApp(): Promise<void> {
  return relaunch();
}

// Updates
export async function checkForUpdate(): Promise<Update | null> {
  return check();
}
