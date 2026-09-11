import { invokeCommand } from "./core";

/**
 * User training packs are canonical SQLite rows (migration v26). Every
 * mutation enqueues a `training_pack` entity in the sync outbox; the server
 * stores it through its generic `cloud_profile_entities` table.
 */
export interface StoredTrainingPack {
  id: string;
  name: string;
  code: string;
  creator: string;
  category: string;
  difficulty: string;
  description: string;
  tags: string[];
  sourceUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TrainingPackUpsert {
  id?: string | null;
  name: string;
  code: string;
  creator?: string;
  category?: string;
  difficulty?: string;
  description?: string;
  tags?: string[];
  sourceUrl?: string | null;
}

export async function listTrainingPacks(): Promise<StoredTrainingPack[]> {
  return invokeCommand<StoredTrainingPack[]>("list_training_packs");
}

export async function upsertTrainingPack(
  pack: TrainingPackUpsert,
): Promise<StoredTrainingPack> {
  return invokeCommand<StoredTrainingPack>("upsert_training_pack", { pack });
}

export async function deleteTrainingPack(id: string): Promise<boolean> {
  return invokeCommand<boolean>("delete_training_pack", { id });
}
