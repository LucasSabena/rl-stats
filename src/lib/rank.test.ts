import { describe, expect, it } from "vitest";
import { deriveRank, rankIconIndex } from "./rank";

describe("deriveRank", () => {
  it("returns null without an MMR value", () => {
    expect(deriveRank(null)).toBeNull();
    expect(deriveRank(undefined)).toBeNull();
    expect(deriveRank(Number.NaN)).toBeNull();
  });

  it("maps MMR onto the 3v3 ladder by default", () => {
    expect(deriveRank(0)?.label).toBe("Bronze I");
    expect(deriveRank(300)?.label).toBe("Silver I");
    expect(deriveRank(840)?.label).toBe("Diamond I");
    expect(deriveRank(1200)?.label).toBe("Champion II");
    expect(deriveRank(1440)?.label).toBe("Grand Champion I");
  });

  it("treats Supersonic Legend as division-less", () => {
    const ssl = deriveRank(1900, "standard");
    expect(ssl?.tier).toBe("Supersonic Legend");
    expect(ssl?.division).toBe(0);
    expect(ssl?.label).toBe("Supersonic Legend");
    expect(ssl?.short).toBe("SSL");
  });

  it("lands exactly on division boundaries", () => {
    expect(deriveRank(174, "standard")?.label).toBe("Bronze I");
    expect(deriveRank(175, "standard")?.label).toBe("Bronze II");
    expect(deriveRank(1884, "standard")?.tier).toBe("Grand Champion");
    expect(deriveRank(1885, "standard")?.tier).toBe("Supersonic Legend");
  });

  it("uses each playlist's own ladder", () => {
    // 1400 is Champion III on the 2v2/3v3 ladder…
    expect(deriveRank(1400, "doubles")?.label).toBe("Champion III");
    expect(deriveRank(1400, "standard")?.label).toBe("Champion III");
    // …but Supersonic Legend on the compressed 1v1 ladder.
    expect(deriveRank(1400, "duel")?.label).toBe("Supersonic Legend");
    // SSL starts at a different MMR per mode.
    expect(deriveRank(1862, "doubles")?.tier).toBe("Grand Champion");
    expect(deriveRank(1863, "doubles")?.tier).toBe("Supersonic Legend");
    expect(deriveRank(1340, "duel")?.tier).toBe("Grand Champion");
    expect(deriveRank(1341, "duel")?.tier).toBe("Supersonic Legend");
  });

  it("normalizes playlist names", () => {
    expect(deriveRank(1400, "Ranked Doubles")?.label).toBe("Champion III");
    expect(deriveRank(1400, "1v1")?.label).toBe("Supersonic Legend");
    expect(deriveRank(1400, "Solo Duel")?.label).toBe("Supersonic Legend");
  });

  it("reports progress within the current division", () => {
    const start = deriveRank(835, "standard"); // first point of Diamond I
    const end = deriveRank(914, "standard"); // last point of Diamond I
    expect(start?.progress).toBeCloseTo(0, 1);
    expect(end?.progress).toBeGreaterThan(0.9);
  });

  it("produces compact labels for dense rows", () => {
    expect(deriveRank(840, "standard")?.short).toBe("D1");
    expect(deriveRank(1440, "standard")?.short).toBe("GC1");
  });
});

describe("rankIconIndex", () => {
  const idx = (mmr: number, playlist?: string) => {
    const r = deriveRank(mmr, playlist);
    if (!r) throw new Error("expected a rank");
    return rankIconIndex(r);
  };

  it("maps onto the in-game 0-22 ladder", () => {
    expect(idx(0)).toBe(1); // Bronze I
    expect(idx(180)).toBe(2); // Bronze II
    expect(idx(300)).toBe(4); // Silver I
    expect(idx(840)).toBe(13); // Diamond I
    expect(idx(1200)).toBe(17); // Champion II
    expect(idx(1440)).toBe(19); // Grand Champion I
    expect(idx(1900)).toBe(22); // Supersonic Legend
  });

  it("covers every division without gaps or overlap", () => {
    const seen = new Set<number>();
    for (let mmr = 0; mmr <= 1900; mmr += 5) {
      const r = deriveRank(mmr, "standard");
      if (r) seen.add(rankIconIndex(r));
    }
    // 1..22 — every tier icon except Unranked, which has no MMR.
    expect([...seen].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 22 }, (_, i) => i + 1),
    );
  });
});
