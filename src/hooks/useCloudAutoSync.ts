import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { syncCurrentProfileToCloud } from "@/lib/cloudSync";
import { useUIStore } from "@/stores/uiStore";

interface MatchSummaryPayload {
  match_guid?: string;
  guid?: string;
}

export function useCloudAutoSync() {
  const syncingRef = useRef(false);
  const syncedMatchesRef = useRef(new Set<string>());
  const addToast = useUIStore((state) => state.addToast);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    async function setup() {
      unlisten = await listen<MatchSummaryPayload>("match-summary", async (event) => {
        const matchGuid = event.payload.match_guid ?? event.payload.guid;
        if (matchGuid && syncedMatchesRef.current.has(matchGuid)) return;
        if (syncingRef.current) return;

        syncingRef.current = true;
        try {
          const result = await syncCurrentProfileToCloud();
          if (matchGuid) syncedMatchesRef.current.add(matchGuid);
          if (result.uploaded > 0) {
            addToast({
              type: "success",
              title: "Cloud Sync",
              message: `${result.uploaded} changes uploaded after the match.`,
            });
          }
        } catch (error) {
          addToast({
            type: "error",
            title: "Cloud Sync failed",
            message: error instanceof Error ? error.message : "Could not upload match data.",
          });
        } finally {
          syncingRef.current = false;
        }
      });
    }

    setup().catch(() => {
      // Running outside Tauri/browser preview: auto sync is unavailable.
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [addToast]);
}
