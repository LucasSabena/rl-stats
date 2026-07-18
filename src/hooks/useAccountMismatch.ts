import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAccountMismatchStore } from "@/stores/accountMismatchStore";
import { useProfileStore } from "@/stores/profileStore";
import {
  detectLocalAccounts,
  findMatchingProfile,
  getActiveProfile,
  getSettings,
  restartApp,
  updateProfilePlayerIdentity,
} from "@/lib/api";

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

      // Steam exposes the currently active local account before the first
      // match packet arrives, so profile mismatches can be resolved up front.
      try {
        const [settings, activeProfile, accounts] = await Promise.all([
          getSettings(),
          getActiveProfile(),
          detectLocalAccounts(),
        ]);
        const activeAccount = accounts.find((account) => account.active);
        if (
          activeAccount &&
          settings.warnOnProfileMismatch !== false &&
          settings.localPrimaryId !== activeAccount.primary_id
        ) {
          const match = await findMatchingProfile(
            activeAccount.primary_id,
            activeAccount.display_name,
          );
          setMismatch({
            detectedPrimaryId: activeAccount.primary_id,
            detectedPlayerName: activeAccount.display_name,
            currentProfileId: activeProfile.id,
            currentProfileName: activeProfile.name,
            matchedProfileId:
              match && match.id !== activeProfile.id ? match.id : null,
            matchedProfileName:
              match && match.id !== activeProfile.id ? match.name : null,
            matchedProfileIsExactPrimaryId:
              Boolean(match?.local_primary_id) &&
              match?.local_primary_id === activeAccount.primary_id,
            autoSwitchEnabled: settings.autoSwitchProfileOnExactMatch ?? false,
          });
        }
      } catch {
        // Steam may not be installed or Tauri may still be starting. Live
        // packet identity detection remains the authoritative fallback.
      }
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
