// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { MoodPrompt } from "./MoodPrompt";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

const mutateMock = vi.fn(
  (_vars: unknown, opts?: { onSuccess?: () => void; onError?: (e: unknown) => void }) =>
    opts?.onSuccess?.(),
);

vi.mock("@/hooks/useSetMatchMood", () => ({
  useSetMatchMood: () => ({
    mutate: mutateMock,
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

afterEach(() => cleanup());

describe("MoodPrompt", () => {
  beforeEach(() => {
    mutateMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves the keyboard-selected mood and finishes", () => {
    const onDone = vi.fn();
    render(<MoodPrompt matchId={11} timeoutSecs={30} onDone={onDone} />);

    expect(screen.getByText("mood:modal.title")).toBeDefined();
    expect(screen.getByText("prompt:hints.gamepad")).toBeDefined();

    // Past the warmup window, so accept/dismiss are armed.
    act(() => {
      vi.advanceTimersByTime(700);
    });
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
    });

    expect(mutateMock).toHaveBeenCalledWith(
      { matchId: 11, mood: "neutral" },
      expect.anything(),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("ignores accept while the player is still holding game inputs", () => {
    const onDone = vi.fn();
    render(<MoodPrompt matchId={15} timeoutSecs={30} onDone={onDone} />);

    // Warmup window: the held boost/jump from the match must not answer the
    // prompt before the player even sees it.
    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(mutateMock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();

    // A deliberate mouse click still works immediately.
    fireEvent.click(screen.getByRole("radio", { name: "mood:options.happy" }));
    expect(mutateMock).toHaveBeenCalledWith(
      { matchId: 15, mood: "happy" },
      expect.anything(),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("saves on mouse click after hover", () => {
    const onDone = vi.fn();
    render(<MoodPrompt matchId={12} timeoutSecs={30} onDone={onDone} />);

    const face = screen.getByRole("radio", { name: "mood:options.angry" });
    fireEvent.mouseEnter(face);
    expect(face.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(face);

    expect(mutateMock).toHaveBeenCalledWith(
      { matchId: 12, mood: "angry" },
      expect.anything(),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("dismisses without saving on Escape", () => {
    const onDone = vi.fn();
    render(<MoodPrompt matchId={13} timeoutSecs={30} onDone={onDone} />);

    act(() => {
      vi.advanceTimersByTime(700);
    });
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(mutateMock).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses without saving when the timeout expires", () => {
    const onDone = vi.fn();
    render(<MoodPrompt matchId={14} timeoutSecs={10} onDone={onDone} />);

    act(() => {
      vi.advanceTimersByTime(11_000);
    });
    expect(mutateMock).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });
});
