// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LazyMount } from "./LazyMount";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

let observerCallback: ObserverCallback | null = null;
const originalObserver = globalThis.IntersectionObserver;

class MockObserver {
  constructor(callback: ObserverCallback) {
    observerCallback = callback;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
}

afterEach(() => {
  observerCallback = null;
  globalThis.IntersectionObserver = originalObserver;
  vi.restoreAllMocks();
});

describe("LazyMount", () => {
  it("keeps children unmounted until the placeholder intersects", () => {
    globalThis.IntersectionObserver =
      MockObserver as unknown as typeof IntersectionObserver;

    render(
      <LazyMount>
        <p>panel pesado</p>
      </LazyMount>,
    );

    expect(screen.queryByText("panel pesado")).toBeNull();

    act(() => {
      observerCallback?.([{ isIntersecting: true }]);
    });

    expect(screen.getByText("panel pesado")).toBeTruthy();
  });

  it("renders immediately when IntersectionObserver is unavailable", () => {
    // @ts-expect-error deliberately removing the API for the fallback path
    delete globalThis.IntersectionObserver;

    render(
      <LazyMount>
        <p>panel sin observer</p>
      </LazyMount>,
    );

    expect(screen.getByText("panel sin observer")).toBeTruthy();
  });
});
