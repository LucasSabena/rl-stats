import {
  type OverlayServerStatus,
  type OverlayUrl,
  type OverlayWindowState,
} from "../types";
import { invokeCommand } from "./core";

// ─── Overlay / OBS Streaming ─────────────────────────────────────────────────

export async function startOverlayServer(
  port: number,
): Promise<OverlayServerStatus> {
  return invokeCommand<OverlayServerStatus>("start_overlay_server", { port });
}

export async function stopOverlayServer(): Promise<void> {
  return invokeCommand<void>("stop_overlay_server");
}

export async function getOverlayServerStatus(): Promise<OverlayServerStatus> {
  return invokeCommand<OverlayServerStatus>("get_overlay_server_status");
}

export async function getOverlayUrls(): Promise<OverlayUrl[]> {
  return invokeCommand<OverlayUrl[]>("get_overlay_urls");
}

export async function getOverlayState(): Promise<Record<string, unknown>> {
  return invokeCommand<Record<string, unknown>>("get_overlay_state");
}

// ─── Overlay Window ─────────────────────────────────────────────────────────

export async function createOverlayWindow(): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("create_overlay_window");
}

export async function destroyOverlayWindow(): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("destroy_overlay_window");
}

export async function getOverlayWindowState(): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("get_overlay_window_state");
}

export async function toggleOverlayEnabled(): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("toggle_overlay_enabled");
}

export async function updateOverlayPosition(
  x: number,
  y: number,
): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("update_overlay_position", { x, y });
}

export async function updateOverlaySize(
  width: number,
  height: number,
): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("update_overlay_size", {
    width,
    height,
  });
}

export async function updateOverlayOpacity(
  opacity: number,
): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("update_overlay_opacity", {
    opacity,
  });
}

export async function setOverlayClickthrough(
  clickthrough: boolean,
): Promise<OverlayWindowState> {
  return invokeCommand<OverlayWindowState>("set_overlay_clickthrough", {
    clickthrough,
  });
}

export async function notifyOverlaySettingsChanged(): Promise<void> {
  return invokeCommand<void>("notify_overlay_settings_changed");
}

export async function setOverlayInteractive(
  durationSecs: number,
): Promise<void> {
  return invokeCommand<void>("set_overlay_interactive", { durationSecs });
}
