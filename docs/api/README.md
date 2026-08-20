# Rocket League Stats API — Reference

> Source: https://www.rocketleague.com/developer/stats-api (scrape blocked)
> Based on reverse-engineering from real captures + reference libraries

## Overview

The Stats API broadcasts JSON messages over a **raw TCP socket** (not WebSocket) on `127.0.0.1:PORT` while a match is in progress. Messages are sent at a configurable periodic rate and when specific match events occur.

## Message Format (the real wire format)

Every message is a single JSON object that arrives concatenated on the TCP stream (no newline delimiter in all builds):

```json
{"Event":"UpdateState","Data":"{\"Players\":[...],\"Game\":{...}}"}
```

**CRITICAL**: `Data` is a **JSON-encoded string**, not a nested object. You must `JSON.parse()` it a second time.

### Known events

| Event name | Payload inside Data |
|---|---|
| `UpdateState` | `Players` (array), `Game` (object with Teams, TimeSeconds, Arena, Ball, etc.) |
| `GoalScored` | `Scorer` (object), `Assister` (optional object), `GoalSpeed` (float) |
| `StatfeedEvent` | `EventName` (string: Goal/Assist/Save/Shot/Demolish), `MainTarget`, `SecondaryTarget` |
| `MatchCreated` | (no significant payload) |
| `MatchInitialized` | (no significant payload) |
| `MatchEnded` | `WinnerTeamNum` (int) |
| `MatchDestroyed` | (no significant payload) |
| `MatchPaused` | (no significant payload) |
| `MatchUnpaused` | (no significant payload) |
| `ClockUpdatedSeconds` | `TimeSeconds` (int) |
| `BallHit` | `Player` (object), `BallSpeed` (float) |
| `CountdownBegin` | (no significant payload) |
| `RoundStarted` | (no significant payload) |
| `GoalReplayStart` | (no significant payload) |
| `GoalReplayWillEnd` | (no significant payload) |
| `GoalReplayEnd` | (no significant payload) |
| `PodiumStart` | (no significant payload) |
| `CrossbarHit` | (no significant payload) |
| `ReplayCreated` | (no significant payload) |
| `ReplayWillEnd` | (without "Goal" prefix in some builds) |

### Player object fields

```json
{
  "Name": "PlayerName",
  "PrimaryId": "Steam|7656119...|0",
  "Shortcut": 1,
  "TeamNum": 0,
  "Score": 250,
  "Goals": 1,
  "Shots": 2,
  "Assists": 0,
  "Saves": 1,
  "Touches": 264,
  "CarTouches": 0,
  "Demos": 0,
  "bOnGround": true,
  "bHasCar": true,
  "Speed": 0.009,
  "Boost": 33
}
```

### Gotchas

1. **Boost is spectator-scoped**: the `Boost` field only appears when spectating or on the same team.
2. **Bot matches collapse PrimaryId**: every bot gets `PrimaryId: "Unknown|0|0"`.
3. **No position data**: player/ball positions are not emitted (no heatmaps/minimaps possible).
4. **Data is a string**: must re-parse `Data` field from JSON string to object.

## Configuration

File: `<RL install>\TAGame\Config\DefaultStatsAPI.ini`

```ini
[TAGame.MatchStatsExporter_TA]
Port=49123
PacketSendRate=10
```

- `PacketSendRate`: updates per second (1–120). `0` disables.
- `Port`: TCP port (default 49123).

### Multiple installs (Steam + Epic Games)

A user can own Rocket League on both Steam and Epic, with separate installs.
RL Stats supports this natively:

- All detected installs are listed in **Settings → Rocket League** (`rl_paths`).
- On app startup, and whenever settings are saved, the app auto-writes
  `DefaultStatsAPI.ini` into **every** configured install, so the Stats API
  works no matter which platform launches the game.
- The active platform is derived from the running `RocketLeague.exe` path
  (`game-status-changed` event payload) and stored in `active_platform`.
  The local player identity resolution prefers the in-match `PrimaryId` whose
  platform prefix matches the active platform before falling back to name
  matching, so stats land on the right account per platform.

## References

- [xentrick/rlstatsapi](https://github.com/xentrick/rlstatsapi) — Rust client (reference implementation)
- [zomlit/rocket-league-stats-api](https://github.com/zomlit/rocket-league-stats-api) — TypeScript client
- [manucabral/RocketLeagueStatsAPI](https://github.com/manucabral/RocketLeagueStatsAPI) — Python client
- Psyonix official docs: https://www.rocketleague.com/developer/stats-api
