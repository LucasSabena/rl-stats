// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { PromptHost } from "./PromptHost";

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

const mocks = vi.hoisted(() => ({
  setPosition: vi.fn(),
  hide: vi.fn(),
  getPendingPrompt: vi.fn(async (): Promise<unknown> => null),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ hide: mocks.hide, setPosition: mocks.setPosition }),
  cursorPosition: vi.fn(async () => ({ x: 2500, y: 500 })),
  availableMonitors: vi.fn(async () => [
    {
      name: "primary",
      position: { x: 0, y: 0 },
      size: { width: 1920, height: 1080 },
      scaleFactor: 1,
    },
    {
      name: "game",
      position: { x: 1920, y: 0 },
      size: { width: 2560, height: 1440 },
      scaleFactor: 1,
    },
  ]),
  primaryMonitor: vi.fn(async () => null),
}));

vi.mock("@/lib/api", () => ({
  getPendingPrompt: mocks.getPendingPrompt,
}));

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: { promptTimeoutSecs: 30 } }),
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

afterEach(() => cleanup());

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("PromptHost", () => {
  beforeEach(() => {
    mutateMock.mockClear();
    mocks.setPosition.mockClear();
    mocks.getPendingPrompt.mockReset();
    mocks.getPendingPrompt.mockResolvedValue(null);
    for (const key of Object.keys(handlers)) delete handlers[key];
  });

  it("renders nothing until a prompt opens", async () => {
    const { container } = render(<PromptHost />);
    await flush();
    expect(container.textContent).toBe("");
  });

  it("hosts the mood prompt on prompt-open and resets on prompt-close", async () => {
    render(<PromptHost />);
    await flush();

    await act(async () => {
      handlers["prompt-open"]({ payload: { kind: "mood", match_id: 99 } });
    });
    expect(screen.getByText("mood:modal.title")).toBeDefined();

    await act(async () => {
      handlers["prompt-close"]({ payload: {} });
    });
    expect(screen.queryByText("mood:modal.title")).toBeNull();
  });

  it("ignores unknown kinds and invalid match ids", async () => {
    const { container } = render(<PromptHost />);
    await flush();

    await act(async () => {
      handlers["prompt-open"]({ payload: { kind: "something-else", match_id: 1 } });
    });
    expect(container.textContent).toBe("");

    await act(async () => {
      handlers["prompt-open"]({ payload: { kind: "mood" } });
    });
    expect(container.textContent).toBe("");
  });

  it("pulls the pending payload on mount (cold-start race fix)", async () => {
    // No push event is ever emitted: the backend stored the payload while
    // this webview was still loading, which used to mean an empty window.
    mocks.getPendingPrompt.mockResolvedValueOnce({ kind: "mood", match_id: 77 });
    render(<PromptHost />);
    await flush();

    expect(screen.getByText("mood:modal.title")).toBeDefined();
  });

  it("centers on the cursor monitor, not the primary display", async () => {
    render(<PromptHost />);
    await flush();

    // Cursor at x=2500 sits on the "game" monitor (x=1920, 2560 wide):
    // 1920 + (2560 - 560) / 2 = 2920, (1440 - 480) / 2 = 480.
    expect(mocks.setPosition).toHaveBeenCalled();
    const pos = mocks.setPosition.mock.calls[0][0] as { x: number; y: number };
    expect(pos.x).toBe(2920);
    expect(pos.y).toBe(480);
  });
});
