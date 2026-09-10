// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { usePromptNav } from "./usePromptNav";

afterEach(() => cleanup());

function pad(overrides: {
  buttons?: Record<number, boolean>;
  axisX?: number;
  connected?: boolean;
}): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: overrides.buttons?.[i] ?? false,
    touched: false,
    value: 0,
  }));
  return {
    id: "test-pad",
    index: 0,
    connected: overrides.connected ?? true,
    mapping: "standard",
    timestamp: 0,
    axes: [overrides.axisX ?? 0, 0, 0, 0],
    buttons,
    vibrationActuator: null,
  } as unknown as Gamepad;
}

function mockPads(pads: (Gamepad | null)[]) {
  Object.defineProperty(window.navigator, "getGamepads", {
    value: () => pads,
    configurable: true,
    writable: true,
  });
}

describe("usePromptNav", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPads([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves with arrows (wrapping), accepts with Enter, dismisses with Escape", () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    const { result } = renderHook(() =>
      usePromptNav({ count: 5, onAccept, onDismiss }),
    );

    expect(result.current.index).toBe(0);
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowLeft" });
    });
    expect(result.current.index).toBe(4);
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(result.current.index).toBe(0);

    // Past the warmup before accept/dismiss are listened to.
    act(() => {
      vi.advanceTimersByTime(700);
    });
    act(() => {
      fireEvent.keyDown(window, { key: "Enter", repeat: true });
    });
    expect(onAccept).not.toHaveBeenCalled();
    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
    });
    expect(onAccept).toHaveBeenCalledWith(0);
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ignores accept and dismiss during the warmup window", () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    renderHook(() => usePromptNav({ count: 5, onAccept, onDismiss }));

    // The player is still holding boost/jump/skip from the match.
    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(700);
    });
    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
    });
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("shares one index across sources: hover then keyboard then accept", () => {
    const onAccept = vi.fn();
    const { result } = renderHook(() =>
      usePromptNav({ count: 5, onAccept, onDismiss: () => undefined }),
    );

    // Mouse hover moves the shared index…
    act(() => {
      result.current.setIndex(3);
    });
    // …keyboard continues from there…
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(result.current.index).toBe(4);
    // …and accept uses the latest position, not a stale one.
    act(() => {
      vi.advanceTimersByTime(700);
    });
    act(() => {
      result.current.accept();
    });
    expect(onAccept).toHaveBeenCalledWith(4);
  });

  it("moves once per gamepad press and repeats while held", () => {
    const onAccept = vi.fn();
    const { result } = renderHook(() =>
      usePromptNav({ count: 5, onAccept, onDismiss: () => undefined }),
    );

    // Rising edge on dpad-right.
    mockPads([pad({ buttons: { 15: true } })]);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(result.current.index).toBe(1);

    // Held: no immediate repeat…
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.index).toBe(1);

    // …repeat kicks in after the delay…
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.index).toBe(2);

    // …release resets the edge so the next press moves again.
    mockPads([pad({})]);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    mockPads([pad({ buttons: { 15: true } })]);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(result.current.index).toBe(3);
  });

  it("accepts on A, dismisses on B, holding A saves only once", () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    renderHook(() => usePromptNav({ count: 5, onAccept, onDismiss }));

    // Warmup with nothing held latches the pad as primed.
    mockPads([pad({})]);
    act(() => {
      vi.advanceTimersByTime(700);
    });

    mockPads([pad({ buttons: { 0: true } })]);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(onAccept).toHaveBeenCalledTimes(1);

    // Held A across many ticks: no double save.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onAccept).toHaveBeenCalledTimes(1);

    mockPads([pad({ buttons: { 1: true } })]);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ignores a button that was already held when the prompt appeared", () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    renderHook(() => usePromptNav({ count: 5, onAccept, onDismiss }));

    // The player is holding A as the prompt mounts: no release seen, no fire.
    mockPads([pad({ buttons: { 0: true } })]);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onAccept).not.toHaveBeenCalled();

    // Released once, then pressed deliberately: now it accepts.
    mockPads([pad({})]);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    mockPads([pad({ buttons: { 0: true } })]);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("steers with the left stick past the threshold", () => {
    const { result } = renderHook(() =>
      usePromptNav({ count: 5, onAccept: () => undefined, onDismiss: () => undefined }),
    );

    // Below threshold: nothing.
    mockPads([pad({ axisX: 0.3 })]);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(result.current.index).toBe(0);

    // Past threshold: moves left.
    mockPads([pad({ axisX: -0.8 })]);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(result.current.index).toBe(4);
  });

  it("survives disconnects and ignores every input while disabled", () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    const { result, rerender } = renderHook(
      ({ disabled }: { disabled: boolean }) =>
        usePromptNav({ count: 5, onAccept, onDismiss, disabled }),
      { initialProps: { disabled: false } },
    );

    mockPads([null]);
    act(() => {
      vi.advanceTimersByTime(120);
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(result.current.index).toBe(1);

    rerender({ disabled: true });
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
      fireEvent.keyDown(window, { key: "Enter" });
      fireEvent.keyDown(window, { key: "Escape" });
    });
    mockPads([pad({ buttons: { 0: true, 15: true } })]);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.index).toBe(1);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
