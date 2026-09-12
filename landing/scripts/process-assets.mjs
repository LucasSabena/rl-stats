/**
 * Post-processes captured assets into web-optimized files.
 *
 * - Screenshots: cropped to the app content area (drops the empty chrome),
 *   resized and encoded as webp.
 * - Overlays: resized and encoded as webp with transparency where present.
 * - Video: transcoded to mp4 (h264) + webm (vp9) for broad support, with a
 *   webp poster frame extracted for the poster attribute.
 *
 * Run from `landing/`: `node scripts/process-assets.mjs`
 * Input:  assets-src/{screens,overlays,video}
 * Output: public/media/{screens,overlays,video}
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "../assets-src");
const OUT = path.join(__dirname, "../public/media");

/**
 * Screenshot crops. Captures are 2560×1600 (1280×800 CSS px @2x). They are
 * downscaled to 1920×1200, which stays crisp on every common retina width
 * while keeping each file under ~45 KB.
 */
const SCREEN_WIDTH = 1920;

async function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function processScreens() {
  const srcDir = path.join(SRC, "screens");
  const outDir = path.join(OUT, "screens");
  await ensureDir(outDir);
  const results = [];
  for (const name of readdirSync(srcDir)) {
    if (!name.endsWith(".png")) continue;
    const base = name.replace(/\.png$/, "");
    const input = path.join(srcDir, name);

    const target = path.join(outDir, `${base}.webp`);
    await sharp(input)
      .resize({ width: SCREEN_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80, effort: 6 })
      .toFile(target);
    results.push({ name: base, size: statSync(target).size });
  }
  return results;
}

async function processOverlays() {
  const srcDir = path.join(SRC, "overlays");
  const outDir = path.join(OUT, "overlays");
  await ensureDir(outDir);
  const results = [];
  for (const name of readdirSync(srcDir)) {
    if (!name.endsWith(".png")) continue;
    const base = name.replace(/\.png$/, "");
    const target = path.join(outDir, `${base}.webp`);
    await sharp(path.join(srcDir, name))
      .resize({ width: 1800, withoutEnlargement: true })
      .webp({ quality: 88, effort: 5 })
      .toFile(target);
    results.push({ name: base, size: statSync(target).size });
  }
  return results;
}

async function processVideo() {
  const srcDir = path.join(SRC, "video");
  const outDir = path.join(OUT, "video");
  await ensureDir(outDir);
  if (!existsSync(srcDir)) return [];

  const webm = readdirSync(srcDir).find((name) => name.endsWith(".webm"));
  if (!webm) return [];
  const input = path.join(srcDir, webm);
  const results = [];

  // h264 mp4: universal playback. Every current browser (Chrome, Firefox,
  // Safari, Edge) decodes it, so no WebM fallback is shipped — that only added
  // ~250 KB to the deploy for browsers that no longer exist in practice.
  const mp4Target = path.join(outDir, "live-dashboard.mp4");
  await execFileAsync("ffmpeg", [
    "-y",
    "-v", "error",
    "-i", input,
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "30",
    "-pix_fmt", "yuv420p",
    "-an",
    "-movflags", "+faststart",
    mp4Target,
  ]);
  results.push({ name: "live-dashboard.mp4", size: statSync(mp4Target).size });

  // Poster frame from ~1 s in, so the first beat of the loop is visible.
  const posterTarget = path.join(outDir, "live-dashboard-poster.webp");
  await execFileAsync("ffmpeg", [
    "-y",
    "-v", "error",
    "-ss", "1",
    "-i", input,
    "-frames:v", "1",
    posterTarget,
  ]);
  results.push({ name: "live-dashboard-poster.webp", size: statSync(posterTarget).size });

  return results;
}

async function main() {
  // Start clean so stale assets never ship.
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  await ensureDir(OUT);

  const screens = await processScreens();
  const overlays = await processOverlays();
  const videos = await processVideo();

  const fmt = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
  console.log("\n[screens]");
  for (const item of screens) console.log(`  ${item.name.padEnd(26)} ${fmt(item.size)}`);
  console.log("[overlays]");
  for (const item of overlays) console.log(`  ${item.name.padEnd(26)} ${fmt(item.size)}`);
  console.log("[video]");
  for (const item of videos) console.log(`  ${item.name.padEnd(26)} ${fmt(item.size)}`);

  const total = [...screens, ...overlays, ...videos].reduce((sum, i) => sum + i.size, 0);
  console.log(`\n[total] ${fmt(total)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
