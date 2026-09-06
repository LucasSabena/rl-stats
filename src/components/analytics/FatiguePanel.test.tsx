// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { FatiguePanel } from "./FatiguePanel";
import type { SessionCurveData } from "@/lib/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

const curve: SessionCurveData = {
  available: true,
  totalMatches: 40,
  totalSessions: 6,
  byGameNumber: [
    { label: "1", n: 1, played: 8, won: 6, lost: 2, winRate: 75, avgGoals: 2, avgAssists: 1, avgSaves: 2, avgShots: 5, avgDemos: 0, avgScore: 300 },
    { label: "2", n: 2, played: 8, won: 5, lost: 3, winRate: 62, avgGoals: 2, avgAssists: 1, avgSaves: 2, avgShots: 5, avgDemos: 0, avgScore: 290 },
    { label: "6", n: 6, played: 8, won: 2, lost: 6, winRate: 25, avgGoals: 1, avgAssists: 0, avgSaves: 1, avgShots: 4, avgDemos: 0, avgScore: 200 },
  ],
  byMinute: [
    { label: "0-15", bucket: 0, startMinutes: 0, played: 12, won: 8, lost: 4, winRate: 67, avgGoals: 2, avgAssists: 1, avgSaves: 2, avgShots: 5, avgDemos: 0, avgScore: 300 },
    { label: "45-60", bucket: 3, startMinutes: 45, played: 10, won: 3, lost: 7, winRate: 30, avgGoals: 1, avgAssists: 0, avgSaves: 1, avgShots: 4, avgDemos: 0, avgScore: 210 },
  ],
  momentum: {
    afterWin: { label: "", played: 15, won: 9, lost: 6, winRate: 60, avgGoals: 0, avgAssists: 0, avgSaves: 0, avgShots: 0, avgDemos: 0, avgScore: 0 },
    afterLoss: { label: "", played: 15, won: 5, lost: 10, winRate: 33, avgGoals: 0, avgAssists: 0, avgSaves: 0, avgShots: 0, avgDemos: 0, avgScore: 0 },
    firstOfDay: { label: "", played: 6, won: 4, lost: 2, winRate: 67, avgGoals: 0, avgAssists: 0, avgSaves: 0, avgShots: 0, avgDemos: 0, avgScore: 0 },
    restOfDay: { label: "", played: 34, won: 14, lost: 20, winRate: 41, avgGoals: 0, avgAssists: 0, avgSaves: 0, avgShots: 0, avgDemos: 0, avgScore: 0 },
  },
  breakpointGame: { splitAfter: 2, beforeWr: 68, afterWr: 31, beforeN: 16, afterN: 8 },
  breakpointMinute: { splitAfterBucket: 0, splitAfterMinutes: 0, beforeWr: 67, afterWr: 30, beforeN: 12, afterN: 10 },
  minSample: 3,
};

const hooksState: { curve: SessionCurveData | undefined; loading: boolean } = {
  curve,
  loading: false,
};

vi.mock("@/hooks/useAnalytics", () => ({
  useSessionCurve: () => ({ data: hooksState.curve, isLoading: hooksState.loading }),
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

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

describe("FatiguePanel", () => {
  beforeEach(() => {
    hooksState.curve = curve;
    hooksState.loading = false;
  });

  it("renders the curve with breakpoint callout and momentum cells", () => {
    render(<FatiguePanel {...props} />);
    expect(screen.getByText("analytics:fatigue.title")).toBeDefined();
    expect(screen.getByText("analytics:fatigue.breakpointTitle")).toBeDefined();
    expect(screen.getByText("analytics:fatigue.momentum.afterWin")).toBeDefined();
    expect(screen.getByText("analytics:fatigue.momentum.afterLoss")).toBeDefined();
    expect(screen.getByText("60%")).toBeDefined();
    expect(screen.getByText("33%")).toBeDefined();
  });

  it("switches between game-number and minute tabs", () => {
    render(<FatiguePanel {...props} />);
    fireEvent.click(screen.getByText("analytics:fatigue.tabs.minutes"));
    expect(screen.getByText("analytics:fatigue.breakpointTitle")).toBeDefined();
    fireEvent.click(screen.getByText("analytics:fatigue.tabs.game"));
    expect(screen.getByText("analytics:fatigue.momentum.firstOfDay")).toBeDefined();
  });

  it("renders nothing when the curve is unavailable", () => {
    hooksState.curve = { available: false };
    const { container } = render(<FatiguePanel {...props} />);
    expect(container.textContent).toBe("");
  });
});
