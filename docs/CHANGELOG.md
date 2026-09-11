# Changelog

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
