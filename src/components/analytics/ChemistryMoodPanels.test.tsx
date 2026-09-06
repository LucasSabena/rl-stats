// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { ChemistryPanel } from "./ChemistryPanel";
import { MoodPanel } from "./MoodPanel";
import type { TeammateData, BreakdownData } from "@/lib/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

const teammates: TeammateData = {
  available: true,
  teammates: [
    { primaryId: "a", name: "Duo", played: 12, won: 8, lost: 4, winRate: 67, isFriend: true },
    { primaryId: "b", name: "Rando", played: 2, won: 0, lost: 2, winRate: 0, isFriend: false },
  ],
  byTeamSize: [
    { teamSize: 1, played: 6, won: 2, lost: 4, winRate: 33 },
    { teamSize: 2, played: 10, won: 6, lost: 4, winRate: 60 },
    { teamSize: 3, played: 4, won: 2, lost: 2, winRate: 50 },
  ],
  minSample: 3,
};

const moodBreakdown: BreakdownData = {
  available: true,
  dimension: "mood",
  minSample: 3,
  buckets: [
    { key: "very_happy", label: "very_happy", played: 10, won: 7, lost: 3, winRate: 70, avgGoals: 0, avgAssists: 0, avgSaves: 0, avgShots: 0, avgDemos: 0, avgScore: 0 },
    { key: "angry", label: "angry", played: 8, won: 2, lost: 6, winRate: 25, avgGoals: 0, avgAssists: 0, avgSaves: 0, avgShots: 0, avgDemos: 0, avgScore: 0 },
    { key: "unrated", label: "unrated", played: 12, won: 6, lost: 6, winRate: 50, avgGoals: 0, avgAssists: 0, avgSaves: 0, avgShots: 0, avgDemos: 0, avgScore: 0 },
  ],
};

const hooksState: { mates: TeammateData | undefined; mood: BreakdownData | undefined } = {
  mates: teammates,
  mood: moodBreakdown,
};

vi.mock("@/hooks/useAnalytics", () => ({
  useTeammateStats: () => ({ data: hooksState.mates, isLoading: false }),
  useCustomBreakdown: () => ({ data: hooksState.mood, isLoading: false }),
}));

const props = {
  period: "month" as const,
  playlist: "all" as const,
  matchType: "all" as const,
  scope: "me" as const,
  playerId: null,
  username: "Yo",
  friendsPresent: [] as string[],
  dateLabel: "Mes",
};

afterEach(() => cleanup());

describe("ChemistryPanel", () => {
  beforeEach(() => {
    hooksState.mates = teammates;
  });

  it("lists teammates with win rates and the friend tag", () => {
    render(<ChemistryPanel {...props} />);
    expect(screen.getByText("analytics:chemistry.title")).toBeDefined();
    expect(screen.getByText("Duo")).toBeDefined();
    expect(screen.getByText("67%")).toBeDefined();
    expect(screen.getByText("analytics:chemistry.friendTag")).toBeDefined();
    expect(screen.getByText("analytics:chemistry.soloq")).toBeDefined();
  });

  it("renders nothing without teammates", () => {
    hooksState.mates = { available: false };
    const { container } = render(<ChemistryPanel {...props} />);
    expect(container.textContent).toBe("");
  });
});

describe("MoodPanel", () => {
  beforeEach(() => {
    hooksState.mood = moodBreakdown;
  });

  it("shows win rate per mood with translated labels", () => {
    render(<MoodPanel {...props} />);
    expect(screen.getByText("analytics:mood.title")).toBeDefined();
    expect(screen.getByText("mood:options.very_happy")).toBeDefined();
    expect(screen.getByText("mood:options.angry")).toBeDefined();
    expect(screen.getByText("mood:unrated")).toBeDefined();
    expect(screen.getByText("70%")).toBeDefined();
    expect(screen.getByText("25%")).toBeDefined();
  });

  it("renders nothing without buckets", () => {
    hooksState.mood = { available: false };
    const { container } = render(<MoodPanel {...props} />);
    expect(container.textContent).toBe("");
  });
});
