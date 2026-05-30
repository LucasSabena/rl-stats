# Cloud Sync Plan

RL Stats remains local-first: the app works without an account and no gameplay/profile data leaves the device unless the user explicitly enables cloud sync. This document tracks the local sync foundation and the future cloud/billing work.

## Product model

- **Free**: local-only, no login required.
- **Cloud Sync Basic**: paid plan close to infrastructure cost.
- **Cloud Sync Supporter**: same features as Basic, higher voluntary price to support the project.

Both paid plans unlock the same sync capabilities. Billing/auth are intentionally not implemented in Stage 1.

## Provider direction

Initial recommendation: **Supabase + Stripe**.

- Supabase: Postgres, Auth, RLS, Edge Functions/RPCs.
- Stripe: subscriptions, checkout, customer portal, webhooks.
- MVP auth providers: email/password, Google, Discord.
- Steam/Epic can be added later as linked accounts or custom auth flows.

## Sync principles

1. **Local-first**: all writes go to SQLite first.
2. **Opt-in cloud**: cloud sync only starts after login + active plan.
3. **Entity-level sync**: do not upload the SQLite file as a blob.
4. **Stable keys**: every syncable entity needs a deterministic `entity_key`.
5. **Outbox pattern**: local mutations enqueue changes; the future sync engine pushes them in batches.
6. **Idempotency**: every queued change has an `idempotency_key` so retries do not duplicate cloud data.
7. **Cursors/revisions**: future pull sync will use server revisions, not full-table reloads.
8. **Forward-compatible API data**: unknown/new Rocket League API events continue to be stored as raw JSON and synced as opaque payloads until the app learns richer models.

## Stage 1 implemented locally

Migration `20_create_local_sync_metadata` adds these SQLite tables to every profile DB. A small app-level SQLite database, `rl_stats_app_sync.db`, uses the same table shape for global metadata that does not belong to a single profile, such as `profiles.json` snapshots.

### `sync_metadata`

Key/value metadata for the local sync engine.

Current keys:

- `sync.device_id`
- `sync.protocol_version`
- `sync.last_pulled_revision`

### `sync_entity_state`

Tracks local/cloud state per entity without adding sync columns to every domain table.

This makes future entities easier to add: a new table does not need `cloud_id`, `dirty`, or `server_revision` columns; it just needs a stable `entity_type + entity_key` entry.

### `sync_outbox`

Queue for local changes pending cloud upload. Pending `upsert` changes for the same `entity_type + entity_key` are coalesced locally so repeated updates do not create unnecessary future cloud traffic.

Important columns:

- `entity_type`
- `entity_key`
- `operation`: `upsert` or `delete`
- `payload_json`
- `idempotency_key`
- `attempts`
- `last_error`
- `synced_at`

### `sync_tombstones`

Stores delete markers so future cloud sync can propagate removals safely.

## Current local sync entities

The app now enqueues local changes for:

- `match`
- `player`
- `match_player`
- `match_event`
- `session`
- `app_settings`
- `tracker_cache`
- `rlstats_cache`
- `mmr_cache`
- `friend`
- `user_preset`
- `profile_data` for destructive full-profile clears

The app-level sync DB currently enqueues:

- `profiles_manifest`

`daily_rollups` are currently treated as derived analytics. They can be rebuilt from canonical match/player data and should not be the source of truth in cloud sync unless we later decide to cache analytics server-side.

## How to add a future local + cloud entity

When the Rocket League Stats API exposes something new, or the app adds a new persistent feature, follow this checklist:

1. Add/extend the local SQLite migration.
2. Pick an `entity_type`, e.g. `boost_timeline`.
3. Pick a stable `entity_key` that is deterministic across devices when possible.
   - Prefer external IDs from the API.
   - Otherwise derive from parent stable keys, timestamps, event type, and player IDs.
4. Persist the local row normally.
5. Enqueue the mutation:
   - `sync::enqueue_upsert_conn(...)` for inserts/updates.
   - `sync::enqueue_delete_conn(...)` for deletes.
6. Include enough `payload_json` for the future push worker to hydrate or debug the entity.
7. Add the matching cloud table/RPC mapping in the cloud stage.
8. Add deduplication constraints in cloud, usually `user_id + profile_id + entity_key`.

## Cloud backend shape

The repo now includes initial Supabase SQL migrations under `supabase/migrations/`:

- `0001_cloud_sync_schema.sql`: tables, RLS, revisions, change log, `sync_pull`.
- `0002_sync_push_rpc.sql`: initial idempotent `sync_push` RPC.

The app should not make arbitrary cloud database queries from React. The future Rust sync worker should call narrow RPCs/Edge Functions:

- `sync_push`
- `sync_pull`
- future `sync_status`

Push flow:

1. Read pending rows from `sync_outbox` by ascending `id`.
2. Hydrate pending rows from canonical SQLite tables with `get_pending_hydrated_changes` so cloud receives full entity payloads, not just local IDs.
3. Build a typed `CloudPushRequest` with `core::cloud::build_push_request`.
4. Send a bounded batch, e.g. 100-500 changes.
5. Server validates auth + active plan.
6. Server upserts/deletes idempotently through `sync_push`.
7. Server records a `sync_changes` revision.
8. Client marks outbox rows as synced.

Pull flow:

1. Read `sync.last_pulled_revision`.
2. Ask server for changes after that revision.
3. Apply changes to SQLite without re-enqueueing them, or mark them as remote-origin changes.
4. Update `sync.last_pulled_revision`.

## Conflict/dedup strategy

Matches should not overwrite each other blindly. Preferred strategy:

1. Use a real API match GUID when available.
2. If missing, compute a deterministic fingerprint from:
   - start time rounded to a tolerance,
   - playlist/match type,
   - arena,
   - duration,
   - final score,
   - player primary IDs/names.
3. Cloud uses `ON CONFLICT`/unique constraints on stable keys/fingerprints.
4. Historical gameplay rows are mostly append-only; settings can use last-write-wins initially.

## Stage 1 local storage layout

```txt
app_data_dir/
├── profiles.json              # Existing profile manifest
├── rl_stats_app_sync.db       # App-level sync queue/metadata
├── rl_stats_default.db        # Profile DB + profile-level sync queue
└── rl_stats_<profile_id>.db   # Additional profile DBs
```

## Not in Stage 1

- Live Supabase project provisioning.
- Auth UI.
- Token storage.
- Stripe billing.
- Actual network sync worker.
- Cloud RLS policies.
- Import/export UX changes.

Those belong to Stages 2+.
