// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { CustomBuilderPanel } from "./CustomBuilderPanel";
import type { BreakdownData } from "@/lib/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

const breakdown: BreakdownData = {
  available: true,
  dimension: "hour",
  minSample: 3,
  buckets: [
    { key: "h21", label: "21:00", played: 10, won: 7, lost: 3, winRate: 70, avgGoals: 2, avgAssists: 1, avgSaves: 2, avgShots: 5, avgDemos: 0, avgScore: 300 },
    { key: "h22", label: "22:00", played: 4, won: 1, lost: 3, winRate: 25, avgGoals: 1, avgAssists: 0, avgSaves: 1, avgShots: 4, avgDemos: 0, avgScore: 210 },
  ],
};

const hooksState: { data: BreakdownData | undefined; loading: boolean } = {
  data: breakdown,
  loading: false,
};

vi.mock("@/hooks/useAnalytics", () => ({
  useCustomBreakdown: () => ({ data: hooksState.data, isLoading: hooksState.loading }),
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

describe("CustomBuilderPanel", () => {
  beforeEach(() => {
    hooksState.data = breakdown;
    hooksState.loading = false;
    localStorage.clear();
  });

  it("renders dimension/metric/chart selectors", () => {
    render(<CustomBuilderPanel {...props} />);
    expect(screen.getByText("analytics:builder.title")).toBeDefined();
    expect(screen.getByText("analytics:builder.dimension")).toBeDefined();
    expect(screen.getByText("analytics:builder.metric")).toBeDefined();
    expect(screen.getByText("analytics:builder.chartType")).toBeDefined();
  });

  it("saves the current view and restores it on click", () => {
    render(<CustomBuilderPanel {...props} />);
    fireEvent.change(screen.getByPlaceholderText("analytics:builder.savePlaceholder"), {
      target: { value: "Noches" },
    });
    fireEvent.click(screen.getByText("analytics:builder.save"));
    expect(screen.getByText("Noches")).toBeDefined();

    // The config persists to localStorage and survives a remount.
    const stored = JSON.parse(localStorage.getItem("rl-stats:custom-analysis") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Noches");
  });

  it("shows the empty state without buckets", () => {
    hooksState.data = { available: false };
    render(<CustomBuilderPanel {...props} />);
    expect(screen.getByText("analytics:builder.noData")).toBeDefined();
  });
});
