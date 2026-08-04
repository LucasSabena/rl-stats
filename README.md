# RL Stats

> A local-first desktop companion app for Rocket League. Capture live match data, build your personal match history, and analyze your performance — no cloud, no accounts, no tracking.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?logo=windows)](https://github.com/LucasSabena/rl-stats)
[![Status: Pre-Alpha](https://img.shields.io/badge/Status-Pre--Alpha-red)](https://github.com/LucasSabena/rl-stats)

<!-- TODO: add screenshots -->
<!--
![Live Dashboard](docs/screenshots/live-dashboard.png)
![Match History](docs/screenshots/match-history.png)
![Analytics](docs/screenshots/analytics.png)
-->

---

## About

After Psyonix disabled BakkesMod for online play with the EAC update, players lost their primary stats tracking tool. The new official Rocket League Stats API streams live match data locally — but there's no official app to consume it.

**RL Stats** fills that gap. It reads the local TCP stream from your game, parses every event, and gives you:

- **Live Dashboard** — Real-time player stats, scores, boost levels, and event feed during matches
- **Match History** — Every match you play, saved locally with full detail: goals, assists, saves, demos, ball hits
- **Performance Analytics** — Win rates, averages, trends, and streaks over days, weeks, months, and play sessions
- **OBS Overlay Streaming** — Built-in HTTP/WebSocket server for OBS Studio browser sources with live scoreboards, player stats, and event feeds
- **Session Detection** — Automatic grouping of consecutive matches into play sessions based on configurable time gaps
- **Privacy First** — All data stays on your PC. No accounts, no cloud, no telemetry.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | [Tauri 2](https://tauri.app/) (Rust) |
| Backend | Rust (tokio, rusqlite, serde, thiserror) |
| Frontend | React 19, TypeScript (strict), Vite |
| State | Zustand (global), TanStack Query (async) |
| Database | SQLite (WAL mode, r2d2 connection pooling) |
| Styling | Tailwind CSS v4, shadcn/ui primitives |
| Charts | Recharts |
| Icons | Lucide React |
| Testing | Vitest, React Testing Library, Playwright (E2E) |
| CI/CD | GitHub Actions (build, test, lint, release) |

---

## OBS Overlay Streaming

The app includes a built-in HTTP/WebSocket server for streaming live match data to OBS Studio as browser source overlays.

### Available Overlays

| Overlay | URL | Description |
|---------|-----|-------------|
| Scoreboard | `http://127.0.0.1:9528/overlays/scoreboard` | Live score, arena, timer, OT badge |
| Player Stats | `http://127.0.0.1:9528/overlays/player-stats` | Blue/orange team panels with stats |
| Event Feed | `http://127.0.0.1:9528/overlays/event-feed` | Goals, saves, demos in a live feed |
| All-in-One | `http://127.0.0.1:9528/overlays/all-in-one` | Combined scoreboard + stats + events |

### How to Use

1. Go to **Settings > Streaming OBS** and click **Iniciar streaming**
2. Open OBS Studio and add a new **Browser** source
3. Copy and paste one of the overlay URLs into the URL field
4. Adjust width/height to match the overlay design
5. Start Rocket League and play — the overlays update in real time

The server runs locally on `127.0.0.1`. The default port is `9528` (configurable in settings). Make sure your local firewall allows connections to this port.

### Custom Overlays

Developers can create custom OBS overlays using the included RL Overlay SDK:

```html
<script src="http://127.0.0.1:9528/sdk/rl-overlay.js"></script>
<script>
  const overlay = RLOverlay.connect({ port: 9528 });
  overlay.on("state", (data) => {
    console.log("Blue:", data.scoreBlue, "Orange:", data.scoreOrange);
  });
</script>
```

The SDK auto-detects the port from the page URL when loaded from the overlay server.

---

## Session Detection

The app automatically groups consecutive matches into play sessions. A session is a sequence of matches where the gap between matches does not exceed a configurable threshold.

### How It Works

- Matches are ordered by start time and grouped when consecutive matches are played within the **session gap** (default: 30 minutes)
- If more than 30 minutes pass between matches, a new session starts
- The session gap can be configured in **Settings > General**
- Sessions are used in the **Analytics** page under the "Sesion" tab for per-session performance stats

---

## Prerequisites

- **Windows 10 or 11** (the app is Windows-only for now)
- **Rocket League installed** on the same machine
- [Rust toolchain](https://rustup.rs/) (stable)
- [Node.js 20+](https://nodejs.org/) with [pnpm](https://pnpm.io/) (recommended)

---

## Installation

### Download

Prebuilt Windows installers are published on every tagged GitHub release.

- Go to **GitHub Releases**: `https://github.com/LucasSabena/rl-stats/releases`
- Download one of the Windows x64 artifacts:
  - `*.msi` - Recommended standard Windows installer
  - `*-setup.exe` - NSIS installer
  - `*.zip` - Portable bundle when available

### Packages And Release Assets

Each release is expected to ship these assets:

- `RL Stats_<version>_x64_en-US.msi`
- `RL Stats_<version>_x64-setup.exe`
- `latest.json` for the Tauri updater
- `checksums.txt` with SHA256 hashes

The project is open source, so source code, release notes, issues, and binary downloads all live in the same GitHub repository.

### Development

```bash
# Clone the repository
git clone https://github.com/LucasSabena/rl-stats.git
cd rl-stats

# Install dependencies
pnpm install

# Run in development mode (Vite dev server + Tauri)
pnpm tauri dev
```

### Production Build

```bash
pnpm tauri build
```

The output will be in `src-tauri/target/release/bundle/`:
- `RL Stats_x.x.x_x64-setup.exe` — NSIS installer
- `RL Stats_x.x.x_x64_en-US.msi` — MSI installer

---

## Configuration

The Rocket League Stats API must be enabled before the app can capture data. The API streams events locally on `127.0.0.1:49123`.

### Enable the Stats API

1. Go to your Rocket League config directory:
   ```
   %USERPROFILE%\Documents\My Games\Rocket League\TAGame\Config\
   ```
2. Open or create `TASystemSettings.ini`
3. Add these lines under `[SystemSettings]`:
   ```ini
   [SystemSettings]
   AllowPerFrameYield=False
   AllowPerFrameSleep=False
   bEnableReplayStatsAPI=True
   ```
4. Save the file and restart Rocket League

> The app will show a connection status indicator on the Live Dashboard page. If the API isn't enabled or the game isn't running, you will see a "Waiting for match..." state.

---

## Project Structure

```
api-rocketleague/
├── src/                        # React frontend (Vite + TypeScript)
│   ├── components/             # Reusable UI components
│   │   ├── live/               # Live match dashboard components
│   │   ├── history/            # Match history components
│   │   ├── analytics/          # Performance analytics components
│   │   ├── settings/           # Settings panel components
│   │   └── ui/                 # Base UI primitives (shadcn)
│   ├── pages/                  # Route-level pages
│   ├── hooks/                  # Custom React hooks
│   ├── stores/                 # Zustand state stores
│   ├── lib/                    # Utilities, types, constants
│   └── styles/                 # Tailwind + global styles
├── src-tauri/                  # Rust backend (Tauri)
│   └── src/
│       ├── main.rs             # Entry point
│       ├── core/               # Domain logic
│       │   ├── ingestor/       # TCP connection manager
│       │   ├── parser/         # Event parsing and validation
│       │   ├── models/         # Domain types and DTOs
│       │   ├── storage/        # SQLite persistence layer
│       │   ├── metrics/        # Derived metrics engine
│       │   ├── session/        # Match lifecycle & session grouping
│       │   ├── overlay/        # OBS overlay HTTP/WebSocket server
│       │   ├── settings/       # Configuration & RL INI helper
│       │   ├── tracker_api/    # Tracker Network API client
│       │   └── process_watcher/ # RL process detection
│       ├── commands/           # Tauri IPC command handlers
│       └── updater/            # Auto-update orchestration
├── src-tauri/overlays/         # Embedded overlay HTML/CSS/JS for OBS
├── docs/                       # Project documentation
├── scripts/                    # Build and release utilities
├── tests/                      # End-to-end tests (Playwright)
└── .github/workflows/          # CI/CD pipeline definitions
```

---

## Architecture

The app follows a layered architecture with clear separation of concerns:

```
Rocket League ──TCP──► Ingestor ──► Parser ──► SessionManager ──► Storage (SQLite)
                                           │              │
                                           ▼              ▼
                                    Tauri Events    OverlayServer
                                           │       (OBS via HTTP/WS)
                                           ▼
                                    Frontend (React/TS)
```

- **Ingestor** manages the TCP connection to `127.0.0.1:49123` with reconnection and exponential backoff
- **Parser** validates JSON and maps raw events to strongly-typed Rust structs
- **SessionManager** tracks match lifecycle (Waiting -> Active -> Finished) and drives both the frontend and overlay server
- **OverlayServer** broadcasts live state to OBS browser sources via WebSocket and REST endpoints
- **Storage** uses SQLite in WAL mode with connection pooling for concurrent reads
- **Frontend** communicates with the backend through type-safe Tauri commands

For a detailed breakdown of modules, database schema, and API surface, see the [Architecture Document](docs/ARCHITECTURE.md).

---

## Development

### Commands

```bash
pnpm install           # Install frontend dependencies
pnpm tauri dev         # Start development server
pnpm tauri build       # Production build
pnpm test              # Run frontend unit tests (Vitest)
pnpm lint              # Run ESLint
cd src-tauri && cargo test   # Run Rust tests
cd src-tauri && cargo clippy # Run Rust linter
```

### Contributing

Contributions are welcome! Before submitting a PR, please:

1. Read the [Agent Guide](AGENTS.md) for coding conventions and project rules
2. Read the [Design Document](docs/DESIGN.md) for the design system and component patterns
3. Ensure all tests pass (`pnpm test` and `cargo test`)
4. Run linting (`pnpm lint` and `cargo clippy`)
5. Follow the commit conventions used in the project

See the [Release Process](docs/RELEASE.md) for information about publishing new versions.

### Open Source Distribution

This repository is the canonical home for:

- source code
- issue tracking
- documentation
- release notes
- downloadable Windows installers

For end users, **GitHub Releases** is the main download page. If you publish a new version, make sure the MSI, NSIS installer, updater manifest, and checksums are attached.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Product Requirements](docs/PRODUCT.md) | User stories, features by version, success metrics |
| [Architecture](docs/ARCHITECTURE.md) | System design, data flow, database schema, module breakdown |
| [Design System](docs/DESIGN.md) | Color palette, typography, components, animations, accessibility |
| [Security & Privacy](docs/SECURITY.md) | Threat model, privacy policy, operational security rules |
| [Release Process](docs/RELEASE.md) | Version bumping, changelog, CI/CD, updater testing |
| [Agent Guide](AGENTS.md) | Coding conventions, project rules, key decisions |

---

## Limitations

The Rocket League Stats API does **not** provide:

- **MMR / Rank / Division** — The API streams in-match data only, not competitive rankings
- **Historical match data** — No access to Psyonix servers; the app only captures matches played while it's running
- **Reliable playlist/mode detection** — The API does not reliably report whether a match is Ranked, Casual, or an Extra Mode
- **Distance traveled or total boost used** — These are estimated as derived metrics (not directly provided by the API)
- **Cross-platform support** — Windows only in V1; macOS/Linux may be explored in the future

---

## License

MIT © Lucas Sabena

See [LICENSE](LICENSE) for full text.

---

## Acknowledgments

- [Rocket League](https://www.rocketleague.com/) and [Psyonix](https://www.psyonix.com/) for the official Stats API
- [rlstatsapi](https://github.com/xentrick/rlstatsapi) — Rust library reference for event parsing
- [RocketLeagueStatsAPI](https://github.com/manucabral/RocketLeagueStatsAPI) — Python library reference for event schema
- [Tauri](https://tauri.app/) — The framework that makes this app possible
- [InGameRank](https://github.com/nixvio64/InGameRank) (MIT) — source of the rank tier icons in `public/ranks/`
- [Geist](https://vercel.com/font) (SIL OFL 1.1) — the UI typeface, self-hosted via `@fontsource`

Rocket League, its rank insignia and arena imagery are trademarks and assets of
Psyonix LLC. This is an unaffiliated fan-made companion app.
