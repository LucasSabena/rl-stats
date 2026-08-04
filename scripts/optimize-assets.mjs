/**
 * Generates the optimized brand assets the app actually loads at runtime.
 *
 * The source logo is a 1111x1134 PNG (~700 KB) and there is also a 4.7 MB
 * icon.svg with embedded rasters. Neither belongs on a sidebar at 36px, so
 * this emits small webp/png variants into public/brand/.
 *
 * Run with: pnpm assets:optimize
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public", "icon.png");
const outDir = path.join(root, "public", "brand");

const SIZES = [32, 64, 128, 256];

await mkdir(outDir, { recursive: true });

for (const size of SIZES) {
  const base = sharp(source).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  await base
    .clone()
    .webp({ quality: 92, effort: 6 })
    .toFile(path.join(outDir, `logo-${size}.webp`));

  // PNG fallback for the favicon / places that can't use webp.
  await base
    .clone()
    .png({ compressionLevel: 9, palette: true })
    .toFile(path.join(outDir, `logo-${size}.png`));
}

console.log(`Wrote ${SIZES.length * 2} brand assets to public/brand/`);
