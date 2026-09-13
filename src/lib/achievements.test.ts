import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, evaluateAchievements } from "./achievements";
import type { CareerRecords } from "./types";

function records(overrides: Partial<CareerRecords> = {}): CareerRecords {
  return {
    totalMatches: 0,
    wins: 0,
    losses: 0,
    totalGoals: 0,
    totalAssists: 0,
    totalSaves: 0,
    totalShots: 0,
    totalDemos: 0,
    playtimeSeconds: 0,
    avgScore: 0,
    avgBoost: 0,
    peakSpeed: 0,
    hatTricks: 0,
    overtimeWins: 0,
    overtimeMatches: 0,
    firstMatch: null,
    lastMatch: null,
    bestStreak: 0,
    currentStreak: 0,
    records: [],
    bestDay: null,
    bestSession: null,
    longestSession: null,
    ...overrides,
  };
}

describe("evaluateAchievements", () => {
  it("returns one status per achievement with zero progress for a new profile", () => {
    const statuses = evaluateAchievements(records());
    expect(statuses).toHaveLength(ACHIEVEMENTS.length);
    expect(statuses.every((status) => !status.unlocked)).toBe(true);
    expect(statuses.every((status) => status.progress === 0)).toBe(true);
  });

  it("unlocks achievements at their thresholds", () => {
    const statuses = evaluateAchievements(
      records({
        totalMatches: 100,
        totalGoals: 150,
        bestStreak: 10,
        peakSpeed: 2200,
        playtimeSeconds: 100 * 3600,
        hatTricks: 25,
      })
    );
    const byId = Object.fromEntries(statuses.map((status) => [status.def.id, status]));
    expect(byId["first_match"].unlocked).toBe(true);
    expect(byId["matches_100"].unlocked).toBe(true);
    expect(byId["matches_1000"].unlocked).toBe(false);
    expect(byId["goals_100"].unlocked).toBe(true);
    expect(byId["streak_10"].unlocked).toBe(true);
    expect(byId["speed_2100"].unlocked).toBe(true);
    expect(byId["playtime_100h"].unlocked).toBe(true);
    expect(byId["hat_tricks_25"].unlocked).toBe(true);
  });

  it("caps progress at 1", () => {
    const [first] = evaluateAchievements(records({ totalMatches: 5000 }));
    expect(first.progress).toBe(1);
  });
});
