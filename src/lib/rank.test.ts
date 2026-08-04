import { describe, expect, it } from "vitest";
import { deriveRank } from "./rank";

describe("deriveRank", () => {
  it("returns null without an MMR value", () => {
    expect(deriveRank(null)).toBeNull();
    expect(deriveRank(undefined)).toBeNull();
    expect(deriveRank(Number.NaN)).toBeNull();
  });

  it("maps MMR onto the standard ladder", () => {
    expect(deriveRank(0)?.label).toBe("Bronze I");
    expect(deriveRank(300)?.label).toBe("Silver II");
    expect(deriveRank(620)?.label).toBe("Diamond I");
    expect(deriveRank(900)?.label).toBe("Champion II");
    expect(deriveRank(1100)?.label).toBe("Grand Champion I");
  });

  it("treats Supersonic Legend as division-less", () => {
    const ssl = deriveRank(1500);
    expect(ssl?.tier).toBe("Supersonic Legend");
    expect(ssl?.division).toBe(0);
    expect(ssl?.label).toBe("Supersonic Legend");
    expect(ssl?.short).toBe("SSL");
  });

  it("lands exactly on division boundaries", () => {
    expect(deriveRank(171)?.label).toBe("Bronze I");
    expect(deriveRank(172)?.label).toBe("Bronze II");
    expect(deriveRank(1331)?.tier).toBe("Grand Champion");
    expect(deriveRank(1332)?.tier).toBe("Supersonic Legend");
  });

  it("shifts 1v1 up, since duel MMR runs lower for the same skill", () => {
    // 600 sits in Platinum III on the standard ladder; the +120 duel offset
    // pushes the same number to 720, i.e. Diamond II.
    expect(deriveRank(600, "doubles")?.label).toBe("Platinum III");
    expect(deriveRank(600, "duel")?.label).toBe("Diamond II");
  });

  it("reports progress within the current division", () => {
    const start = deriveRank(612); // first point of Diamond I
    const end = deriveRank(671); // last point of Diamond I
    expect(start?.progress).toBeCloseTo(0, 1);
    expect(end?.progress).toBeGreaterThan(0.9);
  });

  it("produces compact labels for dense rows", () => {
    expect(deriveRank(620)?.short).toBe("D1");
    expect(deriveRank(1100)?.short).toBe("GC1");
  });
});
