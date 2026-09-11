import {
  type LiveMatchState,
  type ConnectionStatus,
  type PlayerStats,
  type LiveMmrSnapshot,
  type MmrProviderHealth,
  type MmrProviderTestResult,
} from "../types";
import {
  invokeCommand,
  mapConnectionStatus,
  mapLiveState,
  type RawConnectionStatus,
  type RawLiveMatchState,
} from "./core";

// ─── Live ───────────────────────────────────────────────────────────────────

// Live match
export async function getLiveState(): Promise<LiveMatchState | null> {
  const state = await invokeCommand<RawLiveMatchState | null>("get_live_state");
  return mapLiveState(state);
}

export async function getLiveHeadToHead(
  opponentIds: string[],
): Promise<Record<string, NonNullable<PlayerStats["head_to_head"]>>> {
  return invokeCommand<
    Record<string, NonNullable<PlayerStats["head_to_head"]>>
  >("get_live_head_to_head", {
    opponentIds,
  });
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const status = await invokeCommand<RawConnectionStatus>(
    "get_connection_status",
  );
  return mapConnectionStatus(status);
}

// MMR en vivo
export async function fetchLiveMmrSnapshot(
  forceRefresh?: boolean,
): Promise<LiveMmrSnapshot> {
  return invokeCommand<LiveMmrSnapshot>("fetch_live_mmr_snapshot", {
    forceRefresh: forceRefresh ?? false,
  });
}

export async function setSessionMmrSnapshot(
  mmrByPrimaryId: Record<string, number | null>,
): Promise<void> {
  return invokeCommand<void>("set_session_mmr_snapshot", { mmrByPrimaryId });
}

export async function setLocalMmr(
  playlist: string,
  mmr: number,
): Promise<void> {
  return invokeCommand<void>("set_local_mmr", { playlist, mmr });
}

export async function getMmrProviderHealth(): Promise<MmrProviderHealth[]> {
  return invokeCommand<MmrProviderHealth[]>("get_mmr_provider_health");
}

export async function testMmrProvider(
  provider: string,
): Promise<MmrProviderTestResult> {
  return invokeCommand<MmrProviderTestResult>(
    "test_mmr_provider",
    { provider },
    { timeoutMs: 60_000 },
  );
}
