import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

/**
 * Favorites are a personal UI preference (they can point at curated packs the
 * database does not own), so they stay in localStorage. The user-created
 * packs themselves moved to SQLite (migration v26) and are managed by
 * `useUserTrainingPacks` / `useTrainingPackMutations`.
 */
interface TrainingPacksState {
  favorites: Set<string>;
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
}

const STORAGE_KEY = "rl-training-packs";

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { favorites?: string[] };
      return new Set<string>(parsed.favorites ?? []);
    }
  } catch {
    // ignore parse errors
  }
  return new Set<string>();
}

export const useTrainingPacksStore = create<TrainingPacksState>()(
  immer((set, get) => ({
    favorites: loadFavorites(),

    toggleFavorite: (id) =>
      set((state) => {
        if (state.favorites.has(id)) {
          state.favorites.delete(id);
        } else {
          state.favorites.add(id);
        }
      }),

    isFavorite: (id) => get().favorites.has(id),
  }))
);

useTrainingPacksStore.subscribe((state) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ favorites: Array.from(state.favorites) }),
    );
  } catch {
    // Storage may be full or unavailable; favorites stay in memory.
  }
});
