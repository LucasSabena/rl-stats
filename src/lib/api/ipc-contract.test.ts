import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * IPC argument contract.
 *
 * Tauri converts every command's Rust parameter names to camelCase
 * (`match_type` -> `matchType`, `player_id` -> `playerId`), and a `struct`
 * argument is a single nested object with its original snake_case fields.
 * Sending snake_case top-level keys does not fail loudly: `Option<T>` params
 * simply deserialize to `None`, so filters silently stopped working. These
 * tests pin the exact payloads so a rename cannot regress unnoticed.
 *
 * They also caught `get_session_matches`, which was sending
 * `{ startTime, endTime }` while Rust expects `{ query: { start_time,
 * end_time } }` — every session detail request was rejected.
 */

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

const api = await import("@/lib/api");

function lastCall(): { command: string; args: Record<string, unknown> } {
  expect(invokeMock).toHaveBeenCalled();
  const [command, args] = invokeMock.mock.calls.at(-1) as [
    string,
    Record<string, unknown>,
  ];
  return { command, args };
}

describe("IPC argument contract", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    // Tolerant default: every command's response mapper sees the shape it
    // expects, so the test can focus on the request payload.
    invokeMock.mockResolvedValue({
      rollups: [],
      matches: [],
      players: [],
      sessions: [],
      points: [],
      playlists: [],
      summary: {},
    });
  });

  it("sends matching the Rust `query` struct for session matches", async () => {
    await api.getSessionMatches("2026-09-01T00:00:00+00:00", "2026-09-01T02:00:00+00:00");

    const { command, args } = lastCall();
    expect(command).toBe("get_session_matches");
    expect(args).toMatchObject({
      query: {
        start_time: "2026-09-01T00:00:00+00:00",
        end_time: "2026-09-01T02:00:00+00:00",
      },
    });
  });

  it("uses camelCase top-level keys in analytics commands", async () => {
    await api.getAnalytics("week", {
      playlist: "doubles",
      matchType: "ranked",
      scope: "me",
    });

    const { command, args } = lastCall();
    expect(command).toBe("get_analytics");
    expect(args).toMatchObject({
      playlist: "doubles",
      matchType: "ranked",
      scope: "me",
      period: { days: 7 },
    });
    expect(args).not.toHaveProperty("match_type");
  });

  it("sends camelCase filters to sessions, rollups and insights", async () => {
    await api.getSessions(30, { playlist: "doubles", matchType: "ranked", scope: "team" });
    expect(lastCall().args).toMatchObject({
      gapMinutes: 30,
      playlist: "doubles",
      matchType: "ranked",
      scope: "team",
    });

    await api.getDailyRollups("week", { matchType: "ranked" });
    expect(lastCall().args).toMatchObject({
      startDate: expect.any(String),
      endDate: expect.any(String),
      matchType: "ranked",
    });
    expect(lastCall().args).not.toHaveProperty("match_type");

    await api.getInsights("week", { playerId: "Steam|1|2", matchType: "ranked" });
    expect(lastCall().args).toMatchObject({
      playerId: "Steam|1|2",
      matchType: "ranked",
    });
    expect(lastCall().args).not.toHaveProperty("player_id");
  });

  it("sends camelCase playerId/matchType to the pattern endpoints", async () => {
    await api.getSessionCurve("week", { playerId: "Steam|1|2", matchType: "ranked" });
    expect(lastCall().args).toMatchObject({
      playerId: "Steam|1|2",
      matchType: "ranked",
    });

    await api.getTeammateStats("week", { playerId: "Steam|1|2" });
    expect(lastCall().args).toMatchObject({ playerId: "Steam|1|2" });

    await api.getCustomBreakdown("week", "hour", { playerId: "Steam|1|2" });
    expect(lastCall().args).toMatchObject({ playerId: "Steam|1|2", dimension: "hour" });
  });

  it("keeps snake_case inside nested structs (serde field names)", async () => {
    await api.getMatches({ matchType: "ranked", dateFrom: 1_700_000_000_000 });

    const { command, args } = lastCall();
    expect(command).toBe("get_matches");
    const filters = args.filters as Record<string, unknown>;
    expect(filters).toHaveProperty("match_type", "ranked");
    expect(filters).toHaveProperty("date_from");
    expect(filters).not.toHaveProperty("matchType");
  });

  it("uses camelCase for profile command parameters", async () => {
    await api.createProfile("Smurf", "Smurfette");
    expect(lastCall()).toMatchObject({
      command: "create_profile_cmd",
      args: { name: "Smurf", playerName: "Smurfette" },
    });

    await api.renameProfile("p1", "Main");
    expect(lastCall()).toMatchObject({
      command: "rename_profile_cmd",
      args: { id: "p1", newName: "Main" },
    });
  });

  it("sends comparison and mmr history payloads with camelCase keys", async () => {
    await api.getAnalyticsComparison("players", "Steam|1|2", "Epic|3|4", "week", {
      matchType: "ranked",
    });
    expect(lastCall()).toMatchObject({
      command: "get_analytics_comparison",
      args: {
        mode: "players",
        playerId: "Steam|1|2",
        rivalId: "Epic|3|4",
        matchType: "ranked",
      },
    });

    await api.getMmrHistory("Steam|1|2", "doubles", "month");
    expect(lastCall()).toMatchObject({
      command: "get_mmr_history",
      args: { playerId: "Steam|1|2", playlist: "doubles", period: { days: 30 } },
    });
  });
});
