import {
  type BroadcastAsset,
  type BroadcastPack,
  type BroadcastScene,
  type BroadcastTeam,
  type BroadcastToken,
  type ChatStatus,
  type PacksResponse,
  type SeriesSnapshot,
  type SceneModule,
} from "../types";
import { invokeCommand } from "./core";

// ─── Broadcast Studio (Control Room) ────────────────────────────────────────

export async function setBroadcastState(stateName: string): Promise<void> {
  return invokeCommand<void>("set_broadcast_state", { stateName });
}

export async function setBroadcastDelay(seconds: number): Promise<void> {
  return invokeCommand<void>("set_broadcast_delay", { seconds });
}

export async function controlBroadcastTimer(
  op: "start" | "stop",
  seconds?: number,
  label?: string,
): Promise<void> {
  return invokeCommand<void>("control_broadcast_timer", {
    op,
    seconds: seconds ?? null,
    label: label ?? null,
  });
}

export async function setGraphicVisibility(
  id: string,
  visible: boolean,
): Promise<void> {
  return invokeCommand<void>("set_graphic_visibility", { id, visible });
}

export async function sendGameCommand(
  command: string,
  data?: Record<string, unknown>,
): Promise<void> {
  return invokeCommand<void>("send_game_command", {
    command,
    data: data ?? null,
  });
}

export async function refreshBroadcast(): Promise<void> {
  return invokeCommand<void>("refresh_broadcast");
}

export async function getDockUrl(): Promise<string> {
  return invokeCommand<string>("get_dock_url");
}

export async function getLanUrl(): Promise<string | null> {
  return invokeCommand<string | null>("get_lan_url");
}

// ─── Tokens ─────────────────────────────────────────────────────────────────

export async function listBroadcastTokens(): Promise<BroadcastToken[]> {
  return invokeCommand<BroadcastToken[]>("list_broadcast_tokens");
}

export async function createBroadcastToken(
  role: "admin" | "referee" | "viewer",
  label: string,
): Promise<BroadcastToken> {
  return invokeCommand<BroadcastToken>("create_broadcast_token", { role, label });
}

export async function revokeBroadcastToken(id: string): Promise<void> {
  return invokeCommand<void>("revoke_broadcast_token", { id });
}

// ─── Assets ─────────────────────────────────────────────────────────────────

export async function listBroadcastAssets(
  kind?: "logo" | "image" | "font" | "audio",
): Promise<BroadcastAsset[]> {
  return invokeCommand<BroadcastAsset[]>("list_broadcast_assets", {
    kind: kind ?? null,
  });
}

export async function uploadBroadcastAsset(input: {
  kind: string;
  name: string;
  mime: string;
  dataBase64: string;
}): Promise<BroadcastAsset> {
  return invokeCommand<BroadcastAsset>("upload_broadcast_asset", {
    kind: input.kind,
    name: input.name,
    mime: input.mime,
    dataBase64: input.dataBase64,
  });
}

export async function deleteBroadcastAsset(id: string): Promise<void> {
  return invokeCommand<void>("delete_broadcast_asset", { id });
}

// ─── Packs ──────────────────────────────────────────────────────────────────

export async function listBroadcastPacks(): Promise<PacksResponse> {
  return invokeCommand<PacksResponse>("list_broadcast_packs");
}

export async function saveBroadcastPack(input: {
  id?: string | null;
  name: string;
  baseId?: string | null;
  tokens: Record<string, unknown>;
  layouts?: Record<string, unknown> | null;
}): Promise<BroadcastPack> {
  return invokeCommand<BroadcastPack>("save_broadcast_pack", {
    id: input.id ?? null,
    name: input.name,
    baseId: input.baseId ?? null,
    tokens: input.tokens,
    layouts: input.layouts ?? null,
  });
}

export async function deleteBroadcastPack(id: string): Promise<void> {
  return invokeCommand<void>("delete_broadcast_pack", { id });
}

// ─── Scenes ─────────────────────────────────────────────────────────────────

export async function listBroadcastScenes(): Promise<BroadcastScene[]> {
  return invokeCommand<BroadcastScene[]>("list_broadcast_scenes");
}

export async function saveBroadcastScene(input: {
  id?: string | null;
  name: string;
  packId: string;
  sceneState: string;
  layout: Record<string, SceneModule>;
}): Promise<BroadcastScene> {
  return invokeCommand<BroadcastScene>("save_broadcast_scene", {
    id: input.id ?? null,
    name: input.name,
    packId: input.packId,
    sceneState: input.sceneState,
    layout: input.layout,
  });
}

export async function deleteBroadcastScene(id: string): Promise<void> {
  return invokeCommand<void>("delete_broadcast_scene", { id });
}

// ─── Teams ──────────────────────────────────────────────────────────────────

export async function listTeams(): Promise<BroadcastTeam[]> {
  return invokeCommand<BroadcastTeam[]>("list_teams");
}

export async function saveTeam(input: {
  id?: string | null;
  name: string;
  tag: string;
  colorPrimary: string;
  colorSecondary: string;
  logoAssetId?: string | null;
}): Promise<BroadcastTeam> {
  return invokeCommand<BroadcastTeam>("save_team", {
    id: input.id ?? null,
    name: input.name,
    tag: input.tag,
    colorPrimary: input.colorPrimary,
    colorSecondary: input.colorSecondary,
    logoAssetId: input.logoAssetId ?? null,
  });
}

export async function deleteTeam(id: string): Promise<void> {
  return invokeCommand<void>("delete_team", { id });
}

// ─── Series ─────────────────────────────────────────────────────────────────

export async function getSeriesState(): Promise<SeriesSnapshot> {
  return invokeCommand<SeriesSnapshot>("get_series_state");
}

export async function createSeries(input: {
  name: string;
  format: number;
  teamAId?: string | null;
  teamBId?: string | null;
}): Promise<SeriesSnapshot> {
  return invokeCommand<SeriesSnapshot>("create_series", {
    input: {
      name: input.name,
      format: input.format,
      teamAId: input.teamAId ?? null,
      teamBId: input.teamBId ?? null,
    },
  });
}

export async function updateSeriesScore(
  scoreA: number,
  scoreB: number,
): Promise<void> {
  return invokeCommand<void>("update_series_score", { scoreA, scoreB });
}

export async function recordSeriesGame(input: {
  winnerTeamId?: string | null;
  scoreA: number;
  scoreB: number;
  arena?: string | null;
  durationSeconds?: number | null;
  matchId?: number | null;
}): Promise<void> {
  return invokeCommand<void>("record_series_game", {
    winnerTeamId: input.winnerTeamId ?? null,
    scoreA: input.scoreA,
    scoreB: input.scoreB,
    arena: input.arena ?? null,
    durationSeconds: input.durationSeconds ?? null,
    matchId: input.matchId ?? null,
  });
}

export async function resetSeries(): Promise<void> {
  return invokeCommand<void>("reset_series");
}

export async function deleteSeries(id: string): Promise<void> {
  return invokeCommand<void>("delete_series_cmd", { id });
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export async function configureChat(config: {
  enabled: boolean;
  twitchChannel: string;
  kickChannel: string;
}): Promise<ChatStatus> {
  return invokeCommand<ChatStatus>("configure_chat", { config });
}

export async function getChatStatus(): Promise<ChatStatus> {
  return invokeCommand<ChatStatus>("get_chat_status");
}
