// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { MatchMoodModal } from "./MatchMoodModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

type Handler = (event: { payload: Record<string, unknown> }) => void;
const handlers: Record<string, Handler> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, cb: Handler) => {
    handlers[event] = cb;
    return Promise.resolve(() => undefined);
  }),
}));

const mutateMock = vi.fn(
  (_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
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

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => cleanup());

describe("MatchMoodModal", () => {
  beforeEach(() => {
    mutateMock.mockClear();
    for (const key of Object.keys(handlers)) delete handlers[key];
  });

  it("opens on match-finished and saves the picked mood", async () => {
    render(<MatchMoodModal />);
    await flush();

    expect(screen.queryByText("mood:modal.title")).toBeNull();

    await act(async () => {
      handlers["match-finished"]({ payload: { matchId: 42, isTraining: false } });
    });
    expect(screen.getByText("mood:modal.title")).toBeDefined();

    const save = screen.getByText("common:buttons.save");
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "mood:options.happy" }));
    expect((save as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(save);
    expect(mutateMock).toHaveBeenCalledWith(
      { matchId: 42, mood: "happy" },
      expect.anything(),
    );
    // Saved successfully → the modal closes itself.
    expect(screen.queryByText("mood:modal.title")).toBeNull();
  });

  it("ignores training matches", async () => {
    render(<MatchMoodModal />);
    await flush();

    await act(async () => {
      handlers["match-finished"]({ payload: { matchId: 7, isTraining: true } });
    });
    expect(screen.queryByText("mood:modal.title")).toBeNull();
  });

  it("dismisses the pending prompt when the next match starts", async () => {
    render(<MatchMoodModal />);
    await flush();

    await act(async () => {
      handlers["match-finished"]({ payload: { matchId: 9, isTraining: false } });
    });
    expect(screen.getByText("mood:modal.title")).toBeDefined();

    await act(async () => {
      handlers["match-started"]({ payload: {} });
    });
    expect(screen.queryByText("mood:modal.title")).toBeNull();
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
