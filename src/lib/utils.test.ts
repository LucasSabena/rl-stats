import { describe, expect, it } from "vitest";
import { formatDuration, formatElapsedClock } from "./utils";

describe("formatElapsedClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatElapsedClock(0)).toBe("0:00");
    expect(formatElapsedClock(65)).toBe("1:05");
    expect(formatElapsedClock(599)).toBe("9:59");
  });

  it("adds the hour segment only when needed", () => {
    expect(formatElapsedClock(3600)).toBe("1:00:00");
    expect(formatElapsedClock(3661)).toBe("1:01:01");
  });

  it("never goes negative", () => {
    expect(formatElapsedClock(-5)).toBe("0:00");
  });
});

describe("formatDuration", () => {
  it("formats match durations", () => {
    expect(formatDuration(480)).toBe("8:00");
    expect(formatDuration(59)).toBe("0:59");
  });
});
