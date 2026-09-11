import {
  type FriendRecord,
  type PlayerDetailRecord,
  type PlayerDirectoryEntry,
} from "../types";
import { invokeCommand } from "./core";

// ─── Player Directory ─────────────────────────────────────────────────────────

export async function getPlayerDirectory(filters?: {
  search?: string;
  relationship?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
}): Promise<PlayerDirectoryEntry[]> {
  const response = await invokeCommand<{ players: PlayerDirectoryEntry[] }>(
    "get_player_directory",
    {
      filters: {
        search: filters?.search ?? undefined,
        relationship: filters?.relationship ?? undefined,
        sort_by: filters?.sortBy ?? undefined,
        limit: filters?.limit ?? 100,
        offset: filters?.offset ?? 0,
      },
    },
  );
  return response.players;
}

/**
 * Fetch a player by local row id, or by Rocket League PrimaryId.
 *
 * Live matches and match detail only carry the PrimaryId, so profiles have to
 * be reachable by that too — a numeric-only lookup made every player link from
 * those screens dead.
 */
export async function getPlayerDetail(
  player: number | string,
): Promise<PlayerDetailRecord | null> {
  if (typeof player === "number") {
    return invokeCommand<PlayerDetailRecord>("get_player_detail", {
      playerId: player,
    });
  }
  return invokeCommand<PlayerDetailRecord>("get_player_detail_by_primary_id", {
    primaryId: player,
  });
}

// ─── Friends ─────────────────────────────────────────────────────────────────

export async function addFriend(playerId: number, tag?: string): Promise<void> {
  return invokeCommand<void>("add_friend_cmd", { playerId, tag });
}

export async function removeFriend(playerId: number): Promise<void> {
  return invokeCommand<void>("remove_friend_cmd", { playerId });
}

export async function getFriends(): Promise<FriendRecord[]> {
  return invokeCommand<FriendRecord[]>("get_friends_cmd");
}

export async function isFriend(playerId: number): Promise<boolean> {
  return invokeCommand<boolean>("is_friend_cmd", { playerId });
}
