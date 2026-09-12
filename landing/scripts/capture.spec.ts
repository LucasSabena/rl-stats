import { expect, test, type Page } from "@playwright/test";
import { installFixtureBackend } from "./mock-backend";

const SCREENS_DIR = "assets-src/screens";

/**
 * The mock lives in `mock-backend.ts` so the screenshot spec and the demo
 * recorder share one IPC surface. A command added there fixes both tools.
 */

/**
 * Scrolls the app's real scroll container (`<main>`, see AppShell) until an
 * element matching `pattern` is visible. Panels below the fold mount lazily
 * (LazyMount), so a single `scrollIntoView` on a not-yet-rendered node is a
 * no-op — this scrolls step by step and waits for the node to appear.
 */
async function scrollToText(page: Page, pattern: string, maxSteps = 24): Promise<boolean> {
  for (let step = 0; step < maxSteps; step += 1) {
    const found = await page.evaluate((source: string) => {
      const re = new RegExp(source, "i");
      // Prefer real headings: searching every span picks up sidebar/nav labels
      // and scrolls to the wrong place.
      const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4"));
      const fallback = Array.from(document.querySelectorAll("p, label"));
      const target =
        headings.find((node) => re.test(node.textContent ?? "")) ??
        fallback.find((node) => re.test(node.textContent ?? ""));
      if (!target) return false;
      const main = document.querySelector("main");
      if (main) {
        const rect = target.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();
        main.scrollTop += rect.top - mainRect.top - mainRect.height / 3;
      } else {
        target.scrollIntoView({ block: "center" });
      }
      return true;
    }, pattern);
    if (found) {
      await page.waitForTimeout(700);
      const visible = await page.evaluate((source: string) => {
        const re = new RegExp(source, "i");
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4"));
        const fallback = Array.from(document.querySelectorAll("p, label"));
        const target =
          headings.find((node) => re.test(node.textContent ?? "")) ??
          fallback.find((node) => re.test(node.textContent ?? ""));
        if (!target) return false;
        const rect = target.getBoundingClientRect();
        return rect.top >= 0 && rect.top < window.innerHeight * 0.85;
      }, pattern);
      if (visible) return true;
    }
    await page.evaluate(() => {
      const main = document.querySelector("main");
      if (main) main.scrollTop += Math.round(main.clientHeight * 0.75);
      else window.scrollBy(0, Math.round(window.innerHeight * 0.75));
    });
    await page.waitForTimeout(450);
  }
  return false;
}

/** Waits for the app to settle after navigation. */
async function settle(page: Page, ms = 650): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(ms);
}

async function shot(page: Page, name: string, options?: { fullPage?: boolean }): Promise<void> {
  await page.screenshot({
    path: `${SCREENS_DIR}/${name}.png`,
    fullPage: options?.fullPage ?? false,
    animations: "disabled",
  });
}

test.describe.configure({ mode: "serial" });

test("01 · live dashboard with MMR", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/");
  await expect(page.getByRole("navigation")).toBeVisible();
  await settle(page, 900);
  // Deliver a few real events so the event feed is not empty in the shot.
  await page.evaluate(() => {
    const emit = (window as unknown as {
      __emitTauriEvent: (event: string, payload: unknown) => number;
    }).__emitTauriEvent;
    const base = Math.floor(Date.now() / 1000);
    const events = [
      {
        id: "fx-evt-1",
        type: "GoalScored",
        timestamp: base - 96,
        data: {
          scorerName: "Kaze",
          assisterName: "Rulo",
          teamNum: 1,
        },
      },
      {
        id: "fx-evt-2",
        type: "StatfeedEvent",
        timestamp: base - 74,
        data: { eventName: "Save", mainTargetName: "Nico" },
      },
      {
        id: "fx-evt-3",
        type: "GoalScored",
        timestamp: base - 41,
        data: {
          scorerName: "Nico",
          assisterName: "Tomi",
          teamNum: 0,
        },
      },
      {
        id: "fx-evt-4",
        type: "StatfeedEvent",
        timestamp: base - 22,
        data: { eventName: "EpicSave", mainTargetName: "Tomi" },
      },
      {
        id: "fx-evt-5",
        type: "StatfeedEvent",
        timestamp: base - 8,
        data: { eventName: "Demolish", mainTargetName: "Nico" },
      },
    ];
    for (const event of events) emit("live-event", event);
  });
  await page.waitForTimeout(650);
  await shot(page, "01-live");
});

test("02 · history list", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/history");
  await settle(page);
  await shot(page, "02-history");
});

test("03 · match detail", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/history/1014");
  await settle(page, 900);
  await shot(page, "03-match-detail");
});

test("04 · analytics top (stats + performance + MMR)", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/analytics");
  await settle(page, 1400);
  await shot(page, "04-analytics-top");
});

test("05 · analytics insights", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/analytics");
  await settle(page, 1400);
  const ok = await scrollToText(page, "Análisis avanzado");
  expect(ok).toBe(true);
  await page.waitForTimeout(400);
  await shot(page, "05-analytics-insights");
});

test("06 · mood panel", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/analytics");
  await settle(page, 1400);
  const ok = await scrollToText(page, "El ánimo juega");
  expect(ok).toBe(true);
  await page.waitForTimeout(400);
  await shot(page, "06-mood-panel");
});

test("07 · session fatigue panel", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/analytics");
  await settle(page, 1400);
  const ok = await scrollToText(page, "Curva de sesión");
  expect(ok).toBe(true);
  await page.waitForTimeout(400);
  await shot(page, "07-fatigue-panel");
});

test("08 · players directory", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/players");
  await settle(page);
  await shot(page, "08-players");
});

test("09 · training packs", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/training-packs");
  await settle(page, 900);
  await shot(page, "09-training-packs");
});

test("10 · pro configs", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/pro-configs");
  await settle(page, 900);
  // The page opens with an empty detail pane and collapsed teams; expand one
  // and pick a player so the screenshot shows real camera/deadzone data.
  await page.getByRole("button", { name: /Team Vitality/i }).first().click({ timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  await page.getByText("zen", { exact: true }).first().click({ timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(900);
  await shot(page, "10-pro-configs");
});

test("11 · settings — MMR sources", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/settings?tab=game");
  await settle(page, 900);
  await shot(page, "11-settings-mmr");
});

test("12 · settings — OBS streaming", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/settings?tab=streaming");
  await settle(page, 1100);
  await shot(page, "12-settings-streaming");
});

test("13 · mood prompt modal (post-match)", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/");
  await settle(page, 800);
  // Fire the same event the Rust core emits when a match ends.
  await page.evaluate(() => {
    const emit = (window as unknown as {
      __emitTauriEvent: (event: string, payload: unknown) => number;
    }).__emitTauriEvent;
    emit("match-finished", {
      matchId: 1014,
      guid: "LND-1014-AA01",
      isTraining: false,
      winner: 0,
      scoreBlue: 4,
      scoreOrange: 2,
    });
  });
  await page.waitForTimeout(700);
  await shot(page, "13-mood-prompt");
});

test("14 · command palette", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/");
  await settle(page, 700);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(500);
  await shot(page, "14-command-palette");
});

test("15 · session summary modal", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/");
  await settle(page, 700);
  await page.evaluate(() => {
    const emit = (window as unknown as {
      __emitTauriEvent: (event: string, payload: unknown) => number;
    }).__emitTauriEvent;
    emit("session-summary", {
      matches: 9,
      wins: 6,
      losses: 3,
      streak: 3,
      goalsFor: 27,
      goalsAgainst: 19,
      durationSeconds: 5400,
      startedAt: new Date(Date.now() - 5400_000).toISOString(),
      bestHour: 18,
    });
  });
  await page.waitForTimeout(600);
  await shot(page, "15-session-summary");
});

test("16 · overlay window (in-app, always on top)", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/");
  await settle(page, 900);
  await page.evaluate(() => {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: string }; currentWebview: { label: string; windowLabel: string } };
        windows: unknown[];
        webviews: unknown[];
      };
    }).__TAURI_INTERNALS__;
    internals.metadata.currentWindow.label = "overlay";
    internals.metadata.currentWebview.label = "overlay";
    internals.metadata.currentWebview.windowLabel = "overlay";
  });
  await page.reload();
  await settle(page, 1200);
  await shot(page, "16-overlay-window");
});
