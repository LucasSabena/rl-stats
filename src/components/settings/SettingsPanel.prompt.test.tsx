// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsPanel } from "./SettingsPanel";
import type { AppSettings } from "@/lib/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  configureRlIniAll: vi.fn(async () => undefined),
  detectRlPath: vi.fn(async () => null),
  inspectRlPath: vi.fn(async () => null),
}));

vi.mock("./LanguageSelector", () => ({
  LanguageSelector: () => null,
}));

vi.mock("./ManualMmr", () => ({
  ManualMmr: () => null,
}));

const mutateMock = vi.fn();

const stored: AppSettings = {
  playerName: "Yo",
  autoStart: true,
  rlPath: null,
  platform: null,
  defaultMatchType: "ranked",
  promptFocusEnabled: false,
  promptTimeoutSecs: 30,
  promptOnlyWhenGameRunning: true,
};

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: stored, isLoading: false, isError: false }),
  useUpdateSettings: () => ({ mutate: mutateMock, isPending: false }),
}));

afterEach(() => cleanup());

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SettingsPanel />
    </QueryClientProvider>,
  );
}

/** The switch belonging to a ToggleRow labelled with the given (mocked) key. */
function switchFor(labelKey: string): HTMLButtonElement {
  const label = screen.getByText(labelKey);
  const row = label.closest("div")?.parentElement;
  const button = row?.querySelector('button[role="switch"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`no switch found for ${labelKey}`);
  }
  return button;
}

describe("SettingsPanel prompt section", () => {
  beforeEach(() => {
    mutateMock.mockClear();
    stored.promptFocusEnabled = false;
    stored.promptTimeoutSecs = 30;
    stored.promptOnlyWhenGameRunning = true;
  });

  it("sends the prompt fields on save, not stale values", async () => {
    renderPanel();

    // Enable the master toggle and change the timeout.
    fireEvent.click(switchFor("settings:prompt.enabled"));
    const timeout = document.getElementById(
      "promptTimeoutSecs",
    ) as HTMLInputElement;
    fireEvent.change(timeout, { target: { value: "60" } });

    fireEvent.click(screen.getByText("settings:buttons.saveSettings"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const payload = mutateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.promptFocusEnabled).toBe(true);
    expect(payload.promptTimeoutSecs).toBe(60);
    expect(payload.promptOnlyWhenGameRunning).toBe(true);
    // Untouched general fields still travel along.
    expect(payload.autoStart).toBe(true);
  });

  it("reflects the stored values when the panel opens", async () => {
    stored.promptFocusEnabled = true;
    renderPanel();

    await waitFor(() =>
      expect(
        switchFor("settings:prompt.enabled").getAttribute("aria-checked"),
      ).toBe("true"),
    );
    expect(
      (document.getElementById("promptTimeoutSecs") as HTMLInputElement).value,
    ).toBe("30");
  });
});
