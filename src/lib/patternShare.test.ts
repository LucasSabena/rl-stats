import { describe, expect, it } from "vitest";
import {
  buildFatigueShareContext,
  buildChemistryShareContext,
  buildMoodShareContext,
  buildCustomShareContext,
} from "./shareContext";

describe("pattern share builders", () => {
  it("builds a fatigue card with the breakpoint", () => {
    const ctx = buildFatigueShareContext(
      {
        totalMatches: 40,
        byGameNumber: [
          { label: "1", played: 8, winRate: 75 },
          { label: "2", played: 8, winRate: 62 },
          { label: "6", played: 8, winRate: 25 },
        ],
        breakpointGame: { splitAfter: 5, beforeWr: 68, afterWr: 31 },
        breakpointMinute: null,
      },
      [],
      "Yo",
      "Semana",
    );
    expect(ctx.stats.length).toBeGreaterThanOrEqual(3);
    expect(ctx.stats[0].highlight).toBe(true);
    expect(JSON.stringify(ctx.stats)).toContain("5");
  });

  it("builds a fatigue card without a breakpoint", () => {
    const ctx = buildFatigueShareContext(
      { totalMatches: 6, byGameNumber: [{ label: "1", played: 6, winRate: 50 }] },
      [],
      "Yo",
      "Semana",
    );
    expect(ctx.stats.length).toBeGreaterThanOrEqual(2);
  });

  it("builds a chemistry card around the best duo", () => {
    const ctx = buildChemistryShareContext(
      { name: "Messi", played: 12, winRate: 67 },
      5,
      ["Messi"],
      "Yo",
      "Mes",
    );
    expect(ctx.title).toContain("Química");
    expect(ctx.stats[1].value).toBe("67%");
  });

  it("builds a mood card with coverage", () => {
    const ctx = buildMoodShareContext(
      { label: "Feliz", played: 10, winRate: 70 },
      { label: "Enojado", played: 8, winRate: 25 },
      18,
      30,
      [],
      "Yo",
      "Mes",
    );
    expect(JSON.stringify(ctx.stats)).toContain("18/30");
  });

  it("builds a custom card from top buckets", () => {
    const ctx = buildCustomShareContext(
      "Hora · Win Rate %",
      [
        { label: "21:00", played: 10, winRate: 70 },
        { label: "22:00", played: 4, winRate: 25 },
      ],
      [],
      "Yo",
      "Mes",
    );
    expect(ctx.title).toBe("Hora · Win Rate %");
    expect(ctx.stats).toHaveLength(2);
    expect(ctx.stats[0].highlight).toBe(true);
  });
});
