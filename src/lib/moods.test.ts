import { describe, expect, it } from "vitest";
import { MOODS, isMoodKey, moodIcon, moodLabelKey, moodTone, UnratedIcon } from "./moods";
import { Laugh, Smile, Meh, Annoyed, Angry } from "lucide-react";

describe("moods", () => {
  it("exposes the five moods happiest-first", () => {
    expect(MOODS).toEqual(["very_happy", "happy", "neutral", "angry", "very_angry"]);
  });

  it("validates mood keys", () => {
    expect(isMoodKey("happy")).toBe(true);
    expect(isMoodKey("tilted")).toBe(false);
    expect(isMoodKey(null)).toBe(false);
    expect(isMoodKey(undefined)).toBe(false);
  });

  it("maps every mood to a distinct face icon", () => {
    expect(moodIcon("very_happy")).toBe(Laugh);
    expect(moodIcon("happy")).toBe(Smile);
    expect(moodIcon("neutral")).toBe(Meh);
    expect(moodIcon("angry")).toBe(Annoyed);
    expect(moodIcon("very_angry")).toBe(Angry);
  });

  it("falls back to the unrated placeholder for missing moods", () => {
    expect(moodIcon(null)).toBe(UnratedIcon);
    expect(moodIcon("neutral")).not.toBe(UnratedIcon);
    expect(moodLabelKey(null)).toBe("mood:unrated");
    expect(moodLabelKey("happy")).toBe("mood:options.happy");
  });

  it("grades tones from success to danger", () => {
    expect(moodTone("very_happy")).toContain("success");
    expect(moodTone("very_angry")).toContain("danger");
    expect(moodTone(null)).not.toContain("success");
  });
});
