import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAccountMismatchStore } from "@/stores/accountMismatchStore";
import { useProfileStore } from "@/stores/profileStore";
import { restartApp, updateProfilePlayerIdentity } from "@/lib/api";

interface RawMismatchPayload {
  detected_primary_id: string;
  detected_player_name: string;
  current_profile_id: string;
  current_profile_name: string;
  matched_profile_id: string | null;
  matched_profile_name: string | null;
  matched_profile_is_exact_primary_id?: boolean;
  auto_switch_enabled?: boolean;
}

export function useAccountMismatch() {
  const setMismatch = useAccountMismatchStore((s) => s.setMismatch);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    async function setup() {
      unlisten = await listen<RawMismatchPayload>(
        "account-mismatch",
        (event) => {
          const payload = event.payload;
          const mismatch = {
            detectedPrimaryId: payload.detected_primary_id,
            detectedPlayerName: payload.detected_player_name,
            currentProfileId: payload.current_profile_id,
            currentProfileName: payload.current_profile_name,
            matchedProfileId: payload.matched_profile_id,
            matchedProfileName: payload.matched_profile_name,
            matchedProfileIsExactPrimaryId:
              payload.matched_profile_is_exact_primary_id ?? false,
            autoSwitchEnabled: payload.auto_switch_enabled ?? false,
          };

          setMismatch(mismatch);

          if (
            mismatch.autoSwitchEnabled &&
            mismatch.matchedProfileId &&
            mismatch.matchedProfileIsExactPrimaryId
          ) {
            void handleSwitchProfileAndRestart(mismatch.matchedProfileId);
          }
        },
      );
    }

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, [setMismatch]);

  const handleSwitchProfile = async (targetProfileId: string) => {
    const { switchProfile } = useProfileStore.getState();
    await switchProfile(targetProfileId);
    useAccountMismatchStore.getState().clearMismatch();
  };

  const handleSwitchProfileAndRestart = async (targetProfileId: string) => {
    const { switchProfile } = useProfileStore.getState();
    await switchProfile(targetProfileId);
    useAccountMismatchStore.getState().clearMismatch();
    await restartApp();
  };

  const handleSaveIdentity = async (
    profileId: string,
    primaryId: string,
    playerName: string,
  ) => {
    await updateProfilePlayerIdentity(profileId, primaryId, playerName);
    useAccountMismatchStore.getState().clearMismatch();
  };

  const handleDismiss = () => {
    useAccountMismatchStore.getState().dismissDialog();
  };

  return {
    handleSwitchProfile,
    handleSwitchProfileAndRestart,
    handleSaveIdentity,
    handleDismiss,
  };
}
