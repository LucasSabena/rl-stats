// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MatchInfoPanel } from "./MatchInfoPanel";
import type { MatchDetail } from "@/lib/types";

afterEach(cleanup);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      (options?.defaultValue as string) ?? key,
    i18n: { language: "es" },
  }),
}));

function makeDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
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
    players: [],
    events: [],
    goals: [],
    ...overrides,
  };
}

describe("MatchInfoPanel", () => {
  it("labels a training row as training instead of a 0-0 draw", () => {
    render(<MatchInfoPanel match={makeDetail()} />);

    // Result and type columns both say "training" for a stint.
    expect(screen.getAllByText("matchType.training").length).toBeGreaterThan(0);
    expect(screen.queryByText("infoPanel.draw")).toBeNull();
  });

  it("keeps the win label for a real match", () => {
    render(
      <MatchInfoPanel
        match={makeDetail({
          matchType: "ranked",
          teamBlueScore: 3,
          teamOrangeScore: 1,
          winnerTeamNum: 0,
          localTeamNum: 0,
        })}
      />,
    );

    expect(screen.getByText("infoPanel.win")).toBeTruthy();
    expect(screen.queryByText("matchType.training")).toBeNull();
  });
});
