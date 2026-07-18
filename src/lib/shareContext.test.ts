import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMatchShareContext } from "./shareContext";
import type { MatchDetail, PlayerStats } from "./types";

function player(id: string, name: string, team: 0 | 1, score: number): PlayerStats {
  return {
    id,
    name,
    team,
    score,
    goals: team === 1 ? 2 : 1,
    assists: 1,
    saves: 2,
    shots: 3,
    demos: 0,
    touches: 12,
    boostAmount: 50,
    speed: 80,
  };
}

function match(players: PlayerStats[]): MatchDetail {
  return {
    id: 1,
    matchGuid: "match-1",
    startTime: 1_700_000_000,
    endTime: 1_700_000_300,
    durationSeconds: 300,
    arena: "DFH Stadium",
    teamBlueScore: 1,
    teamOrangeScore: 2,
    winnerTeamNum: 1,
    localTeamNum: 1,
    isOnline: true,
    isOvertime: false,
    matchType: "ranked",
    playlist: "Doubles",
    players,
    events: [],
    goals: [],
  };
}

describe("buildMatchShareContext", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the match roster immutable while sorting the share roster", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const players = [player("low", "Low", 0, 120), player("high", "High", 1, 640)];
    const originalOrder = players.map((entry) => entry.id);

    const context = buildMatchShareContext(match(players), [], "High", "high", "es-AR");

    expect(players.map((entry) => entry.id)).toEqual(originalOrder);
    expect(context.matchPlayers?.map((entry) => entry.name)).toEqual(["High", "Low"]);
    expect(context.teamScore).toBe(2);
    expect(context.opponentScore).toBe(1);
    expect(context.win).toBe(true);
  });
});
