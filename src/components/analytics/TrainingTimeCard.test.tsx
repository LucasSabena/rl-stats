// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { TrainingTimeCard } from "./TrainingTimeCard";
import type { TrainingStats } from "@/lib/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

const stats: TrainingStats = {
  totalSessions: 3,
  totalSeconds: 5400,
  avgSessionSeconds: 1800,
  days: [
    { date: "2026-09-06", sessions: 2, totalSeconds: 3600 },
    { date: "2026-09-07", sessions: 1, totalSeconds: 1800 },
  ],
  byHour: [],
  enabled: true,
};

const hookState: { data: TrainingStats | undefined; loading: boolean } = {
  data: stats,
  loading: false,
};

vi.mock("@/hooks/useTrainingAnalytics", () => ({
  useTrainingAnalytics: () => ({ data: hookState.data, isLoading: hookState.loading }),
}));

describe("TrainingTimeCard", () => {
  it("renders totals, sessions and average", () => {
    render(<TrainingTimeCard period="week" />);
    expect(screen.getByText("analytics:training.title")).toBeTruthy();
    expect(screen.getByText("1 h 30 min")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("30 min")).toBeTruthy();
    cleanup();
  });

  it("renders nothing when tracking is disabled and there is no data", () => {
    hookState.data = { ...stats, enabled: false, totalSessions: 0, totalSeconds: 0, avgSessionSeconds: 0 };
    const { container } = render(<TrainingTimeCard period="week" />);
    expect(container.firstChild).toBeNull();
    cleanup();
  });

  it("renders nothing for the session period", () => {
    const { container } = render(<TrainingTimeCard period="session" />);
    expect(container.firstChild).toBeNull();
    cleanup();
  });
});