/**
 * Playwright capture harness.
 *
 * Loads the REAL RL Stats frontend (Vite preview build) in Chromium with a
 * mocked Tauri IPC layer, injects the rich fixtures from `fixtures.ts`, and
 * writes screenshots of every screen the landing page needs.
 *
 * This is marketing tooling, not a test: it never runs in CI and is executed
 * manually via `pnpm assets:capture`.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 4183;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: ".",
  testMatch: ["capture.spec.ts", "capture-overlays.spec.ts"],
  outputDir: "../assets-src/_raw",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "es-ES",
    colorScheme: "dark",
    // Native app window is 1280×800; capture at 2x for crisp web imagery.
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        // `devices["Desktop Chrome"]` sets its own viewport (1280×720) and
        // deviceScaleFactor (1), which silently overrode the values above and
        // produced 1x screenshots. Spread it first, then re-apply the capture
        // settings so screenshots are 2x and match the real 1280×800 window.
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
        locale: "es-ES",
        colorScheme: "dark",
      },
    },
  ],
  webServer: {
    // Build the real app first (pnpm build in repo root), then preview it.
    // `cwd: ".."` resolves to the repo root (relative to this config file).
    command: `node node_modules/vite/bin/vite.js preview --port ${PORT} --strictPort`,
    cwd: "..",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
