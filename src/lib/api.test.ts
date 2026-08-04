import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

const { invokeCommand, ApiError } = await import("./api");

describe("invokeCommand", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the command result", async () => {
    invokeMock.mockResolvedValue({ ok: true });
    await expect(invokeCommand("get_settings_cmd")).resolves.toEqual({ ok: true });
  });

  it("wraps a rejection in ApiError", async () => {
    invokeMock.mockRejectedValue("boom");
    await expect(invokeCommand("get_settings_cmd")).rejects.toBeInstanceOf(ApiError);
  });

  /**
   * Regression: a Rust-side panic drops the response channel, so the promise
   * never settles and the calling screen sits on skeletons forever with no
   * error and no retry.
   */
  it("rejects instead of hanging forever when a command never settles", async () => {
    invokeMock.mockReturnValue(new Promise(() => {}));

    const promise = invokeCommand("get_match_detail");
    const assertion = expect(promise).rejects.toThrow(/no respondió/);

    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it("honours an explicit timeout override", async () => {
    invokeMock.mockReturnValue(new Promise(() => {}));

    const promise = invokeCommand("get_match_detail", undefined, { timeoutMs: 1000 });
    const assertion = expect(promise).rejects.toThrow(/no respondió en 1s/);

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("does not time out commands that legitimately run long", async () => {
    let settle: (value: unknown) => void = () => {};
    invokeMock.mockReturnValue(new Promise((resolve) => {
      settle = resolve;
    }));

    const promise = invokeCommand("export_data");
    await vi.advanceTimersByTimeAsync(120_000);

    settle({ done: true });
    await expect(promise).resolves.toEqual({ done: true });
  });
});
