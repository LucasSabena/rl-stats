# Broadcast Studio

RL Stats ships a local broadcast stack for streamers and tournament
organizers: a design-pack overlay engine, a Control Room, a dock for OBS and
an HTTP/WebSocket API.

```
Rocket League ──TCP 49123──► Ingestor ──► SessionManager ──► SQLite
                                   │
                                   ▼
                          BroadcastHub (delay buffer)
                                   │
             ┌─────────────────────┼──────────────────────┐
             ▼                     ▼                      ▼
      /overlays/live        Chat (Twitch/Kick)      Action listener
    (OBS browser source)   ────────────────────►  (states, series, game cmds)
```

## 1. Enable the server

1. Open **Broadcast** in the sidebar (`/broadcast` → tab **Server**).
2. Set the port (default `9528`) and press **Start**.
3. Copy an OBS URL from **OBS sources** and paste it into a Browser source.

The server binds `127.0.0.1` by default. Enable **LAN mode** for a second PC
(OBS on another machine); in LAN mode a token is always required.

### Stable tokens

Tokens persist in SQLite with a role:

| Role | Can do |
| --- | --- |
| `admin` | Everything (server URLs, actions, configuration) |
| `referee` | Change state, edit series, timer, graphics, game commands |
| `viewer` | Read-only endpoints (`/api/state`, `/api/v2/*` GET, WS) |

Because the admin token never changes, OBS browser sources survive restarts.
Create extra tokens in **Server → Access tokens** for referees or the dock.

## 2. Design packs and scenes

A **scene** maps to a broadcast state (`waiting`, `live`, `replay`, `post`,
`brb`) and stores a layout of **modules** plus the **pack** used to style it.

Built-in packs: Prime Broadcast, Neon Circuit, Minimal Ink, Grid Retro, Glass
Lux, League Ops and Caster Board. Every pack defines colors, typography,
corner style, shadow, texture and motion.

Modules: `scorebug`, `series`, `roster`, `events`, `chat`, `brand`,
`countdown`, `timer`, `socials`, `sponsors`, `replaybadge`, `upnext`, `mvp`,
`info`.

In the **Scene** tab you can pick a pack, add/remove modules, drag them over
the live preview, fine-tune X/Y/W/H and save. Layouts persist in the
`broadcast_scenes` table; no base64 URLs.

### Overlay URLs

| Overlay | Path | Use |
| --- | --- | --- |
| Live (universal) | `/overlays/live` | The whole scene according to state |
| Chat | `/overlays/chat` | Chat only |
| Legacy pages | `/overlays/{enhanced,scoreboard,player-stats,event-feed,alerts,all-in-one}` | Existing setups |

Useful query parameters for `/overlays/live`:

| Parameter | Meaning |
| --- | --- |
| `token` | Access token |
| `scene` / `state` / `pack` | Force a scene, state or pack |
| `only` | Render only these modules (`only=chat`) |
| `sponsors` | Comma-separated sponsor image URLs |
| `brand` / `brandText` | Brand bug logo and text |
| `types`, `duration`, `position`, `max` | Alert filtering and placement |
| `boost=0` | Hide boost bars |
| `chatMax`, `goalDuration`, `sponsorInterval` | Tuning |

## 3. Teams and series

The **Teams** tab stores name, tag, primary/secondary colors and an uploaded
logo. **Series** are best-of-N with automatic winner detection and a per-game
log; the overlay picks up the team names, colors and logos automatically.

## 3.5 Tournaments

The **Tournament** tab runs events end to end:

1. Create a tournament (single elimination, round robin or Swiss, best-of N).
   Swiss generates one round at a time, paired by score and avoiding
   rematches.
2. Register teams from the library and mark their check-in.
3. **Generate bracket**: single elimination uses standard seeding with byes;
   round robin uses the circle method.
4. Schedule each pending match with a **station** and a time; the
   **Up next** list (and the overlay widget) shows the next matches.
5. Report each result; winners advance automatically and a finished final
   closes the tournament. Round robin shows the standings table.
6. **Start series** on any match: RL Stats creates the BO series (teams, colors
   and logos come from the library), links it to the bracket and the Control
   Room follows the live match.
7. **Live bridge**: when a real match ends, the active series scores the game
   automatically. When the series reaches the BO target it finishes, and if it
   is linked to the bracket the result is reported and the tree advances
   without anyone typing a score.

The `bracket` widget renders rounds, team tags, scores and winners on the
overlay (included in the default waiting and post scenes).

## 4. Chat (read-only)

The **Chat** tab connects to Twitch (anonymous IRC over WebSocket) and/or Kick
(Pusher). Messages are normalized with colors, badges and emotes, then fan out
to the overlay and the Control Room. Nothing is ever sent to chat.

## 4.5 Recording and replay ("retransmisión")

The **Recording & replay** card in the Control tab records the broadcast feed
to a JSONL file under `<app data>/broadcast_recordings/` (match `state` frames
are downsampled to 5/s; chat is not recorded). Any recording can be replayed
later on the same overlay feed with the original pacing at 0.25x–4x speed,
optionally looping — useful to re-air a match, test overlays offline or
recover a graphics feed. Replay events are tagged `source: "replay"` and are
never recorded back.

## 5. Broadcast delay

`set_delay` (0–600 s) buffers every event and re-emits it after the delay.
Use it when the video feed is delayed (anti stream-sniping): the graphics stay
in sync with what viewers see.

## 6. Game commands

The Stats API accepts commands on the same socket it streams on. The Control
Room exposes:

| Command | Effect |
| --- | --- |
| `SetMatchPaused` | Pause/resume the match or replay |
| `SetHUDVisibility` | Hide the in-game HUD for clean overlays |
| `ChangePOV` | Focus the ball or a player shortcut with a camera mode |
| `LoadReplay` / `SeekReplay` / `SetGameSpeed` | Replay control |

Commands require the game to be streaming and the user to be a
spectator/admin in that match.

## 7. API v2

All endpoints accept the token via `?token=` or the `x-rl-token` header.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Server status (no auth) |
| GET | `/api/state` | Latest match state |
| GET | `/api/v1/matches` | Recent matches |
| GET | `/api/v1/stats?days=N` | Aggregated stats |
| GET | `/api/v2/scene` | Scene + pack + layout + series |
| GET | `/api/v2/packs` | Built-in and custom packs, fonts |
| GET | `/api/v2/series` | Active series snapshot |
| GET | `/api/v2/teams` | Team library |
| GET | `/api/v2/tournament` | Active (or requested) tournament snapshot |
| POST | `/api/v2/action` | Operator actions |
| GET | `/assets/{file}` | Uploaded assets |
| WS | `/ws` | Live feed (state, goal, statfeed, chat, scene, series, timer, delay) |

Actions for `/api/v2/action` (and Stream Deck buttons):

```json
{ "action": "set_state",    "data": { "state": "live" } }
{ "action": "series_score", "data": { "scoreA": 2, "scoreB": 1 } }
{ "action": "take_graphic", "data": { "id": "scorebug-abc123" } }
{ "action": "set_delay",    "data": { "seconds": 90 } }
{ "action": "timer",        "data": { "op": "start", "seconds": 120 } }
{ "action": "game_command", "data": { "command": "SetMatchPaused", "paused": true } }
```

## 8. Operator dock

`/dock?token=...` is a compact console with state buttons, series score,
rundown, timer, delay and chat. Add it to OBS via **Docks → Custom Browser
Docks**, or open it on a phone in LAN mode.

## 9. OBS Studio auto-switch

With obs-websocket (OBS 28+) enabled, set the URL, password and the scene
name for each state in **Server → OBS Studio**. RL Stats then switches the
program scene when the broadcast state changes. Without OBS the overlays keep
working on their own.

## 10. Security

- Loopback by default; tokens are required for foreign origins and LAN mode.
- Uploaded SVGs are rejected on purpose (same-origin script risk); files are
  stored under `<app data>/broadcast_assets/` with generated names.
- No telemetry: chat and match data stay on the machine.
