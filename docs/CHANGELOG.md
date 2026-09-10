# Changelog

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
