/**
 * Generates the static SEO files into `public/`:
 *
 *   robots.txt
 *   sitemap.xml          URL set with hreflang alternates
 *   sitemap.txt          plain-text fallback some crawlers still read
 *
 * The site has no custom domain (Cloudflare Pages' free `*.pages.dev`
 * hostname), so `SITE_URL` reads from the `SITE_URL` env var and defaults to
 * the Pages project URL. Override it if the project is renamed or a custom
 * domain is attached later:
 *
 *   SITE_URL=https://rl-stats.pages.dev node scripts/generate-seo.mjs
 *
 * Run automatically from `pnpm build` via the prebuild script.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "../public");

// Cloudflare Pages serves the project at <project-name>.pages.dev. Keep this
// in sync with the project name created in the dashboard.
const SITE_URL = (
  process.env.SITE_URL ?? "https://rl-stats.pages.dev"
).replace(/\/$/, "");

const LANGS = ["es", "en", "pt"];

// Single-page site: one URL per language, each the same document with a
// different ?lang= parameter. That keeps the canonical URL clean while still
// giving crawlers a distinct address per translation.
const PATHS = LANGS.map((lang) => ({
  lang,
  url: lang === "es" ? `${SITE_URL}/` : `${SITE_URL}/?lang=${lang}`,
}));

const lastmod = new Date().toISOString().slice(0, 10);

function buildSitemap() {
  const entries = PATHS.map(({ lang, url }) => {
    const alternates = PATHS.map(
      (alt) =>
        `    <xhtml:link rel="alternate" hreflang="${alt.lang}" href="${alt.url}" />`,
    ).join("\n");
    return `  <url>
    <loc>${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${lang === "es" ? "1.0" : "0.9"}</priority>
${alternates}
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/" />
  </url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`;
}

function buildRobots() {
  return `# RL Stats landing page
User-agent: *
Allow: /

# The capture harness and raw assets are never deployed; nothing to hide here,
# but keeping crawlers away from build paths avoids 404 noise.
Disallow: /assets/

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

mkdirSync(PUBLIC, { recursive: true });
writeFileSync(path.join(PUBLIC, "sitemap.xml"), buildSitemap());
writeFileSync(path.join(PUBLIC, "robots.txt"), buildRobots());
writeFileSync(
  path.join(PUBLIC, "sitemap.txt"),
  PATHS.map((p) => p.url).join("\n") + "\n",
);

console.log(`[seo] site url: ${SITE_URL}`);
console.log(`[seo] wrote robots.txt, sitemap.xml, sitemap.txt`);
