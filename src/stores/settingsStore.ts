import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export const CURRENT_ONBOARDING_VERSION = 2;

/**
 * Local-only UI state for the onboarding flow.
 *
 * It deliberately stores *only* the onboarding bookkeeping: player name, RL
 * path, platform, autostart and default match type used to be mirrored here
 * as well, which duplicated the backend settings and let both sides drift
 * (the theme/language clobbering bug came from exactly that). Those values
 * live in `app_settings` and are read through `useSettings()`.
 */
interface SettingsState {
  hasCompletedOnboarding: boolean;
  onboardingVersion: number;

  completeOnboarding: () => void;
  restartOnboarding: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    immer((set) => ({
      hasCompletedOnboarding: false,
      onboardingVersion: 0,

      completeOnboarding: () =>
        set((state) => {
          state.hasCompletedOnboarding = true;
          state.onboardingVersion = CURRENT_ONBOARDING_VERSION;
        }),
      restartOnboarding: () =>
        set((state) => {
          state.hasCompletedOnboarding = false;
          state.onboardingVersion = 0;
        }),
    })),
    {
      name: "settings-store",
      // Older builds persisted the duplicated backend fields in the same
      // blob; keep only the onboarding flags when rehydrating.
      partialize: (state) => ({
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        onboardingVersion: state.onboardingVersion,
      }),
    }
  )
);
