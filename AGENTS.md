# RL Stats — Agent Guide

> Tauri 2 (Rust) + React 19 + TypeScript + SQLite. Windows-only desktop app that consumes the local Rocket League Stats API TCP stream (`127.0.0.1:49123`).

---

## Commands & Verification Order

**Frontend** (run in repo root):
```bash
pnpm install              # pnpm 9, Node 22+
pnpm exec tsc --noEmit    # typecheck first
pnpm lint                 # ESLint with --max-warnings 0
pnpm vitest run           # unit tests (CI mode; `pnpm test` starts watch mode)
pnpm build                # Vite production build
```

**Rust** (run in `src-tauri/`):
```bash
cargo check --all-targets --all-features
cargo test --all-targets --all-features
cargo clippy --all-targets --all-features -- -D warnings
cargo fmt -- --check
```

**Development**:
```bash
pnpm tauri dev            # Vite on :1420 + Tauri dev build
pnpm tauri build          # Production bundle; output in src-tauri/target/release/bundle/
```

**CI order** (from `.github/workflows/ci.yml`):
1. Frontend (`ubuntu-latest`): `tsc --noEmit` → `lint` → `vitest run --coverage` → `build`
2. Rust (`windows-latest`): `cargo check` → `cargo test` → `cargo clippy -D warnings` → `cargo fmt --check`

---

## Architecture & Entrypoints

- `src/main.tsx` — Frontend React entrypoint (Vite, React Router)
- `src-tauri/src/main.rs` — Rust binary entrypoint (just calls `rl_stats_lib::run()`)
- `src-tauri/src/lib.rs` — Tauri app builder, state initialization, event processing loop
- `src-tauri/src/core/` — **All domain logic lives here**; command handlers in `src-tauri/src/commands/` must only delegate
- `src-tauri/src/core/mod.rs` — Module registry: `autostart`, `ingestor`, `metrics`, `mmr`, `models`, `obs_text`, `overlay`, `parser`, `process_watcher`, `profiles`, `rlstats_api`, `session`, `settings`, `storage`, `tracker_api`

**Runtime flow**:
`Rocket League ──TCP 49123──► Ingestor ──► Parser ──► SessionManager ──► Storage (SQLite)`
- `process_events()` in `lib.rs` drives the main event loop, emits Tauri events (`live-update`, `match-summary`, `live-event`), and broadcasts to the OBS overlay server
- Background tasks spawned via `tauri::async_runtime::spawn`: event processing, tracker profile refresh loop

**OBS Overlay**: HTTP/WebSocket server on `127.0.0.1:9528` (port configurable in settings). Embedded overlay assets in `src-tauri/overlays/`.

---

## Toolchain Quirks

- **Tailwind CSS v4** via `@tailwindcss/vite` plugin (not v3)
- **TypeScript strict** with `noUnusedLocals` and `noUnusedParameters` enabled
- **Path alias**: `@/` → `src/` (configured in both `vite.config.ts` and `tsconfig.json`)
- **Vite dev server**: port `1420`, strict; HMR on `1421` when `TAURI_DEV_HOST` is set
- **Vitest config is inline** in `vite.config.ts` (no separate `vitest.config.ts`)
- **ESLint**: disables `react-refresh/only-export-components` and `no-undef`; ignores `src-tauri/target/**`

---

## Rust Conventions

- Edition 2021; CI enforces `-D warnings` via Clippy
- Custom errors via `thiserror` (`src-tauri/src/error.rs`)
- Serialization via `serde`
- Async runtime: `tokio`
- SQLite via `rusqlite` (bundled, chrono features) with `r2d2` connection pooling, WAL mode
- Logging via `tracing`; never `println!` in production code
- All FS access through Tauri APIs
- Windows-only: `winreg` dependency for registry access

---

## Security & Permissions

- **No shell plugin** — use `opener` plugin for external URLs
- **Minimal Tauri permissions** — review `tauri.conf.json > capabilities` before adding commands
- **CSP strict**: `default-src 'self'`; `connect-src` limited to GitHub domains for updater
- **SQLite**: always use parameterized queries (`?` placeholders)
- **Data stays local** — match history, player names, stats never leave the device unless explicitly exported
- **No telemetry without consent**
- **Signed updates only** — updater verifies signatures with embedded public key
- **Secrets in CI only** — `TAURI_SIGNING_PRIVATE_KEY` and password via GitHub Secrets

---

## App Behavior Gotchas

- **Tray icon**: Closing the main window hides it to tray; use tray menu or click to restore. Quit exits the app
- **Autostart**: App can launch with `--minimized` flag; in that case the window starts hidden
- **Single instance**: enforced via `tauri-plugin-single-instance`; second launch focuses existing window
- **Overlay window**: separate Tauri window named `overlay`, transparent, always-on-top, auto-shown/hidden based on game process detection
- **ProcessWatcher**: detects if `RocketLeague.exe` is running and emits `game-status-changed` events
- **Profiles**: multiple user profiles supported; each profile gets its own SQLite database in app data dir
- **Tracker auto-refresh**: background loop fetches Tracker Network or RLStats profile data if configured

---

## Version Bumping

Must stay in sync across **three files**:
1. `package.json`
2. `src-tauri/Cargo.toml`
3. `src-tauri/tauri.conf.json`

Release is triggered by git tags `v*.*.*`. The release workflow builds NSIS + MSI installers and generates `latest.json` for the Tauri updater.

---

## Testing

- **Frontend**: Vitest + React Testing Library + jsdom
- **Rust**: Unit tests in modules; integration tests with captured event streams
- **Coverage**: configured in `vite.config.ts`; excludes `dist/`, `src-tauri/`, `src-tauri/target/`, `src-tauri/overlays/`
- **E2E**: Playwright planned but directory is currently empty

---

## Language & Communication

- **User-facing content**: Spanish (primary), English, Portuguese (i18n via `react-i18next`)
- **Code and technical docs**: English
- Issue labels: `bug`, `feature`, `enhancement`, `security`, `docs`

---

## Key References

- [Architecture](docs/ARCHITECTURE.md) — data flow, DB schema, module breakdown
- [Design System](docs/DESIGN.md) — colors, typography, components, animations
- [Release Process](docs/RELEASE.md) — version bumping, CI/CD, updater testing
- [Security & Privacy](docs/SECURITY.md) — threat model, operational security rules
