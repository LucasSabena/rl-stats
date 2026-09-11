import {
  type MatchDetail,
  type MatchFilters,
  type MatchSummary,
} from "../types";
import { formatLocalDateFromUnix } from "../utils";
import {
  invokeCommand,
  mapGoal,
  mapMatchSummary,
  mapPlayerStats,
  mapRlEvent,
  type RawGoal,
  type RawMatchPlayer,
  type RawMatchSummary,
  type RawRlEvent,
} from "./core";

// History
export async function getMatches(
  filters?: MatchFilters,
): Promise<MatchSummary[]> {
  const response = await invokeCommand<{ matches: RawMatchSummary[] }>(
    "get_matches",
    {
      filters: {
        limit: filters?.limit,
        offset: filters?.offset,
        match_type: filters?.matchType ?? undefined,
        playlist: filters?.mode ?? undefined,
        result: filters?.result ?? undefined,
        date_from: filters?.dateFrom
          ? formatLocalDateFromUnix(filters.dateFrom)
          : undefined,
        date_to: filters?.dateTo
          ? formatLocalDateFromUnix(filters.dateTo)
          : undefined,
        search: filters?.search ?? undefined,
      },
    },
  );
  return response.matches.map(mapMatchSummary);
}

export async function getMatchDetail(matchId: number): Promise<MatchDetail> {
  const response = await invokeCommand<{
    match: RawMatchSummary;
    players: RawMatchPlayer[];
    events: RawRlEvent[];
    goals: RawGoal[];
  }>("get_match_detail", {
    matchId,
  });
  return {
    ...mapMatchSummary(response.match),
    players: response.players.map(mapPlayerStats),
    events: response.events.map(mapRlEvent),
    goals: response.goals.map(mapGoal),
  };
}

export async function deleteMatch(matchId: number): Promise<void> {
  return invokeCommand<void>("delete_match_cmd", { matchId });
}

export async function updateMatch(
  matchId: number,
  data: { matchType?: string | null; playlist?: string | null },
): Promise<void> {
  return invokeCommand<void>("update_match_cmd", {
    matchId,
    matchType: data.matchType ?? null,
    playlist: data.playlist ?? null,
  });
}

export async function setMatchMood(matchId: number, mood: string | null): Promise<void> {
  return invokeCommand<void>("set_match_mood_cmd", {
    matchId,
    mood: mood ?? null,
  });
}

/**
 * Pull model for the prompt window: returns the pending prompt payload when
 * the backend stored one recently (cold-start safe — push events emitted
 * before this JS mounts are lost, see tauri-apps/tauri#3484).
 */
export async function getPendingPrompt(): Promise<{
  kind: string;
  match_id?: number;
  matchId?: number;
} | null> {
  return invokeCommand("get_pending_prompt", {});
}

/**
 * Hide the prompt window and drop the pending payload on the backend. Called
 * after the player answers or skips so a stale payload can never resurrect
 * the prompt.
 */
export async function hidePrompt(): Promise<void> {
  return invokeCommand("hide_prompt", {});
}

export async function exportHistoryCsv(filters?: MatchFilters): Promise<string> {
  return invokeCommand<string>("export_history_csv", {
    filters: {
      limit: filters?.limit,
      offset: filters?.offset,
      arena: undefined,
      match_type: filters?.matchType ?? undefined,
      playlist: filters?.mode ?? undefined,
      result: filters?.result ?? undefined,
      date_from: filters?.dateFrom
        ? formatLocalDateFromUnix(filters.dateFrom)
        : undefined,
      date_to: filters?.dateTo
        ? formatLocalDateFromUnix(filters.dateTo)
        : undefined,
      search: filters?.search ?? undefined,
    },
  });
}
