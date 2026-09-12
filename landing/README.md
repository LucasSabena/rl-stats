# RL Stats — Landing page

Marketing site for [RL Stats](../README.md), the local-first Rocket League
companion. Separate pnpm workspace package so the app's build and CI stay
untouched.

```bash
pnpm install                      # from the repo root
cd landing
pnpm dev                          # http://localhost:1430
pnpm build                        # static output in landing/dist
pnpm lint && pnpm exec tsc --noEmit
```

## Isolation from the desktop app

The landing never affects the app:

| Concern | Guarantee |
|---|---|
| Installer contents | `tauri.conf.json > frontendDist` is `../dist` (the app UI only). The landing lives in `landing/public` and is never referenced by the Tauri build. |
| Release workflow | Builds with `pnpm install --frozen-lockfile --filter rl-stats`, so landing packages are not installed. |
| App CI | Same `--filter rl-stats` on every install step. |
| Root `pnpm build` | Runs the app's `tsc && vite build` only; it is not recursive. |
| Lint / tests | Root ESLint and Vitest ignore `landing/**`; the landing has its own config. |

## Deployment — Cloudflare Pages

The site is a static bundle. Cloudflare Pages hosts it free on a
`<project>.pages.dev` hostname.

### Option A — Git integration (recommended, no secrets)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Pick the `LucasSabena/rl-stats` repository.
3. Configure the build:

   | Setting | Value |
   |---|---|
   | Production branch | `main` |
   | **Root directory** | `landing` |
   | Build command | `pnpm build` |
   | Build output directory | `dist` |

4. **Environment variables** (Settings → Environment variables):

   | Variable | Value | Why |
   |---|---|---|
   | `NODE_VERSION` | `22` | Vite 7 requires Node 20.19+/22. |
   | `PNPM_VERSION` | `9` | Matches the repo's CI. |
   | `SITE_URL` | `https://<project>.pages.dev` | Used by `scripts/generate-seo.mjs` to write absolute URLs into `sitemap.xml` and `robots.txt`. **Set this to the real Pages hostname** or to a custom domain if one is attached later. |

5. Save and deploy. Every push that touches `landing/**` redeploys;
   pull requests get their own preview URL.

Cloudflare installs dependencies from the workspace root, so the `landing`
root directory still resolves packages through `pnpm-workspace.yaml`. No
lockfile changes are required.

### Option B — CLI deploy

```bash
cd landing
pnpm build
SITE_URL=https://rl-stats.pages.dev pnpm dlx wrangler pages deploy dist \
  --project-name rl-stats-landing
```

`wrangler.toml` in this folder already declares `pages_build_output_dir = "dist"`.

### Headers and redirects

- `public/_headers` sets a strict CSP (self-hosted assets plus the two GitHub
  API endpoints), `nosniff`, `X-Frame-Options: DENY`, and long-lived cache
  headers for hashed assets.
- `public/_redirects` funnels unknown paths back to `index.html` (SPA
  behaviour) so stale or mistyped links render the page instead of a 404.

## SEO

The site has **no custom domain**, so all absolute URLs default to
`https://rl-stats.pages.dev`. Change them in one place: the `SITE_URL`
environment variable read by `scripts/generate-seo.mjs` (and the literal
default in `index.html` if the project is renamed).

What ships:

| Item | Where | Notes |
|---|---|---|
| Title, description, keywords | `index.html`, updated per language in `src/App.tsx` | Title and description swap when the visitor switches language. |
| Canonical | `index.html` + `src/App.tsx` | Points at the language variant being shown. |
| `hreflang` alternates | `index.html` | `es`, `en`, `pt`, plus `x-default`. |
| Open Graph / Twitter card | `index.html` | Uses the real 1200×630 screenshot (`media/social/og.png`, 130 KB). |
| Structured data | `index.html` | `SoftwareApplication` JSON-LD with `price: 0`, OS, license and repository. Google can show the free price directly in results. |
| `robots.txt` | generated into `public/` | Allows all, points at the sitemap. |
| `sitemap.xml` | generated into `public/` | One URL per language with `xhtml:link` alternates. |

Language variants are addressable: `/?lang=en` and `/?lang=pt`. Switching
language updates the URL via `history.replaceState`, and the stored preference
takes over on the next visit.

### Regenerating SEO assets

```bash
cd landing
pnpm assets:seo     # rebuilds og.png/og.jpg and the sitemap/robots files
```

`pnpm build` already runs the sitemap/robots step, so a normal deploy keeps
them current.

## Media pipeline

Every image and video on the page is captured from the real app. No mockups,
no redrawn UI, no stock screenshots.

```
landing/assets-src/           raw captures — NOT tracked (regenerable, ~7 MB)
├── screens/                  16 app screens, 2x (2560×1600)
├── overlays/                 6 OBS overlays composited over gameplay
└── video/                    live dashboard recording (.webm master)

landing/public/media/         optimized output — TRACKED (this is what ships)
├── screens/*.webp            1920px wide, q80  (~30–80 KB each)
├── overlays/*.webp           q88
├── video/live-dashboard.{mp4} + poster (25 KB)
└── social/og.png             1200×630 share card
```

**Why the split:** the raw PNG masters are ~7 MB of source material that would
sit in git history forever, yet they are fully reproducible. The optimized webp
and mp4 files are small and are what Cloudflare Pages actually serves, so they
must be committed or the deploy would ship a site with broken images.

The raw masters stay on disk after a capture so `pnpm assets:process` can
re-encode without recapturing, but git ignores `landing/assets-src/` entirely.

### Regenerating the captures

```bash
# 1. Build the real app (repo root)
pnpm build

# 2. Capture the screens (starts a preview server automatically)
cd landing
pnpm assets:capture              # -> assets-src/screens/*.png (2x)

# 3. Capture the overlays (serves the real overlay HTML + a WS state server)
pnpm assets:overlays             # -> assets-src/overlays/*.png

# 4. Record the hero loop (preview server must be up on :4183)
node scripts/capture-video.mjs   # -> assets-src/video/*.webm

# 5. Optimize everything into public/media
pnpm assets:process

# 6. Rebuild the share card and sitemap
pnpm assets:seo
```

The capture harness injects a mocked Tauri IPC layer (`scripts/fixtures.ts`)
and drives the **production frontend** in Chromium, so screenshots always
match what ships. The fixture data tells a coherent story: a Diamond III
player in a ranked doubles session with a mixed mood history.

### Previewing changes

```bash
cd landing
pnpm build
pnpm assets:review   # screenshots every section -> assets-src/_review/
```

`assets-src/_review/` is scratch, not shipped.

### Weight budget

Keep the deployed bundle light — the whole point is a fast page:

| Part | Budget |
|---|---|
| Screens (16 webp) | ~800 KB total |
| Overlays (6 webp) | ~150 KB total |
| Video (mp4 + poster) | ~280 KB total |
| Share card | ~130 KB |
| **Deployed `dist/`** | **≤ 2.5 MB** |

Check with `du -sh landing/dist`. Anything above the budget means an asset was
captured at the wrong size or not converted to webp.

## Copy accuracy rules

Marketing that overstates the product erodes trust faster than it wins
downloads. Every claim in `src/copy.ts` maps to code:

| Claim on the page | Evidence |
|---|---|
| Live MMR for every player, with exact/cached/estimated flags | `core/mmr/mod.rs`, `LiveMmrSnapshot` type, `LiveDashboard.tsx` |
| Six OBS overlays + SDK | `src-tauri/overlays/*.html`, `rl-overlay-sdk.js`, `OverlayStreaming.tsx` |
| Goals with assister, minute and shot speed | `MatchDetailPage.tsx`, `GoalDetail.tsx`, `match_events` schema |
| Breakpoint / fatigue curve | `FatiguePanel.tsx`, `get_session_curve` |
| Mood tracked per match + win rate by mood | `MatchMoodModal.tsx`, `MoodPanel.tsx`, `matches.mood` |
| Local database, no telemetry | `docs/SECURITY.md`, `docs/DATA_STORAGE.md`, no analytics SDK in `package.json` |
| Free, MIT, optional paid cloud sync | `LICENSE`, `docs/CLOUD_SYNC_PLAN.md`, `billing_plans` migration |

Do **not** add: replay parsing, position heatmaps, minimap, chat, or anything
resembling real-time coaching — none of it exists yet.

## Download button

`src/release.ts` resolves the newest release through the GitHub API because the
installer filename embeds the version (`RL.Stats_<version>_x64-setup.exe`), so
a hardcoded URL would 404 on every bump. If the API is unreachable the button
falls back to `github.com/LucasSabena/rl-stats/releases/latest`, which always
redirects to the newest tag.
