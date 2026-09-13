import { useCallback, useEffect, useState } from "react";

export const ANALYTICS_PANELS = [
  "primary",
  "training",
  "chart",
  "mmr",
  "secondary",
  "insights",
  "comparison",
  "patterns",
  "sessions",
] as const;

export type AnalyticsPanelId = (typeof ANALYTICS_PANELS)[number];

export interface AnalyticsLayout {
  order: AnalyticsPanelId[];
  hidden: AnalyticsPanelId[];
}

const STORAGE_KEY = "rl-analytics-layout";

const DEFAULT_LAYOUT: AnalyticsLayout = {
  order: [...ANALYTICS_PANELS],
  hidden: [],
};

function normalize(raw: unknown): AnalyticsLayout {
  if (!raw || typeof raw !== "object") return DEFAULT_LAYOUT;
  const candidate = raw as Partial<AnalyticsLayout>;
  const order = Array.isArray(candidate.order)
    ? candidate.order.filter((id): id is AnalyticsPanelId =>
        ANALYTICS_PANELS.includes(id as AnalyticsPanelId)
      )
    : [];
  // Append panels added after the layout was saved.
  const missing = ANALYTICS_PANELS.filter((id) => !order.includes(id));
  const hidden = Array.isArray(candidate.hidden)
    ? candidate.hidden.filter((id): id is AnalyticsPanelId =>
        ANALYTICS_PANELS.includes(id as AnalyticsPanelId)
      )
    : [];
  return { order: [...order, ...missing], hidden };
}

function readLayout(): AnalyticsLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/**
 * Analytics dashboard layout: panel order and visibility, persisted locally.
 * Edit mode is UI state; the saved data is what survives reloads.
 */
export function useAnalyticsLayout() {
  const [layout, setLayout] = useState<AnalyticsLayout>(() => readLayout());
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Layout persistence is a nicety; ignore storage failures.
    }
  }, [layout]);

  const setOrder = useCallback((order: AnalyticsPanelId[]) => {
    setLayout((prev) => ({ ...prev, order }));
  }, []);

  const togglePanel = useCallback((id: AnalyticsPanelId) => {
    setLayout((prev) => ({
      ...prev,
      hidden: prev.hidden.includes(id)
        ? prev.hidden.filter((entry) => entry !== id)
        : [...prev.hidden, id],
    }));
  }, []);

  const reset = useCallback(() => setLayout(DEFAULT_LAYOUT), []);

  const visiblePanels = layout.order.filter((id) => !layout.hidden.includes(id));

  return {
    layout,
    editing,
    setEditing,
    setOrder,
    togglePanel,
    reset,
    visiblePanels,
  };
}
