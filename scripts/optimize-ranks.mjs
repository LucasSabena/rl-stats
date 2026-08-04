/**
 * Optimizes the Rocket League rank tier icons into public/ranks/.
 *
 * Source icons live in assets-src/ranks/ as {tierIndex}.png, 0-22, matching
 * the in-game ladder:
 *   0 Unranked · 1-3 Bronze · 4-6 Silver · 7-9 Gold · 10-12 Platinum
 *   13-15 Diamond · 16-18 Champion · 19-21 Grand Champion · 22 Supersonic Legend
 *
 * They ship with transparent padding, so each is trimmed to its content before
 * resizing — otherwise the glyph renders tiny inside a mostly empty box.
 *
 * Run with: pnpm assets:ranks
 */
import sharp from "sharp";
import { mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "assets-src", "ranks");
const outDir = path.join(root, "public", "ranks");

const SIZES = [32, 64];

await mkdir(outDir, { recursive: true });

const files = (await readdir(srcDir)).filter((f) => f.endsWith(".png"));
let written = 0;

for (const file of files) {
  const tier = path.basename(file, ".png");

  for (const size of SIZES) {
    await sharp(path.join(srcDir, file))
      .trim()
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 92, effort: 6, alphaQuality: 100 })
      .toFile(path.join(outDir, `${tier}-${size}.webp`));
    written++;
  }
}

console.log(`Wrote ${written} rank icons for ${files.length} tiers to public/ranks/`);
