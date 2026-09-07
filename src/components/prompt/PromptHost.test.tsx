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

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ hide: vi.fn() }),
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
});
