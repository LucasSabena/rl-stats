import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { MatchType } from "@/lib/types";

export const CURRENT_ONBOARDING_VERSION = 2;

interface SettingsState {
  playerName: string;
  autoStart: boolean;
  hasCompletedOnboarding: boolean;
  onboardingVersion: number;
  rlPath: string | null;
  platform: "steam" | "epic" | null;
  defaultMatchType: MatchType;

  setAutoStart: (value: boolean) => void;
  setPlayerName: (value: string) => void;
  completeOnboarding: () => void;
  restartOnboarding: () => void;
  setRlPath: (path: string | null) => void;
  setPlatform: (platform: "steam" | "epic" | null) => void;
  setDefaultMatchType: (type: MatchType) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    immer((set) => ({
      autoStart: false,
      playerName: "",
      hasCompletedOnboarding: false,
      onboardingVersion: 0,
      rlPath: null,
      platform: null,
      defaultMatchType: "ranked",

      setAutoStart: (value) => set((state) => { state.autoStart = value; }),
      setPlayerName: (value) => set((state) => { state.playerName = value; }),
      completeOnboarding: () => set((state) => {
        state.hasCompletedOnboarding = true;
        state.onboardingVersion = CURRENT_ONBOARDING_VERSION;
      }),
      restartOnboarding: () => set((state) => {
        state.hasCompletedOnboarding = false;
        state.onboardingVersion = 0;
      }),
      setRlPath: (path) => set((state) => { state.rlPath = path; }),
      setPlatform: (platform) => set((state) => { state.platform = platform; }),
      setDefaultMatchType: (type) => set((state) => { state.defaultMatchType = type; }),
    })),
    { name: "settings-store" }
  )
);
