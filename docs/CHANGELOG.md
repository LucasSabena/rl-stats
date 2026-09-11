# Changelog

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
