# RL Stats — Architecture Document

> High-level system architecture, data flow, and technical decisions.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    RL Stats                        │
│                      (Tauri Desktop App)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Frontend   │  │   Tauri      │  │  Rust Backend    │  │
│  │  (React/TS)  │◄─┤   Bridge     │◄─┤   (Core Logic)   │  │
│  │              │  │  (Commands   │  │                  │  │
│  │  - Dashboard │  │   + Events)  │  │  - Ingestor      │  │
│  │  - History   │  │              │  │  - Parser        │  │
│  │  - Analytics │  │              │  │  - Storage       │  │
│  │  - Settings  │  │              │  │  - Metrics       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│           ▲                                    │             │
│           │         ┌──────────────┐          │             │
│           └─────────┤   SQLite     │◄─────────┘             │
│                     │  (Local DB)  │                        │
│                     └──────────────┘                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Updater Plugin  │  Single Instance  │  Auto-start   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Rocket League Stats API Stream                  │
│              (TCP 127.0.0.1:49123, read + commands)         │
│                                                              │
│  Events: UpdateState, BallHit, GoalScored,                  │
│          StatfeedEvent, MatchCreated, MatchEnded, ...       │
└─────────────────────────────────────────────────────────────┘
```

### Broadcast Studio (`core/broadcast/`)

The streaming/broadcast stack is a horizontal layer on top of the same event
stream:

```
RlEvent ──► process_events ──► BroadcastHub ──► WebSocket clients (OBS, dock)
                                   │  ▲
                                   │  └── ChatManager (Twitch/Kick, read-only)
                                   │  └── RecordingManager (JSONL + replay)
                                   ▼
                     ActionRequest channel ──► action orchestrator
                     (state, series, timer, delay, game commands)
```

- `BroadcastHub` owns the fan-out channel, the v2 envelope (`v`/`seq`/`ts`),
  the delay buffer, the cached state and a raw tap used by the recorder.
- `core/overlay/mod.rs` serves the engine, `/dock`, `/assets` and the
  `/api/v1` + `/api/v2` REST surface with role-scoped persistent tokens.
- `core/broadcast/{packs,store,tournament,recording,chat,actions,discord}`
  hold design packs, SQLite entities, brackets, replay, chat readers,
  operator actions and notifications.
- `overlays/{engine.js,engine.css,live.html,chat.html,dock.html}` are the
  self-contained overlay runtime and operator dock embedded in the binary.

See [BROADCAST.md](BROADCAST.md) for the operator-facing guide.

---

## Data Flow

### 1. Ingestion Flow (Live Match)

```
Rocket League ──TCP──► Ingestor ──► Parser ──► Event Bus ──► Storage
                                              │
                                              ▼
                                         Frontend (Live)
```

1. **Ingestor**: Opens TCP connection to `127.0.0.1:49123`
   - Reads newline-delimited JSON events
   - Handles reconnection with exponential backoff
   - Validates JSON structure

2. **Parser**: Transforms raw JSON into strongly-typed domain events
   - Maps JSON fields to Rust structs
   - Handles unknown/forward-compatible events
   - Validates data ranges (e.g., boost 0-100)

3. **Event Bus**: Dispatches events to subscribers
   - Storage layer persists events
   - Frontend receives events via Tauri events API
   - Session manager tracks match lifecycle

4. **Storage**: Persists to SQLite
   - Events table for discrete events
   - Snapshots table for throttled UpdateState
   - Matches table for match metadata

### 2. Query Flow (History/Analytics)

```
Frontend ──Tauri Command──► Storage ──► SQLite ──► Results ──► Frontend
```

1. Frontend calls Tauri command (e.g., `get_matches(filters)`)
2. Rust builds parameterized SQL query
3. SQLite returns rows
4. Rust maps to DTOs and returns JSON
5. Frontend renders with React

---

## Module Breakdown

### Core Rust Modules

```
src-tauri/src/
├── main.rs                    # Entry point, Tauri builder
├── lib.rs                     # Public exports
├── commands/                  # Tauri command handlers (thin)
│   ├── live.rs               # Live match commands
│   ├── history.rs            # Match history commands
│   ├── analytics.rs          # Analytics commands
│   └── settings.rs           # Settings commands
├── core/
│   ├── ingestor/
│   │   ├── mod.rs            # TCP connection manager
│   │   ├── stream.rs         # Byte stream handling
│   │   └── reconnect.rs      # Reconnection logic
│   ├── parser/
│   │   ├── mod.rs            # Event parsing entry
│   │   ├── events.rs         # Event type definitions
│   │   ├── update_state.rs   # UpdateState parser
│   │   └── goal_scored.rs    # GoalScored parser
│   │   └── ...               # Other event parsers
│   ├── models/
│   │   ├── mod.rs
│   │   ├── match.rs          # Match domain model
│   │   ├── player.rs         # Player domain model
│   │   ├── event.rs          # Event domain model
│   │   └── stats.rs          # Statistics types
│   ├── storage/
│   │   ├── mod.rs
│   │   ├── connection.rs     # SQLite connection pool
│   │   ├── migrations.rs     # Schema migrations
│   │   ├── match_repo.rs     # Match CRUD
│   │   ├── event_repo.rs     # Event CRUD
│   │   └── analytics.rs      # Analytics queries
│   ├── metrics/
│   │   ├── mod.rs
│   │   ├── engine.rs         # Metrics calculation
│   │   ├── distance.rs       # Distance estimation
│   │   ├── boost_used.rs     # Boost usage estimation
│   │   └── rollups.rs        # Daily/weekly aggregation
│   ├── session/
│   │   ├── mod.rs
│   │   ├── manager.rs        # Match lifecycle tracking
│   │   ├── state_machine.rs  # Match state transitions
│   │   └── aggregator.rs     # Live stats aggregation
│   └── settings/
│       ├── mod.rs
│       ├── config.rs         # App configuration
│       └── ini_helper.rs     # RL Stats API INI helper
├── updater/
│   └── mod.rs                # Update check orchestration
└── error.rs                  # Global error types
```

### Frontend Modules

```
src/
├── components/
│   ├── ui/                   # Base components (shadcn)
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── AppShell.tsx
│   ├── live/
│   │   ├── LiveDashboard.tsx
│   │   ├── PlayerCard.tsx
│   │   ├── TeamPanel.tsx
│   │   ├── EventFeed.tsx
│   │   └── MatchTimer.tsx
│   ├── history/
│   │   ├── MatchList.tsx
│   │   ├── MatchCard.tsx
│   │   └── FilterBar.tsx
│   ├── match-detail/
│   │   ├── MatchHeader.tsx
│   │   ├── ScoreTimeline.tsx
│   │   ├── PlayerStatsTable.tsx
│   │   └── GoalDetail.tsx
│   ├── analytics/
│   │   ├── StatsGrid.tsx
│   │   ├── PerformanceChart.tsx
│   │   └── StreakCard.tsx
│   └── settings/
│       ├── SettingsPanel.tsx
│       ├── IniHelper.tsx
│       └── DataManagement.tsx
├── pages/
│   ├── LivePage.tsx
│   ├── HistoryPage.tsx
│   ├── MatchDetailPage.tsx
│   ├── AnalyticsPage.tsx
│   └── SettingsPage.tsx
├── hooks/
│   ├── useLiveMatch.ts       # Subscribe to live events
│   ├── useMatchHistory.ts    # Fetch history with filters
│   ├── useAnalytics.ts       # Fetch analytics data
│   └── useSettings.ts        # Read/write settings
├── stores/
│   ├── liveStore.ts          # Zustand: live match state
│   ├── uiStore.ts            # Zustand: UI state (sidebar, theme)
│   └── settingsStore.ts      # Zustand: app settings
├── lib/
│   ├── api.ts                # Tauri command wrappers
│   ├── types.ts              # Shared TypeScript types
│   ├── constants.ts          # App constants
│   └── utils.ts              # Utility functions
└── styles/
    └── globals.css           # Tailwind imports + custom
```

---

## Database Schema (SQLite)

### Tables

```sql
-- Application settings
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Matches
CREATE TABLE matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_guid TEXT UNIQUE,           -- From API (NULL for offline)
    start_time INTEGER NOT NULL,       -- Unix timestamp (ms)
    end_time INTEGER,
    duration_seconds INTEGER,
    arena TEXT,
    team_blue_score INTEGER DEFAULT 0,
    team_orange_score INTEGER DEFAULT 0,
    winner_team_num INTEGER,           -- 0 = blue, 1 = orange, NULL = draw
    is_online BOOLEAN DEFAULT FALSE,
    is_overtime BOOLEAN DEFAULT FALSE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Players (global player registry)
CREATE TABLE players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    primary_id TEXT UNIQUE,            -- "Steam|..." or "Epic|..."
    name TEXT NOT NULL,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
);

-- Match-Player association (stats at end of match)
CREATE TABLE match_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id),
    team_num INTEGER NOT NULL,         -- 0 or 1
    score INTEGER DEFAULT 0,
    goals INTEGER DEFAULT 0,
    shots INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    touches INTEGER DEFAULT 0,
    car_touches INTEGER DEFAULT 0,
    demos INTEGER DEFAULT 0,
    avg_speed REAL,
    max_speed REAL,
    avg_boost REAL,
    estimated_distance REAL,           -- Derived metric
    estimated_boost_used REAL,         -- Derived metric
    UNIQUE(match_id, player_id)
);

-- Discrete events (goals, saves, demos, etc.)
CREATE TABLE match_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,          -- "GoalScored", "StatfeedEvent", etc.
    event_data TEXT NOT NULL,          -- JSON payload
    game_time_seconds INTEGER,         -- Time in match when event occurred
    occurred_at INTEGER NOT NULL       -- Unix timestamp (ms)
);

-- Throttled state snapshots (for live replay and distance estimation)
CREATE TABLE state_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    game_time_seconds INTEGER NOT NULL,
    snapshot_data TEXT NOT NULL,       -- JSON: players array with positions/speed/boost
    captured_at INTEGER NOT NULL
);

-- Daily aggregated stats
CREATE TABLE daily_rollups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,         -- "YYYY-MM-DD"
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    matches_lost INTEGER DEFAULT 0,
    total_goals INTEGER DEFAULT 0,
    total_assists INTEGER DEFAULT 0,
    total_saves INTEGER DEFAULT 0,
    total_shots INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    avg_score REAL,
    avg_goals REAL,
    avg_saves REAL,
    win_rate REAL,
    updated_at INTEGER NOT NULL
);

-- Sessions (contiguous play periods)
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    match_count INTEGER DEFAULT 0,
    win_count INTEGER DEFAULT 0
);

-- Match-Session association
CREATE TABLE session_matches (
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, match_id)
);
```

### Indexes

```sql
CREATE INDEX idx_matches_start_time ON matches(start_time DESC);
CREATE INDEX idx_matches_guid ON matches(match_guid);
CREATE INDEX idx_match_events_match ON match_events(match_id, event_type);
CREATE INDEX idx_match_players_match ON match_players(match_id);
CREATE INDEX idx_snapshots_match_time ON state_snapshots(match_id, game_time_seconds);
CREATE INDEX idx_players_primary_id ON players(primary_id);
```

---

## Event Types (Domain Model)

```rust
// From Rocket League Stats API
pub enum RlEvent {
    UpdateState(UpdateStateData),
    BallHit(BallHitData),
    ClockUpdatedSeconds(ClockData),
    CountdownBegin(MatchRef),
    CrossbarHit(CrossbarHitData),
    GoalReplayEnd(MatchRef),
    GoalReplayStart(MatchRef),
    GoalReplayWillEnd(MatchRef),
    GoalScored(GoalScoredData),
    MatchCreated(MatchRef),
    MatchInitialized(MatchRef),
    MatchDestroyed(MatchRef),
    MatchEnded(MatchEndedData),
    MatchPaused(MatchRef),
    MatchUnpaused(MatchRef),
    PodiumStart(MatchRef),
    ReplayCreated(MatchRef),
    RoundStarted(MatchRef),
    StatfeedEvent(StatfeedEventData),
    Unknown { event: String, data: Value },
}
```

---

## State Management

### Frontend (Zustand)

```
liveStore:
  - currentMatch: Match | null
  - players: PlayerLiveState[]
  - events: LiveEvent[]
  - gameState: GameState
  - connectionStatus: 'connected' | 'disconnected' | 'connecting'

uiStore:
  - sidebarExpanded: boolean
  - theme: 'dark' | 'light' | 'system'
  - activePage: string
  - toastQueue: Toast[]

settingsStore:
  - playerName: string
  - autoStart: boolean
  - dataRetentionDays: number
  - enableEstimatedMetrics: boolean
```

### Backend (In-Memory + SQLite)

- Live session state managed in `SessionManager` (in-memory)
- Historical data persisted in SQLite
- Settings persisted in SQLite `app_settings` table
- No shared mutable state across threads without `Arc<Mutex<_>>`

---

## API Surface (Tauri Commands)

```rust
// Live
#[tauri::command]
async fn get_live_state() -> Result<LiveMatchState, Error>

#[tauri::command]
async fn get_connection_status() -> ConnectionStatus

// History
#[tauri::command]
async fn get_matches(filters: MatchFilters) -> Result<Vec<MatchSummary>, Error>

#[tauri::command]
async fn get_match_detail(match_id: i64) -> Result<MatchDetail, Error>

#[tauri::command]
async fn delete_match(match_id: i64) -> Result<(), Error>

// Analytics
#[tauri::command]
async fn get_analytics(period: AnalyticsPeriod) -> Result<AnalyticsData, Error>

#[tauri::command]
async fn get_daily_rollups(start_date: String, end_date: String) -> Result<Vec<DailyRollup>, Error>

// Settings
#[tauri::command]
async fn get_settings() -> Result<AppSettings, Error>

#[tauri::command]
async fn set_settings(settings: AppSettings) -> Result<(), Error>

#[tauri::command]
async fn configure_rl_ini() -> Result<(), Error>

#[tauri::command]
async fn export_data(path: String) -> Result<(), Error>

#[tauri::command]
async fn import_data(path: String) -> Result<(), Error>

#[tauri::command]
async fn get_storage_stats() -> Result<StorageStats, Error>

#[tauri::command]
async fn clear_all_data() -> Result<(), Error>

// Updates
#[tauri::command]
async fn check_for_update() -> Result<Option<UpdateInfo>, Error>
```

---

## Error Handling Strategy

### Rust
- Custom `AppError` enum with `thiserror`
- All errors implement `Serialize` for frontend transmission
- Errors logged with `tracing` before returning to frontend
- Never panic on user-facing operations

### Frontend
- Rust errors displayed as toast notifications
- Network/connection errors show in status bar
- Form validation errors inline
- Global error boundary catches React errors

---

## Performance Considerations

- **Event sampling**: UpdateState snapshots saved at most every 100ms during live match
- **Database**: WAL mode for SQLite, connection pooling
- **Frontend**: Virtualized lists for large history, memoized components
- **Memory**: Automatic cleanup of old snapshots (retain last 30 days by default)
- **Bundle size**: Tree-shake frontend, compress assets, minimal dependencies

---

## Future Extensibility

- Plugin system for custom metrics
- Cloud sync (opt-in, encrypted)
- Replay file integration
- External rank API integration (opt-in)
- Overlay mode (always-on-top transparent window)
- Multi-language support
