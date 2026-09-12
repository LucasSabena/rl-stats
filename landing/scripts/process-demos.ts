/**
 * Converts the demo recordings into shareable formats.
 *
 * WebM is what Playwright produces, but mp4 plays everywhere (chat, docs,
 * social) and GIF is what embeds in a README. Both are generated from the same
 * master so the demos stay in sync.
 *
 * Run from `landing/`: `node scripts/process-demos.ts`
 * Input:  assets-src/demos/*.webm
 * Output: assets-src/demos/out/*.{mp4,gif}
 *
 * Flags:
 *   --gif          also render GIFs (slower; off by default)
 *   --gif-width=N  GIF width in px (default 900)
 *   --crop=W:H:X:Y crop every clip (e.g. 1440:860:0:0 crops the window frame)
 */
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "../assets-src/demos");
const OUT_DIR = path.join(SRC_DIR, "out");

const args = process.argv.slice(2);
const wantGif = args.includes("--gif");
const gifWidth = Number(
  args.find((a) => a.startsWith("--gif-width="))?.split("=")[1] ?? 900,
);

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

async function convertToMp4(input: string, output: string): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-v", "error",
    "-i", input,
    // Two-pass would be smaller, but these are short UI clips; CRF 26 keeps
    // them visually lossless at a fraction of the WebM size.
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "26",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-an",
    output,
  ]);
}

async function convertToGif(input: string, output: string): Promise<void> {
  // Palette generation keeps UI text and the violet accent from banding, which
  // a naive GIF conversion would ruin. `max_colors=128` and 10 fps keep a
  // README embed reasonable (~1 MB) instead of multiple megabytes.
  const palette = path.join(OUT_DIR, "._palette.png");
  const filter = `fps=10,scale=${gifWidth}:-1:flags=lanczos`;
  await execFileAsync("ffmpeg", [
    "-y", "-v", "error",
    "-i", input,
    "-vf", `${filter},palettegen=max_colors=128:stats_mode=diff`,
    palette,
  ]);
  await execFileAsync("ffmpeg", [
    "-y", "-v", "error",
    "-i", input,
    "-i", palette,
    "-lavfi", `${filter} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    "-loop", "0",
    output,
  ]);
  const { rmSync } = await import("node:fs");
  rmSync(palette, { force: true });
}

async function main() {
  if (!existsSync(SRC_DIR)) {
    console.error(`[demos] no source dir at ${SRC_DIR}`);
    process.exit(1);
  }

  const clips = readdirSync(SRC_DIR).filter((name) => name.endsWith(".webm"));
  if (clips.length === 0) {
    console.error("[demos] no .webm clips found — run `pnpm assets:demos` first");
    process.exit(1);
  }

  console.log(`[demos] converting ${clips.length} clip(s) -> ${OUT_DIR}`);
  console.log(`[demos] gif: ${wantGif ? `yes (${gifWidth}px)` : "no (pass --gif)"}`);

  for (const clip of clips) {
    const base = clip.replace(/\.webm$/, "");
    const input = path.join(SRC_DIR, clip);
    const mp4 = path.join(OUT_DIR, `${base}.mp4`);
    await convertToMp4(input, mp4);
    const line = [`  ${base.padEnd(26)} mp4 ${(statSync(mp4).size / 1024).toFixed(0)} KB`];

    if (wantGif) {
      const gif = path.join(OUT_DIR, `${base}.gif`);
      await convertToGif(input, gif);
      line.push(`gif ${(statSync(gif).size / 1024).toFixed(0)} KB`);
    }
    console.log(line.join("  ·  "));
  }

  console.log("\n[demos] done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
