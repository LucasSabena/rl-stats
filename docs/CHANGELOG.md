# Changelog

## [Unreleased]

## [2.16.5] - 2026-09-12

### Fixed
- **Auto-refresh no longer gets the user's IP flagged as a bot.** The tracker
  refresh loop ran around the clock (even with Rocket League closed) every five
  minutes and, without a Tracker API key, fell back to plain HTTP requests
  against rlstats.net. Those automated requests from a residential IP are what
  Cloudflare scored as abuse and answered with challenges on unrelated sites.
  The loop now only runs while the game is running, uses exponential backoff
  with jitter, and pauses after five consecutive failures until the next game
  launch. The default interval is 30 minutes and existing installs are migrated
  once.
- **All rlstats.net access now goes through the WebView2 scraper.** The plain
  HTTP client (`core/rlstats_api`) and its commands were removed: it could not
  clear Cloudflare and was the main source of bot-like traffic. Cached RLStats
  profiles remain readable, and the MMR provider chain (webview → RapidAPI →
  Tracker → Parse.bot → history → estimate) lost only the dead HTTP fallback.

### Tests
- Automated accessibility smoke test with `axe-core` over the UI primitives
  (Button, Input, Switch) and the Modal dialog; it fails on unnamed icon
  buttons, missing labels and broken dialog semantics. jsdom cannot evaluate
  layout-based rules (contrast, landmarks), which are covered by the design
  tokens instead.

## [2.16.4] - 2026-09-11

Closes the remaining audit items from the 2.16.0 round.

### Added
- **Post-match MMR enrichment.** The frontend snapshot can be missed when a
  provider is slow or the window is hidden. After a match is persisted, the
  backend now resolves the lobby MMR in a background task and fills only the
  rows that are still `NULL` (never overwrites), enqueuing a cloud sync for
  each value it adds and emitting `match-mmr-enriched` so open views refresh.

### Fixed
- **Corrupt MMR cache rows self-repair**: an unparsable cache entry is
  dropped and treated as a miss so the provider refetches, instead of failing
  that player forever.
- **Live MMR errors are visible**: the live header now shows an "MMR
  unavailable" chip with a retry button when the provider chain fails.
- **Cloud pull cannot reset preferences**: an empty or partial settings
  payload (which `#[serde(default)]` would otherwise turn into defaults) is
  skipped.

### Tests
- Cloud pull/apply: natural-key upserts, idempotent re-apply, FK-cascade
  deletes, unresolved dependencies skipped, invalid settings payloads
  rejected.
- Profiles: name validation, case-insensitive duplicate rejection, one
  account per profile, active-profile delete protection and WAL/SHM sidecar
  cleanup.
- `for_sync` strips API keys from the serialized payload; MMR enrichment only
  fills `NULL`s and enqueues sync; backup-name parser distinguishes legacy
  snapshots.
- Totals: 202 Rust unit + 3 harness + 36 integration + 3 overlay-server,
  125 frontend, 2 Playwright.

### CI
- New advisory **Dependency Audit** job (pnpm audit + cargo audit); it
  reports without blocking.
- The Windows job runs unit + pure integration tests; the `tauri::test`
  harness binary cannot load on the runner (STATUS_ENTRYPOINT_NOT_FOUND,
  pre-existing) and is covered locally.

## [2.16.3] - 2026-09-11

### Changed
- The Backups list now shows **the account and the number of matches stored
  in each snapshot**, read directly from the backup file. With per-profile
  names, a legacy pre-incident snapshot and a fresh post-prune snapshot can
  look alike; the match count makes the one with the full history obvious
  before restoring.

## [2.16.2] - 2026-09-11

### Fixed — per-profile backups
- **Backups are now taken per profile.** The 24-hour check looked at the
  newest file in the shared backups folder, so once one profile had a fresh
  snapshot the next profile was skipped and its retention prune ran with no
  backup of its own. Files are now named `auto-<profile>-<date>.sqlite`, the
  freshness check and the 5-file rotation are per profile, and each profile
  always gets its own daily snapshot.
- **The Backups list shows which account each snapshot holds** (player name
  read from the snapshot itself) and blocks restoring a backup that belongs
  to a different profile, so a swap can never mix two accounts' histories.

## [2.16.1] - 2026-09-11

### Fixed — critical retention bug (2.16.0 data loss)
- **2.16.0 began enforcing the inherited `data_retention_days: 90` default on
  startup, deleting matches older than 90 days.** Retention is now strictly
  opt-in and manual:
  - Nothing is ever deleted automatically. The startup prune was removed and
    the stored value is reset once for every install that ran the broken
    build.
  - The retention UI is a locked switch ("Bloqueada: no se elimina nada") with
    a **two-step confirmation**: step 1 shows the exact number of matches that
    would be deleted, step 2 is the final confirmation. A fresh database
    backup is taken immediately before applying.
  - A new **Backups** card lists the automatic, pre-sync and pre-restore
    snapshots and restores one (staged, applied on the next launch; the
    replaced database is kept as a pre-restore copy).
- `set_settings_cmd` preserves the stored retention value, so no generic
  settings save can ever re-arm a prune.

## [2.16.0] - 2026-09-11

A full-app audit round: the OBS overlay contract (broken since the first
release), local-server and secret security, profiles/cloud data integrity,
MMR provider resilience, accessibility, i18n coverage and several new
streaming/profile/analytics features.

### Fixed — OBS overlays now actually work
- **The wire contract never matched.** The server emitted `type: "snapshot"`
  with snake_case fields while every bundled overlay (and the SDK, and the
  README) listened for `type: "state"` and read camelCase (`scoreBlue`,
  `timeRemaining`, `players[]`). The server now emits a canonical camelCase
  `state` event; the SDK and assets also accept the legacy `snapshot` alias.
- Overlays hardcoded port `9528`, so a custom port produced a dead browser
  source. They now derive host/port from the page URL.
- Late-joining WebSocket clients (OBS reloads a scene's browser source on
  every switch) now receive the cached match state immediately after the
  handshake instead of staring at 0-0.
- `match_ended` carries the winner, `ball_hit` carries the touching team
  (parsed from `Ball.TeamNum`), and the previously unused `countdown_begin`
  event is broadcast on kickoff.
- Overlay assets no longer load Google Fonts; Geist is served locally.

### Security
- **XSS in overlay assets removed.** Player names (attacker-controlled) were
  interpolated into `innerHTML` in four overlays. All rendering now goes
  through `textContent`/DOM nodes, and an integration test enforces it.
- **Overlay server hardened**: `Origin` validation blocks foreign web pages
  from subscribing to the live match, a per-run bearer token authorizes
  `file://`/external overlays, and every response carries CSP, `nosniff`,
  `Referrer-Policy`, `X-Frame-Options` and `no-store` headers.
- **API keys no longer leave the device**: Tracker/RapidAPI/ParseBot keys are
  stripped from cloud-sync payloads, from queued outbox rows (scrubbed on
  startup) and from data exports. Import and cloud pull preserve local
  secrets and device-local paths.
- The unused `raw.githubusercontent.com` CSP source was removed; the app CSP
  now allows only the local overlay preview (`frame-src`).
- `clear_all_data` now wipes friends, presets, training packs and all sync
  bookkeeping, VACUUMs the file, and offers a server-side wipe
  (`sync_wipe_profile`, migration 0006) so a pull cannot resurrect deleted
  rows.

### Fixed — data loss and profiles
- **Quitting mid-match or mid-training no longer drops the session**: the app
  intercepts the exit request, persists the in-flight session and checkpoints
  the WAL before exiting.
- **Port settings survive**: saving general settings or finishing onboarding
  used to rewrite the Rocket League INI files back to port 49123, ignoring
  `settings.port`.
- Profile manifest writes are serialized (no more lost updates), names are
  validated and unique, deleting a profile removes its `-wal`/`-shm`
  sidecars, a primary id can belong to a single profile, and the manifest is
  reconciled against each profile database on startup.
- MMR provider force-refresh now normalizes `xbox`/`ps4` to the provider
  cache keys (`xbl`/`psn`), so it actually clears the cache; Parse.bot
  results are stored under the Parse.bot cache key instead of polluting
  RapidAPI; a cached profile missing a playlist no longer triggers a
  re-scrape.

### Added
- **Cloud pull/apply**: `sync_pull` results are applied locally (matches,
  players, events, sessions, caches, friends, presets, packs, settings) with
  natural-key upserts, a first-pull database backup, an automatic 24-hour
  rotating backup, and a "Download changes" action in Settings → Data.
- **Push is verified**: the server response is checked before marking rows
  synced, the real server revision is recorded, failures back off
  exponentially, and flushed outbox rows are pruned after 30 days.
- **Data retention is enforced** (`data_retention_days`, 0 = keep forever)
  with a settings field; expired matches are tombstoned for the cloud.
- **RLStats scraper circuit breaker**: after three consecutive failures the
  provider cools down for five minutes instead of hanging every lobby member
  for 30 seconds.
- **Overlay scene URLs**: match title, team names, series length, hidden
  modules and active alert types are applied from Settings, with a live
  preview and a copyable Streamer.bot/WebSocket configuration.
- **New `alerts` overlay** for scene-switch goal/save/demo alerts.
- **Profile comparison table** (matches, win rate, training, last match) and
  **weekly goals** with progress bars in Analytics.
- **Diagnostics panel**: open the log folder, copy or download recent logs
  (rolling files capped at one week), and report an issue.
- **Keyboard shortcuts**: `Ctrl+1..5`, `Ctrl+,`, and `?` for a cheat sheet.
- The tray menu is localized and follows the app language.
- Updater: download and install are separate phases (install retries without
  re-downloading) and an in-progress download can be cancelled.
- i18n: 125 missing keys added in all three languages, three settings
  components localized, and a parity test that fails when a locale drifts.
- Accessibility: AA contrast for subtle text, aria labels on every raw form
  control and icon-only button.
- Docs: README updated with the real overlay contract; new `sync_wipe_profile`
  Supabase migration.

### Tests
- 3 overlay-server integration tests (real TCP server): security headers and
  asset hygiene, Origin/token enforcement, and "no innerHTML with player
  names". Plus the i18n parity test and the accessibility pass.

### Known gaps
- Cloud sync applies remote changes on demand ("Download changes"); there is
  no background pull loop yet.
- The MmrProvider chain still has provider-specific code paths that could be
  unified behind a trait.
- A shot heatmap and PDF export were evaluated and deferred: shots carry no
  stored coordinates today, and PDF would add a heavy dependency for a
  feature the share cards already approximate.
- Beta update channel requires a second published endpoint; only the stable
  channel is wired today.
- The arbitrary-path `export_data`/`import_data` commands were removed; the
  JSON string variants (used by the UI) remain.
- Windows installers remain unsigned until a code-signing certificate is
  provided via the `WINDOWS_CERTIFICATE`/`WINDOWS_CERTIFICATE_PASSWORD`
  secrets.

## [2.15.0] - 2026-09-11

### Added
- **Training packs now sync to the cloud.** User-created packs moved from browser localStorage to canonical SQLite rows (migration v26): they are covered by data export/backup and every create/update/delete enqueues a `training_pack` entity in the sync outbox. The server needs no new table — it stores them through its generic `cloud_profile_entities` table. Existing localStorage packs migrate automatically on first load; favorites stay local because they can also point at curated packs.
- **Delete action for user packs**, with confirmation — the i18n strings existed but the flow was never wired, so packs could be added but not removed.
- Lightweight rendering virtualization for history rows (`content-visibility: auto`), so long histories skip layout/paint for off-screen rows while keeping DOM-based tests and keyboard navigation intact.

### Tests
- 3 Rust storage tests for the training-pack lifecycle (upsert/list/hydrated sync payload, created_at preservation, tombstone on delete, validation) and 2 frontend tests for the legacy migration. Totals: 224 Rust, 107 frontend, 2 Playwright.

### Known gaps
- Cloud sync is push-only: `sync_pull` exists server-side but the client does not apply remote changes yet (applies to every entity, not just packs).
- The `tauri::test` harness covers three read commands; extending it needs the remaining Wry-typed state abstracted.
- Windows installers ship unsigned until a code-signing certificate is provided through the `WINDOWS_CERTIFICATE`/`WINDOWS_CERTIFICATE_PASSWORD` secrets; Azure Trusted Signing can be added as an extra step.

## [2.14.0] - 2026-09-11

### Changed
- **Analytics no longer blocks the async runtime.** 23 commands (analytics, insights, patterns, history, players, MMR) now run their SQLite work inside `spawn_blocking`, so long reads stop occupying tokio workers while other commands wait.
- **Settings are cached per profile pool.** `get_settings` re-read ~50 rows on every call (including the live-match loop); the cache lives on the `DbPool` itself so two profiles can never serve each other's settings, and `set_settings` refreshes it on every write.
- **Analytics panels mount by viewport.** The fatigue, chemistry, mood and custom-builder panels (one aggregate query each) now mount when they approach the viewport instead of all firing on page load.
- **Locales load per language.** `src/i18n` imports each language/namespace on demand and `main.tsx` awaits `i18nReady` before the first paint: the entry chunk dropped from 225 KB to 93 KB (74 KB → 27 KB gzip) and only the detected language plus the Spanish fallback are fetched.
- **One source of truth for settings and profiles.** `settingsStore` now stores only the onboarding flags (player name/RL path/platform/autostart/default type were duplicated mirrors of `app_settings`, the source of earlier theme/language clobbering); the zustand `profileStore` was retired in favour of React Query (`useProfiles`/`useProfileMutations`), which invalidates on every mutation; `uiStore.activePage` (never read) was removed.
- `useLiveMatch` dropped its private copy of the live-player mapping and uses the shared `mapLiveState`, so the initial load and the real-time updates can no longer drift.
- MMR chart: the current and peak values now show their rank tier (per-playlist ladder) and tooltips include the rank label. Session summary now includes the session's best hour.
- Keyboard: `j`/`k` navigate match rows in History (Enter opens) and are aliases for the arrow keys in the command palette.

### Added
- Tests for the split sharing pipeline (tokens/layout/render with a mock canvas, 6 cases) and for `LazyMount` (observer and fallback paths). 105 frontend tests, 221 Rust tests and the 2 Playwright smoke tests pass.

### Known gaps
- Training packs remain local: syncing them needs a matching entity in the cloud-sync server (`supabase/migrations`), otherwise sync_push rejects the batch.
- History virtualization is deferred until the page size grows (the smoke test covers the current list).
- Release LTO stays at the current lighter setting: the bundle-time tradeoff is deliberate while releases ship in ~9 minutes.
- The `tauri::test` harness covers three read commands; extending it needs the remaining Wry-typed state abstracted.

## [2.13.0] - 2026-09-11

### Fixed
- **Kickoff goals were counted wrong for every real stream.** The Stats API sends the score-update snapshot *before* `GoalScored`, and the session re-anchored the round on that snapshot, so every goal (scored and conceded) was compared against its own moment and classified as a kickoff goal. The anchor now only moves on `GoalScored`, round markers and replay end. New regression tests reproduce the real event order.
- **Kickoff goals now use `GoalTime`** (the duration of the round that just ended) when the stream reports it: exact classification in regulation and overtime with no anchor bookkeeping. Replay-artifact `GoalScored` events (no scorer, `GoalTime=0`) are ignored instead of being persisted, counted and re-anchoring the round.
- Connecting to a match already in progress no longer anchors the opening kickoff at the current clock, which marked any goal in the next 7 seconds as a kickoff goal.
- **Session detail was broken for every session**: the frontend sent `{startTime, endTime}` while the command expects `{query: {start_time, end_time}}`. The modal returned an error or sat on skeletons. It now loads, shows an explicit error with a retry button, and draws (null winner) render as draws instead of losses.
- **Analytics filters silently did nothing**: Tauri converts Rust parameter names to camelCase, and the frontend sent `match_type`/`player_id` in snake_case, so `Option` filters deserialized to `None`. Every analytics, insights, sessions, rollups and pattern command now sends the correct keys, pinned by IPC contract tests.
- **Historical kickoff recount rewritten**: it now rewrites every match with evidence (purging the old false positives instead of only matches with new kickoffs), rejects clock movements that go backwards, handles overtime per goal, and drops the substring name fallback that credited goals to the wrong player (`"Messi"` → `"Messi10"`). A new repair flag (`v25`) runs it once on existing databases and rebuilds the daily rollups.
- Team goals in daily rollups and session summaries come from the scoreboard (the same source the history uses), so own goals and incomplete rosters no longer make rollups and session numbers diverge. The scorer's team disambiguates name collisions.
- `update_match` now rebuilds the daily rollups, so editing a match's type/playlist no longer leaves analytics stale.
- Timezone: analytics windows are computed in local dates and match queries filter on `date(start_time,'localtime')`; evening sessions no longer fall into the wrong day or out of the window.
- Streaks exclude training, respect playlist/match-type case-insensitively, and kickoff goals conceded are no longer 0 in individual scope.
- Insights contribution percentages use the player's team as the denominator instead of every player in the match.
- `mark_change_failed` wrote a non-RFC3339 `available_at`, which disabled the cloud-sync retry backoff.
- Migration loading no longer treats a transient `MAX(version)` read failure as an empty database (which re-ran `ALTER TABLE` migrations and failed startup).

### Added
- **MMR history chart** on Analytics: per-playlist MMR curve from the readings stored with each match, with current/pico/cambio stats.
- **Comparator panel**: player vs player or current vs previous period across 14 metrics.
- **End-of-session summary**: when Rocket League closes, a modal shows the session record (matches, W-L, streak, goals, time) plus a keyboard-first command palette (Ctrl/Cmd+K).
- **CSV export** of the filtered history from the History page.
- Onboarding now includes a real connection test ("Probar conexión") instead of asking the user to verify it themselves.
- UI primitives (`Switch`, `Input`, `ConfirmModal`, `ProgressBar`, `DescriptionList`), a route-level error boundary, and Windows code signing support in the release workflow (activated by the `WINDOWS_CERTIFICATE`/`WINDOWS_CERTIFICATE_PASSWORD` secrets).

### Changed
- `src/lib/api.ts` split by domain under `src/lib/api/` and `shareEngine.ts` under `src/lib/share/`, both re-exported through the original paths (no import changes).
- SQLite pool 5 → 10 and chunked `IN (...)` on the session-detail query, fixing pool starvation when Analytics fires its parallel queries.
- `get_player_analytics_matches` no longer runs without a timeout, and `useAnalytics` is disabled in player mode (dead round-trip).
- Tests: +53 Rust tests (182 unit, 3 command-harness integration, 36 storage), IPC contract tests, and a Playwright smoke suite (`pnpm test:e2e`) that boots the production bundle with a mocked Tauri host. All 221 Rust and 97 frontend tests pass.

### Known gaps
- Training packs remain local: syncing them needs a matching entity on the cloud-sync server.
- i18n stays statically bundled; lazy loading awaits a test-suite strategy for async init.
- `tauri::test` harness covers three read commands; more coverage needs the remaining Wry-typed state fields abstracted.

## [2.12.0] - 2026-09-11

### Added
- Live training timer: while in Free Play a solo session shows "Training" with the elapsed stint time instead of a meaningless 0–0 scoreboard. That stint is what gets saved when you leave Free Play.
- Training rows in history get a real title ("Free Play" / "Entrenamiento libre") and the match detail shows a training header with the stint duration instead of a 0–0 scoreboard.

### Fixed
- Matches without arena data no longer store the literal "Unknown" as their name. Migration v25 clears the rows written by older versions.
- Migration v25 also rebuilds the duration of legacy training rows that kept a valid end time but a zeroed duration, so old stints show their real time and count toward training analytics again.

## [2.11.2] - 2026-09-11

### Changed
- Release builds are pre-compiled on `main`: GitHub scopes caches per ref, so each tag started from a cold dependency cache and took ~15 minutes. A prebuild job now warms the release-profile cache on release commits (caches from the default branch are visible to tag runs), leaving the tag run only the bundle, signing and upload.

## [2.11.1] - 2026-09-11

### Changed
- Cargo caches no longer key on `Cargo.lock`: every release bumps the crate version, which changed the lockfile and silently invalidated the whole dependency cache, forcing a full rebuild each time. Dependency artifacts are now reused across version bumps (Cargo still rebuilds whatever actually changed).

## [2.11.0] - 2026-09-10

### Changed
- Split the six largest frontend components into focused files (AnalyticsPage 1043→389, SettingsPanel 814→209, CloudSyncPanel 694→384, OverlayView 517→163, OverlayConfig 518→305, OnboardingOverlay 455→285). Pure moves: same UI, same behavior, verified with the full suite and a browser smoke test of every route, settings tab and the onboarding wizard.
- Release pipeline is faster: the Cargo target cache no longer invalidates on every source file (dependencies are reused across releases), only the NSIS installer is bundled (MSI was built but never published), release LTO is thin instead of fat, and debug artifacts are uploaded only on failure.
- `get_matches`/`get_match_detail` now serialize typed structs, with unit tests pinning the exact JSON keys the frontend maps.

### Fixed
- The history/insights rollup queries chunk their `IN (...)` match lists: histories above ~32k matches no longer fail with SQLite's variable limit.
- The browser dev preview no longer crashes opening the onboarding wizard (detect commands are mocked, and null results are guarded) and the Overlay settings explain that exclusive fullscreen blocks window overlays.

### Added
- Unit test for infinite history pagination (append + short-page termination).

## [2.10.1] - 2026-09-10

### Fixed
- **Overlay and post-match mood prompt now stay above Rocket League.** Tauri only calls the native `SetWindowPos` when the `always_on_top` flag changes, so every re-assert in the app was a silent no-op (the builders already create the windows as topmost). The overlay/prompt now force a real TOPMOST re-insertion, and keepers re-assert every 2s/1s while visible — alt-tabbing back into the game no longer leaves them behind. The prompt also re-asserts after taking focus.
- Settings tabs are deep-linkable (`/settings?tab=game`), and the "waiting for a match" empty state now links straight to the Stats API tab.

## [2.10.0] - 2026-09-10

### Fixed
- Settings no longer clobber real configuration: saving used to force port 49123, theme "dark", language "es" and 90-day retention, silently reverting a custom Stats API port and resetting Parse.bot/MMR-scraper options. The Game Config port is now persisted (with a restart hint) and the dead enable checkbox is gone.
- Data import is atomic again: presets were inserted through a second pooled connection while the import transaction was open (`SQLITE_BUSY` and partial imports). Settings and "delete all data" now write in transactions too.
- History win/loss filtering happens in SQL using the local player's team, so filter pages are complete and pagination is correct; "Load more" exposes matches beyond the first 50.
- The preset editor showed raw keys (`swivelSpeed`, `deadzoneShape`…) because it queried a non-existent i18n namespace.
- Deleting a match no longer fails silently; player, analytics, profile, storage and training-pack errors show retry states instead of pretending there is no data.
- The onboarding tour backdrop lets the app receive clicks again.
- Overlay `GET /api/state` actually caches the latest match state.

### Changed
- Performance: daily rollup rebuilds/reads use one bulk query instead of two per match; profile settings lookups skip migrations and WAL checkpoints; kickoff recompute and imports are transactional; new indexes for `match_players(player_id)`, `match_events(event_type)`, `sessions(match_id)` and `players(name)`.
- Startup bundle: recharts/d3 (~105 KB gzip) is no longer preloaded in every window; `clsx`/`tailwind-merge` moved to their own chunk.
- The navigation header/sidebar no longer re-render at 20 Hz during live matches; the account-mismatch listener is registered once (it could restart the app twice) and background update/cloud checks only run in the main window.
- Player directory search is debounced with previous results kept; cloud requests time out after 15 s.
- Accessibility: tablist semantics and arrow-key navigation, keyboard-sortable table headers with `aria-sort`, keyboard-activatable cards, `aria-busy` buttons, labelled checkboxes and tooltips, live-region toasts.
- UI consistency: hardcoded colors replaced with design tokens (accent, success, warning, info), fixing unreadable white-on-tint text in light theme.
- i18n: ~200 keys added across es/en/pt (career, hours wheel, share, cloud panel, update checker), hardcoded strings removed, dates/numbers follow the active language.
- Removed ~950 lines of dead components/hooks and stopped shipping the tracking of unused onboarding steps.

## [2.9.0] - 2026-09-10

### Added
- Live lobby MMR via a local WebView2 scraper of rlstats.net: no account, no API key, no ban risk, 30-minute cache and a single lookup per lobby.
- Exact playlist from the official Stats API `Game.PlaylistId` instead of inferring it from team size.
- "Fuentes de MMR" settings panel with provider health, latency, an on-demand live test and a toggle to disable the scraper.

### Changed
- The scraper parks the hidden window on `about:blank` after each lookup and the window is destroyed after 10 idle minutes to minimize resource usage.
- Force refresh now also clears the local MMR provider cache.
- Tracker Network and HTTP RLStats are now legacy fallbacks; RapidAPI and Parse.bot remain optional providers.

## [0.6.0] - 2026-05-04
- Fixed updater releases so GitHub publishes the signed `latest.json` manifest and installer signature required by Tauri updater.
- Improved persistence, query performance, live-state handling, polling behavior, and frontend bundle splitting without removing features.

## [0.1.7] - 2026-05-03
- Simplified CI and release flow.
- Release assets now publish only the Windows setup installer.

## [0.1.6] - 2026-05-03
- Release workflow now reconstructs and uploads `latest.json` from the signed Windows bundles.

## [0.1.5] - 2026-05-03
- Tauri bundle config now generates updater artifacts for GitHub releases.
- Release workflow upload step now publishes only real bundle assets from the Windows target output.

## [0.1.4] - 2026-05-03
- Release workflow now locates Windows bundle artifacts under the target-triple output directory.

## [0.1.3] - 2026-05-03
- Release workflow now derives the tag name safely for tag pushes.

## [0.1.2] - 2026-05-03
- Added Vitest coverage setup and a minimal frontend test.
- Fixed ESLint v9 and Rust Clippy CI failures.

## [0.1.1] - 2026-05-03
- Added updater support and storage/reporting fixes.

## [0.1.0] - 2026-05-03
- Initial public app release.
