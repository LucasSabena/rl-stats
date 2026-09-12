/**
 * Screenshots the built landing page section by section.
 *
 * Run from `landing/` (with a preview server on 4190):
 *   node scripts/review-landing.mjs
 * Output: landing/assets-src/_review/*.png
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../assets-src/_review");
const BASE = process.env.REVIEW_URL ?? "http://127.0.0.1:4190/";

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  // Scroll the whole page once so every IntersectionObserver fires, then
  // return to the top. Without this, sections below the fold are still
  // mid-transition (or hidden) in the full-page capture.
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
  // Belt and braces: force any straggler to its final state for the capture.
  await page.addStyleTag({ content: ".reveal{opacity:1 !important;transform:none !important}" });
  await page.waitForTimeout(300);

  // Full page first: the fastest way to spot rhythm and spacing problems.
  await page.screenshot({ path: path.join(OUT, "full.png"), fullPage: true });
  console.log("[review] full page");

  // Then one shot per section, scrolled into view.
  const sections = [
    ["hero", "#top"],
    ["features", "#features"],
    ["overlays", "#overlays"],
    ["mood", "text=¿Cómo te sentiste"],
    ["privacy", "#privacy"],
    ["faq", "#faq"],
    ["download", "#download"],
  ];

  for (const [name, selector] of sections) {
    const target = page.locator(selector).first();
    try {
      await target.scrollIntoViewIfNeeded({ timeout: 4000 });
    } catch {
      console.log(`[review] ${name}: selector not found, skipping`);
      continue;
    }
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log(`[review] ${name}`);
  }

  // Mobile pass: the same page at a phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, "mobile-hero.png") });
  await page.evaluate(() => window.scrollBy(0, 1400));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, "mobile-mid.png") });
  console.log("[review] mobile");

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
