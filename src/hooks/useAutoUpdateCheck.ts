import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { useUIStore } from "@/stores/uiStore";
import i18n from "@/i18n";

/**
 * Automatically checks for updates once when the app starts.
 * Shows a toast if an update is available, but does NOT auto-download
 * to avoid interrupting the user.
 */
export function useAutoUpdateCheck() {
  const addToast = useUIStore((state) => state.addToast);
  const hasChecked = useRef(false);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    // Skip auto-check in dev mode (not running inside Tauri)
    if (import.meta.env.DEV && !(window as unknown as Record<string, unknown>).__TAURI__) {
      return;
    }

    void (async () => {
      try {
        const result = await check();
        if (result) {
          addToast({
            type: "info",
            title: i18n.t("settings:update.toasts.available.title", {
              version: result.version,
            }),
            message: i18n.t("settings:update.toasts.available.message"),
          });
        }
      } catch {
        // Silently ignore auto-check errors — user can manually check in Settings.
      }
    })();
  }, [addToast]);
}
