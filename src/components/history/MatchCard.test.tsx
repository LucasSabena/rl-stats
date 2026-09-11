// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MatchCard } from "./MatchCard";
import type { MatchSummary } from "@/lib/types";

afterEach(cleanup);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      (options?.defaultValue as string) ?? key,
    i18n: { language: "es" },
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

function makeMatch(overrides: Partial<MatchSummary>): MatchSummary {
  return {
    id: 1,
    matchGuid: "guid-1",
    startTime: 1_760_000_000,
    endTime: 1_760_000_480,
    durationSeconds: 480,
    arena: null,
    teamBlueScore: 0,
    teamOrangeScore: 0,
    winnerTeamNum: null,
    localTeamNum: null,
    isOnline: false,
    isOvertime: false,
    matchType: "training",
    playlist: null,
    mood: null,
    ...overrides,
  };
}

describe("MatchCard", () => {
  it("shows the Free Play title and duration for a training row without arena", () => {
    render(<MatchCard match={makeMatch({})} />);

    expect(screen.getByText("history:titles.training")).toBeTruthy();
    expect(screen.getByText("8:00")).toBeTruthy();
  });

  it("keeps the dash for a real match without arena", () => {
    render(
      <MatchCard
        match={makeMatch({ matchType: "ranked", playlist: "Doubles", durationSeconds: 300 })}
      />,
    );

    expect(screen.queryByText("history:titles.training")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("5:00")).toBeTruthy();
  });

  it("does not show a zero duration for training", () => {
    render(<MatchCard match={makeMatch({ durationSeconds: 0 })} />);
    // The right column shows an em dash when the stint length is unknown.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
