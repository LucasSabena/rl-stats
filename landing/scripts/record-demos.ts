/**
 * Demo recorder.
 *
 * Drives the real RL Stats frontend (mocked Tauri IPC) through scripted
 * walkthroughs and records each one as a video — for docs, a README GIF,
 * release notes or social clips. Not used by the landing page; run it whenever
 * fresh demos are needed.
 *
 * Run from `landing/` with the app preview server on :4183:
 *   node scripts/record-demos.ts
 *   node scripts/record-demos.ts --only analytics,mood
 *
 * Output: landing/assets-src/demos/*.webm
 *
 * The recordings show a synthetic cursor: Playwright videos do not capture the
 * OS pointer, so a small overlay div follows `mouse.move` and a click ring
 * pulses on press. Without it the clips look like the UI moves by itself.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
// Explicit `.ts` extension: Node's type stripping resolves ESM specifiers
// literally and does not add extensions.
import { installFixtureBackend } from "./mock-backend.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../assets-src/demos");
const RAW_DIR = path.join(OUT_DIR, "_raw");
const BASE_URL = process.env.DEMO_URL ?? "http://127.0.0.1:4183/";

const VIEWPORT = { width: 1440, height: 860 };
// 2x gives crisp text at typical demo playback sizes without huge files.
const SCALE = 2;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

/**
 * Installs the visible cursor. Playwright's video capture only records the
 * page, so drawing the pointer ourselves is the only way to show interaction.
 */
async function installCursor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const CURSOR_ID = "__demo_cursor__";
    const RING_ID = "__demo_cursor_ring__";

    function ensure() {
      if (document.getElementById(CURSOR_ID)) return;

      const style = document.createElement("style");
      style.textContent = `
        #${CURSOR_ID} {
          position: fixed;
          left: 0; top: 0;
          width: 22px; height: 22px;
          margin: -11px 0 0 -11px;
          z-index: 2147483647;
          pointer-events: none;
          transition: transform 90ms linear;
          will-change: transform;
        }
        #${CURSOR_ID} svg { display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,.55)); }
        #${RING_ID} {
          position: fixed;
          left: 0; top: 0;
          width: 44px; height: 44px;
          margin: -22px 0 0 -22px;
          border: 2.5px solid #a583ff;
          border-radius: 9999px;
          opacity: 0;
          z-index: 2147483646;
          pointer-events: none;
          transform: scale(0.35);
        }
        #${RING_ID}.pulse {
          animation: __demoPulse 520ms cubic-bezier(0.2, 0.7, 0.3, 1);
        }
        @keyframes __demoPulse {
          0%   { opacity: 0.95; transform: scale(0.35); }
          100% { opacity: 0;    transform: scale(1.5); }
        }
      `;
      document.head.appendChild(style);

      const cursor = document.createElement("div");
      cursor.id = CURSOR_ID;
      // Standard arrow pointer, white with a dark outline so it reads on both
      // the dark and light themes.
      cursor.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5.5 3.2 18.6 11.4c.9.56.63 1.92-.4 2.11l-5.03.94a1.2 1.2 0 0 0-.92.79l-1.83 4.9c-.36.96-1.75.9-2.02-.09L5.1 4.32c-.2-.75.55-1.4 1.28-1.03Z"
                fill="#ffffff" stroke="#111318" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>`;
      document.body.appendChild(cursor);

      const ring = document.createElement("div");
      ring.id = RING_ID;
      document.body.appendChild(ring);
    }

    // The cursor must survive React re-renders that replace <body> children.
    document.addEventListener("DOMContentLoaded", ensure);
    if (document.readyState !== "loading") ensure();

    function place(x: number, y: number) {
      ensure();
      const cursor = document.getElementById(CURSOR_ID);
      const ring = document.getElementById(RING_ID);
      if (cursor) cursor.style.transform = `translate(${x}px, ${y}px)`;
      if (ring) ring.style.transform = `translate(${x}px, ${y}px)`;
    }

    // Playwright dispatches real mouse events; mirror their coordinates so the
    // synthetic cursor tracks whatever the driver does.
    for (const type of ["mousemove", "mousedown"] as const) {
      window.addEventListener(
        type,
        (event) => {
          place(event.clientX, event.clientY);
          if (type === "mousedown") {
            const ring = document.getElementById(RING_ID);
            if (ring) {
              ring.classList.remove("pulse");
              void ring.offsetWidth;
              ring.classList.add("pulse");
            }
          }
        },
        true,
      );
    }

    // Expose a manual placer for programmatic moves.
    (window as unknown as { __demoPlaceCursor?: (x: number, y: number) => void }).__demoPlaceCursor =
      place;
  });
}

/** Smoothly moves the synthetic cursor to a point, then resolves. */
async function glideTo(page: Page, x: number, y: number, steps = 18): Promise<void> {
  const from = await page.evaluate(() => {
    const cursor = document.getElementById("__demo_cursor__");
    if (!cursor) return { x: 720, y: 430 };
    const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(cursor.style.transform);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 720, y: 430 };
  });
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    // Ease-out so the pointer decelerates into the target like a real hand.
    const eased = 1 - Math.pow(1 - t, 3);
    const x2 = from.x + (x - from.x) * eased;
    const y2 = from.y + (y - from.y) * eased;
    await page.mouse.move(x2, y2);
    await page.waitForTimeout(12);
  }
}

/**
 * Moves to an element, pauses on it (as a person would), clicks, and waits.
 * Uses real mouse events so hover states and click handlers fire normally.
 */
async function clickElement(
  page: Page,
  selector: string,
  options: { settleMs?: number; hoverMs?: number; nth?: number } = {},
): Promise<void> {
  const { settleMs = 850, hoverMs = 260, nth = 0 } = options;
  const locator = page.locator(selector).nth(nth);
  await locator.waitFor({ state: "visible", timeout: 8000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await glideTo(page, x, y);
  await page.waitForTimeout(hoverMs);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(settleMs);
}

/** Scrolls the app's <main> container with an eased motion. */
async function smoothScroll(page: Page, distance: number, durationMs = 900): Promise<void> {
  const steps = Math.max(12, Math.round(durationMs / 40));
  for (let step = 0; step < steps; step += 1) {
    const t = (step + 1) / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const delta = (distance / steps) * (1 + eased);
    await page.evaluate((d) => {
      const main = document.querySelector("main");
      if (main) main.scrollTop += d;
      else window.scrollBy(0, d);
    }, delta);
    await page.waitForTimeout(40);
  }
}

/** Scrolls so a text match sits in the middle of the viewport. */
async function scrollToText(page: Page, pattern: string): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const found = await page.evaluate((source: string) => {
      const re = new RegExp(source, "i");
      const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4"));
      const fallback = Array.from(document.querySelectorAll("p, label, button"));
      const target =
        headings.find((node) => re.test(node.textContent ?? "")) ??
        fallback.find((node) => re.test(node.textContent ?? ""));
      if (!target) return false;
      const main = document.querySelector("main");
      const rect = target.getBoundingClientRect();
      if (main) {
        const mainRect = main.getBoundingClientRect();
        main.scrollTop += rect.top - mainRect.top - mainRect.height / 3;
      } else {
        target.scrollIntoView({ block: "center" });
      }
      return true;
    }, pattern);
    if (found) {
      await page.waitForTimeout(700);
      return true;
    }
    await page.evaluate(() => {
      const main = document.querySelector("main");
      if (main) main.scrollTop += Math.round(main.clientHeight * 0.7);
      else window.scrollBy(0, Math.round(window.innerHeight * 0.7));
    });
    await page.waitForTimeout(350);
  }
  return false;
}

async function settle(page: Page, ms = 700): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(ms);
}

// ─── Demo scripts ────────────────────────────────────────────────────────────

interface Demo {
  name: string;
  title: string;
  run: (page: Page) => Promise<void>;
}

const DEMOS: Demo[] = [
  {
    name: "01-tour-completo",
    title: "Recorrido completo: live → historial → análisis",
    run: async (page) => {
      await page.goto(BASE_URL, { waitUntil: "load" });
      await settle(page, 2600);

      // Live: let the scoreboard and MMR breathe.
      await glideTo(page, 900, 300);
      await page.waitForTimeout(1500);
      await glideTo(page, 620, 430);
      await page.waitForTimeout(1200);

      // History.
      await clickElement(page, '[data-tour="nav-history"]', { settleMs: 1200 });
      await glideTo(page, 800, 260);
      await page.waitForTimeout(1400);

      // Into a match detail. `data-history-match` is the row's own marker, so
      // this cannot accidentally hit the toolbar's Share button.
      await clickElement(page, "[data-history-match]", { settleMs: 1600 });
      await glideTo(page, 760, 320);
      await page.waitForTimeout(1600);
      await smoothScroll(page, 420);
      await page.waitForTimeout(1300);

      // Back to analytics.
      await clickElement(page, '[data-tour="nav-analytics"]', { settleMs: 1600 });
      await glideTo(page, 900, 380);
      await page.waitForTimeout(1400);
    },
  },
  {
    name: "02-analisis",
    title: "Analytics: stats, evolución y MMR",
    run: async (page) => {
      await page.goto(`${BASE_URL}analytics`, { waitUntil: "load" });
      await settle(page, 2600);

      await glideTo(page, 700, 300);
      await page.waitForTimeout(1400);
      await smoothScroll(page, 420);
      await page.waitForTimeout(1200);
      await smoothScroll(page, 520);
      await page.waitForTimeout(1400);
      await smoothScroll(page, -700);
      await page.waitForTimeout(900);

      // Switch the period tabs so the filters look alive.
      await clickElement(page, "main button[aria-pressed]", { settleMs: 1600, nth: 2 });
      await glideTo(page, 760, 300);
      await page.waitForTimeout(1200);
    },
  },
  {
    name: "03-mood",
    title: "El ánimo y la curva de sesión",
    run: async (page) => {
      await page.goto(`${BASE_URL}analytics`, { waitUntil: "load" });
      await settle(page, 2600);

      const foundMood = await scrollToText(page, "El ánimo juega");
      if (foundMood) {
        await glideTo(page, 900, 380);
        await page.waitForTimeout(2000);
      }
      const foundFatigue = await scrollToText(page, "Curva de sesión");
      if (foundFatigue) {
        await glideTo(page, 760, 340);
        await page.waitForTimeout(2000);
      }
    },
  },
  {
    name: "04-tema-claro-oscuro",
    title: "Cambio de tema: oscuro → claro → oscuro",
    run: async (page) => {
      await page.goto(BASE_URL, { waitUntil: "load" });
      await settle(page, 2400);

      // Go to analytics: charts show the theme change best.
      await clickElement(page, '[data-tour="nav-analytics"]', { settleMs: 1800 });
      await glideTo(page, 900, 360);
      await page.waitForTimeout(1200);

      // Toggle to light.
      await clickElement(page, 'button[aria-label*="tema claro"], button[title*="Tema claro"]', {
        settleMs: 1800,
      });
      await glideTo(page, 800, 340);
      await page.waitForTimeout(1800);

      // Scroll a little in light mode.
      await smoothScroll(page, 380);
      await page.waitForTimeout(1400);
      await smoothScroll(page, -380);
      await page.waitForTimeout(900);

      // Back to dark.
      await clickElement(page, 'button[aria-label*="tema oscuro"], button[title*="Tema oscuro"]', {
        settleMs: 1600,
      });
      await glideTo(page, 900, 360);
      await page.waitForTimeout(1600);
    },
  },
  {
    name: "05-historial-a-partido",
    title: "Historial: filtrar y abrir una partida",
    run: async (page) => {
      await page.goto(`${BASE_URL}history`, { waitUntil: "load" });
      await settle(page, 2400);

      await glideTo(page, 800, 340);
      await page.waitForTimeout(1200);

      // Filter to wins only. The Select is a custom combobox + listbox, so it
      // needs two real clicks: open the trigger, then pick the option.
      await clickElement(page, 'button[role="combobox"][aria-label="Resultado"]', {
        settleMs: 700,
      });
      await glideTo(page, 640, 360);
      await page.waitForTimeout(400);
      await clickElement(page, '[role="option"]:has-text("Victorias")', { settleMs: 1400 });

      // Open the first match.
      await clickElement(page, "[data-history-match]", { settleMs: 1800 });
      await glideTo(page, 760, 420);
      await page.waitForTimeout(1600);
      await smoothScroll(page, 480);
      await page.waitForTimeout(1500);
    },
  },
  {
    name: "06-mood-prompt",
    title: "Prompt de ánimo después de la partida",
    run: async (page) => {
      await page.goto(BASE_URL, { waitUntil: "load" });
      await settle(page, 2200);

      // Ask the app to show the post-match prompt, exactly as the core would.
      await page.evaluate(() => {
        window.__emitTauriEvent?.("match-finished", {
          matchId: 1014,
          guid: "LND-1014-AA01",
          isTraining: false,
          winner: 0,
          scoreBlue: 4,
          scoreOrange: 2,
        });
      });
      await page.waitForTimeout(1400);

      // The mood buttons expose the mood name as their accessible label, so
      // "Genial" is an exact, translation-stable-enough target for the demo.
      await clickElement(page, 'button[aria-label="Genial"]', { settleMs: 1200 });
      await glideTo(page, 760, 560);
      await page.waitForTimeout(700);

      // Then confirm with "Guardar".
      await clickElement(page, 'main button:has-text("Guardar"), button:has-text("Guardar")', {
        settleMs: 1400,
      });
      await glideTo(page, 900, 380);
      await page.waitForTimeout(1200);
    },
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────────

async function recordDemo(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  demo: Demo,
): Promise<string> {
  if (existsSync(RAW_DIR)) rmSync(RAW_DIR, { recursive: true, force: true });
  mkdirSync(RAW_DIR, { recursive: true });

  const context: BrowserContext = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: "dark",
    locale: "es-ES",
    recordVideo: { dir: RAW_DIR, size: VIEWPORT },
  });

  // Create the page first, then install both init scripts on it. Init scripts
  // are per-context or per-page, and the mocked IPC must be in place before
  // the app boots, so it is installed before the first `goto`.
  const page = await context.newPage();
  await installFixtureBackend(page, { theme: "dark", lang: "es" });
  await installCursor(page);

  console.log(`  ▶ ${demo.name}`);
  try {
    await demo.run(page);
  } finally {
    // Give the last frame a moment, then close to flush the video.
    await page.waitForTimeout(900);
    await page.close();
    await context.close();
  }

  const files = readdirSync(RAW_DIR).filter((name) => name.endsWith(".webm"));
  if (files.length === 0) throw new Error(`no video produced for ${demo.name}`);
  const source = path.join(RAW_DIR, files[files.length - 1]);
  const target = path.join(OUT_DIR, `${demo.name}.webm`);
  renameSync(source, target);
  return target;
}

async function main() {
  const onlyArg = process.argv.find((arg) => arg.startsWith("--only"));
  const only = onlyArg
    ? (onlyArg.split("=")[1] ?? process.argv[process.argv.indexOf(onlyArg) + 1] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : null;

  const selected = only
    ? DEMOS.filter((demo) => only.some((token) => demo.name.includes(token)))
    : DEMOS;

  if (selected.length === 0) {
    console.error(`no demos matched. available: ${DEMOS.map((d) => d.name).join(", ")}`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  console.log(`[demos] recording ${selected.length} clip(s) -> ${OUT_DIR}`);

  const results: { name: string; file: string }[] = [];
  for (const demo of selected) {
    const file = await recordDemo(browser, demo);
    results.push({ name: demo.title, file });
  }

  await browser.close();

  console.log("\n[demos] done");
  for (const item of results) {
    console.log(`  ${path.basename(item.file).padEnd(28)} ${item.name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
