# MMR Provider Strategy

## Goal

Show live lobby MMR for every player in the match without touching game
memory, injecting into the client, or coercing the user into third-party
accounts and paid APIs.

## Architecture

```
Stats API (TCP 49123)
  └─ PlaylistId + PrimaryId (authoritative, per UpdateState)
        │
        ├─ 1. rlstats-webview   hidden WebView2 scrapes rlstats.net (primary)
        ├─ 2. rapidapi          optional, requires paid RapidAPI key
        ├─ 3. tracker           deprecated (no API keys for RL, Cloudflare)
        ├─ 4. parsebot          optional, requires user scraper + credits
        ├─ 5. rlstats (HTTP)    legacy fallback, usually Cloudflare-blocked
        ├─ 6. history           last exact MMR stored for that player/playlist
        └─ 7. local-estimate    local player baseline + per-match delta
```

Resolution rules:

- At most one network lookup per player per match; results are cached in
  `mmr_cache` (`rlstats-webview` TTL is 30 minutes).
- A whole lobby shares a single rlstats.net navigation: the resolver holds the
  scraper lock across the cache check, so players 2..N hit the DB cache.
- The playlist comes from `Game.PlaylistId`; team-size inference is only a
  fallback for streams/replays that do not report it.
- The UI distinguishes exact, cached, historical, estimated, and unavailable
  data through `LivePlayerMmr`.

## Primary provider: rlstats-webview

`core/mmr/webview.rs` creates a hidden, unfocused, taskbar-less WebView2 window
that loads `rlstats.net/profile/{platform}/{id}`. A real browser engine clears
the Cloudflare challenge once and the clearance cookies persist for later
lookups. An injected synchronous script extracts the current-season skill
tables (rank, division, MMR, matches, streak, casual rating) and returns a JSON
object through `eval_with_callback`; no remote IPC capability is needed.

Why this route: it is free, requires no account or key, works for every
platform, and — unlike BakkesMod/memory reading — carries no risk of account
action. The site owner has publicly tolerated low-volume scraping, which is why
lookups are serialized, throttled, and cached.

Resource usage while playing:

- At most one navigation per lobby (triggered on `CountdownBegin`), then cached
  for 30 minutes. There is no polling and no per-frame work.
- The scrape itself is a short CPU/network burst comparable to opening one
  browser tab (~1-3 s).
- After every scrape the window is parked on `about:blank`, so the site's
  JavaScript and timers stop running.
- A background reaper destroys the hidden window after 10 minutes without use.
  WebView2 keeps Cloudflare clearance cookies on disk, so a later lookup
  recreates the window and reuses them.
- While the app is open but not resolving MMR, the scraper costs one atomic
  read per minute.

Failure modes and handling:

- Cloudflare does not clear within the timeout: the lookup is recorded as an
  error and resolution falls back to history/estimate. The settings card shows
  the real error and offers "Probar ahora".
- Profile not found: terminal error for that player, no retries.
- Page without ranked playlists: treated as an empty profile, not an error.
- No WebView2 runtime: window creation fails gracefully and legacy providers
  keep working.

## Provider health

`mmr_provider_health` (migration v23) stores per-provider status, last error,
latency, and success/failure counters. The Settings > Game tab shows the
primary provider state and runs an on-demand probe via
`test_mmr_provider("rlstats-webview")` using the configured local profile.

The scraper is controlled by the `mmr_scraper_enabled` setting (default on).
When disabled, no hidden window is created and resolution falls back to the
legacy providers, history, and estimates. "Force refresh" also clears the
`rlstats-webview` cache entry.

## Deprecated / optional providers

- **Tracker Network**: it stopped granting Rocket League API keys and protects
  the site with Cloudflare; the HTTP client cannot work. Kept in the codebase
  but not recommended, and no longer the primary path.
- **RapidAPI**: the host is alive and `GET /ranks/{epicId}` works with a paid
  subscription, but the free tier is far too small for lobby lookups.
- **Parse.bot**: managed anti-bot scraping, requires a user-built scraper and
  credits; the integration stays as an optional provider.
- **PsyNet RPC (`Skills/GetPlayersSkills`)**: exact and batch, but it is the
  game's private backend and using it violates the ToS, so it is explicitly
  out of scope.
- **BakkesMod / process memory**: exposes real MMR, but there are ban reports
  and offsets break every patch. Out of scope.

## Known limitations

1. rlstats.net refresh latency depends on the site; MMR can lag the current
   match by minutes. Data is still exact as of `fetched_at`.
2. Casual modes are collapsed into the single `casual` rating that providers
   expose; ranked modes keep their own ladders.
3. Extra/limited-time modes may not exist on rlstats; results fall back to
   history/estimate.
4. Tournament playlists have no public MMR source.

## Verification

- `cargo test` covers playlist id mapping, extractor payload parsing, URL
  encoding, and profile mapping.
- Manual matrix: ranked 1v1/2v2/3v3, casual, tournament, rumble, bot/console
  players, offline, provider failure, unconfigured profile.
