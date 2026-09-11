import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteTrainingPack,
  listTrainingPacks,
  upsertTrainingPack,
  type StoredTrainingPack,
  type TrainingPackUpsert,
} from "@/lib/api";

export const trainingPackQueryKeys = {
  list: ["training-packs"] as const,
};

/** Legacy localStorage blob from builds where packs were browser-only. */
const LEGACY_KEY = "rl-training-packs";

interface LegacyPack {
  id?: unknown;
  name?: unknown;
  code?: unknown;
  creator?: unknown;
  category?: unknown;
  difficulty?: unknown;
  description?: unknown;
  tags?: unknown;
  sourceUrl?: unknown;
}

function toUpsert(pack: LegacyPack): TrainingPackUpsert | null {
  const name = typeof pack.name === "string" ? pack.name : "";
  const code = typeof pack.code === "string" ? pack.code : "";
  if (!name.trim() || !code.trim()) return null;
  return {
    id: typeof pack.id === "string" ? pack.id : undefined,
    name,
    code,
    creator: typeof pack.creator === "string" ? pack.creator : "",
    category: typeof pack.category === "string" ? pack.category : "",
    difficulty: typeof pack.difficulty === "string" ? pack.difficulty : "",
    description: typeof pack.description === "string" ? pack.description : "",
    tags: Array.isArray(pack.tags) ? pack.tags.map(String) : [],
    sourceUrl: typeof pack.sourceUrl === "string" ? pack.sourceUrl : null,
  };
}

/**
 * One-time migration: if the database has no packs yet but the legacy
 * localStorage blob does, import them through the normal upsert path (which
 * also enqueues them for cloud sync) and drop the packs from the blob while
 * preserving favorites.
 */
async function migrateLegacyPacks(
  packs: StoredTrainingPack[],
): Promise<StoredTrainingPack[]> {
  if (packs.length > 0) return packs;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return packs;
    const parsed = JSON.parse(raw) as {
      userPacks?: LegacyPack[];
      favorites?: unknown;
    };
    const legacy = Array.isArray(parsed.userPacks) ? parsed.userPacks : [];
    if (legacy.length === 0) return packs;

    let imported = 0;
    for (const pack of legacy) {
      const upsert = toUpsert(pack);
      if (!upsert) continue;
      await upsertTrainingPack(upsert);
      imported += 1;
    }

    if (imported > 0) {
      const favorites = Array.isArray(parsed.favorites) ? parsed.favorites : [];
      localStorage.setItem(LEGACY_KEY, JSON.stringify({ favorites }));
      return await listTrainingPacks();
    }
  } catch {
    // Unreadable legacy storage: keep whatever the backend has.
  }
  return packs;
}

export function useUserTrainingPacks() {
  return useQuery({
    queryKey: trainingPackQueryKeys.list,
    queryFn: async () => migrateLegacyPacks(await listTrainingPacks()),
    staleTime: 60_000,
  });
}

export function useTrainingPackMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: trainingPackQueryKeys.list });

  return {
    addTrainingPack: useMutation({
      mutationFn: (pack: TrainingPackUpsert) => upsertTrainingPack(pack),
      onSuccess: invalidate,
    }),
    removeTrainingPack: useMutation({
      mutationFn: (id: string) => deleteTrainingPack(id),
      onSuccess: invalidate,
    }),
  };
}
