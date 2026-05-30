import { create } from "zustand";

export interface MismatchInfo {
  detectedPrimaryId: string;
  detectedPlayerName: string;
  currentProfileId: string;
  currentProfileName: string;
  matchedProfileId: string | null;
  matchedProfileName: string | null;
  matchedProfileIsExactPrimaryId: boolean;
  autoSwitchEnabled: boolean;
}

interface AccountMismatchState {
  mismatch: MismatchInfo | null;
  showDialog: boolean;
  setMismatch: (info: MismatchInfo) => void;
  dismissDialog: () => void;
  clearMismatch: () => void;
}

export const useAccountMismatchStore = create<AccountMismatchState>((set) => ({
  mismatch: null,
  showDialog: false,
  setMismatch: (info) => set({ mismatch: info, showDialog: true }),
  dismissDialog: () => set({ showDialog: false }),
  clearMismatch: () => set({ mismatch: null, showDialog: false }),
}));
