/**
 * Builds the social preview image (1200×630) used by og:image / twitter:image.
 *
 * Composed from the real live-dashboard capture plus the app logo and palette,
 * so shared links show the actual product instead of a logo on a gradient.
 *
 * Run from `landing/`: `node scripts/generate-og.mjs`
 * Output: public/media/social/og.png
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public/media/social");
const SCREENSHOT = path.join(ROOT, "assets-src/screens/01-live.png");
const LOGO = path.join(ROOT, "public/brand/logo-256.webp");

const WIDTH = 1200;
const HEIGHT = 630;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

if (!existsSync(SCREENSHOT)) {
  console.error(`[og] missing ${SCREENSHOT} — run \`pnpm assets:capture\` first`);
  process.exit(1);
}

/**
 * Dark canvas + violet glow + product screenshot + the headline burned in.
 * Text is rendered as SVG so the script needs no browser and stays fast.
 */
async function main() {
  // Background: the app's own canvas colour, with the accent glow from the hero.
  const background = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow" cx="50%" cy="0%" r="75%">
          <stop offset="0%" stop-color="#7c5cfc" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#7c5cfc" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#0f1014"/>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
    </svg>`,
  );

  // Product screenshot. Fit it into the space below the copy (y=300..600) so
  // the composite never overflows the canvas, whatever the source aspect is.
  const maxShotWidth = WIDTH - 160;
  const maxShotHeight = HEIGHT - 300 - 30;
  const source = sharp(SCREENSHOT);
  const sourceMeta = await source.metadata();
  const sourceAspect = (sourceMeta.width ?? 16) / (sourceMeta.height ?? 9);
  const shotWidth = Math.min(maxShotWidth, Math.round(maxShotHeight * sourceAspect));
  const shot = await source.resize({ width: shotWidth }).toBuffer();
  const shotMeta = await sharp(shot).metadata();
  const shotHeight = shotMeta.height ?? 0;

  const shotLeft = Math.round((WIDTH - shotWidth) / 2);
  const shotTop = HEIGHT - shotHeight - 24;

  const framedShot = await sharp(shot)
    .composite([
      {
        // 1px border drawn as an overlay so the screenshot separates from the bg.
        input: Buffer.from(
          `<svg width="${shotWidth}" height="${shotHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="${shotWidth - 1}" height="${shotHeight - 1}"
                  fill="none" stroke="#ffffff" stroke-opacity="0.14" rx="10"/>
          </svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

  const logo = await sharp(LOGO).resize({ width: 60 }).toBuffer();

  const text = Buffer.from(
    `<svg width="${WIDTH}" height="320" xmlns="http://www.w3.org/2000/svg">
      <text x="80" y="96" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
            font-size="58" font-weight="700" fill="#f7f7fa" letter-spacing="-1.5">
        Tu rendimiento en Rocket League,
      </text>
      <text x="80" y="162" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
            font-size="58" font-weight="700" fill="#a583ff" letter-spacing="-1.5">
        en tus propias manos
      </text>
      <text x="80" y="215" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
            font-size="25" fill="#b6b8c2">
        MMR en vivo · Overlays para OBS · Historial y análisis
      </text>
      <text x="80" y="256" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
            font-size="25" font-weight="600" fill="#4ade9a">
        Gratis · Local · Sin cuentas
      </text>
    </svg>`,
  );

  await sharp(background)
    .composite([
      { input: text, top: 40, left: 0 },
      { input: logo, top: 52, left: WIDTH - 140 },
      { input: framedShot, top: shotTop, left: shotLeft },
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, "og.png"));

  const size = (await import("node:fs")).statSync(path.join(OUT_DIR, "og.png")).size;
  console.log(`[og] wrote og.png (${(size / 1024).toFixed(0)} KB)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
