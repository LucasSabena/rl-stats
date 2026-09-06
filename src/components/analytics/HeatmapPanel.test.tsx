// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { HeatmapPanel } from "./HeatmapPanel";
import type { InsightsData } from "@/lib/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

const insights: InsightsData = {
  available: true,
  totalMatches: 10,
  byHour: [],
  bestHour: 21,
  bestHourWR: 70,
  heatmap: [
    { weekday: 0, hour: 21, played: 4, won: 3, winRate: 75 },
    { weekday: 5, hour: 10, played: 1, won: 0, winRate: 0 },
  ],
  minSample: 3,
};

afterEach(() => cleanup());

describe("HeatmapPanel", () => {
  it("renders the weekly grid with weekday rows and legend", () => {
    render(<HeatmapPanel insights={insights} />);
    expect(screen.getByText("analytics:heatmap.title")).toBeDefined();
    expect(screen.getByText("analytics:heatmap.weekdays.mon")).toBeDefined();
    expect(screen.getByText("analytics:heatmap.weekdays.sun")).toBeDefined();
    expect(screen.getByText("analytics:heatmap.legendGood")).toBeDefined();
    // Populated cells expose tooltips (mocked t returns the key for both).
    expect(screen.getAllByTitle("analytics:heatmap.cellTooltip")).toHaveLength(2);
    expect(screen.getAllByTitle("analytics:heatmap.cellEmpty").length).toBeGreaterThan(100);
  });

  it("renders nothing without heatmap data", () => {
    const { container } = render(<HeatmapPanel insights={{ available: false }} />);
    expect(container.textContent).toBe("");
  });
});
