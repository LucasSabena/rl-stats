use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use tracing::{debug, info};

/// Represents a single database migration.
pub struct Migration {
    pub version: i32,
    pub name: &'static str,
    pub sql: &'static str,
}

/// All database migrations in order.
/// Keep versions sequential — new migrations must be appended at the end.
pub static MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "create_matches_table",
        sql: "CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guid TEXT NOT NULL UNIQUE,
            start_time TEXT NOT NULL,
            end_time TEXT,
            arena TEXT,
            score_blue INTEGER NOT NULL DEFAULT 0,
            score_orange INTEGER NOT NULL DEFAULT 0,
            winner INTEGER,
            is_online INTEGER NOT NULL DEFAULT 0,
            is_overtime INTEGER NOT NULL DEFAULT 0,
            duration_seconds INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time);
        CREATE INDEX IF NOT EXISTS idx_matches_guid ON matches(guid);",
    },
    Migration {
        version: 2,
        name: "create_players_table",
        sql: "CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            primary_id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_players_primary_id ON players(primary_id);",
    },
    Migration {
        version: 3,
        name: "create_match_players_table",
        sql: "CREATE TABLE IF NOT EXISTS match_players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
            player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            team_num INTEGER NOT NULL,
            score INTEGER NOT NULL DEFAULT 0,
            goals INTEGER NOT NULL DEFAULT 0,
            shots INTEGER NOT NULL DEFAULT 0,
            assists INTEGER NOT NULL DEFAULT 0,
            saves INTEGER NOT NULL DEFAULT 0,
            touches INTEGER NOT NULL DEFAULT 0,
            car_touches INTEGER NOT NULL DEFAULT 0,
            demos INTEGER NOT NULL DEFAULT 0,
            speed REAL NOT NULL DEFAULT 0.0,
            boost INTEGER NOT NULL DEFAULT 0,
            UNIQUE(match_id, player_id)
        );",
    },
    Migration {
        version: 4,
        name: "create_match_events_table",
        sql: "CREATE TABLE IF NOT EXISTS match_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            event_data TEXT NOT NULL DEFAULT '{}',
            occurred_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON match_events(match_id);",
    },
    Migration {
        version: 5,
        name: "create_state_snapshots_table",
        sql: "CREATE TABLE IF NOT EXISTS state_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
            snapshot_json TEXT NOT NULL,
            captured_at TEXT NOT NULL
        );",
    },
    Migration {
        version: 6,
        name: "create_daily_rollups_table",
        sql: "CREATE TABLE IF NOT EXISTS daily_rollups (
            date TEXT PRIMARY KEY,
            matches_played INTEGER NOT NULL DEFAULT 0,
            wins INTEGER NOT NULL DEFAULT 0,
            losses INTEGER NOT NULL DEFAULT 0,
            goals_scored INTEGER NOT NULL DEFAULT 0,
            goals_conceded INTEGER NOT NULL DEFAULT 0,
            total_shots INTEGER NOT NULL DEFAULT 0,
            total_saves INTEGER NOT NULL DEFAULT 0,
            avg_duration_seconds INTEGER NOT NULL DEFAULT 0
        );",
    },
    Migration {
        version: 7,
        name: "create_sessions_table",
        sql: "CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
            summary_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );",
    },
    Migration {
        version: 8,
        name: "create_app_settings_table",
        sql: "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    },
    Migration {
        version: 9,
        name: "add_total_demos_and_total_assists_to_daily_rollups",
        sql: "ALTER TABLE daily_rollups ADD COLUMN total_demos INTEGER NOT NULL DEFAULT 0;
             ALTER TABLE daily_rollups ADD COLUMN total_assists INTEGER NOT NULL DEFAULT 0;",
    },
    Migration {
        version: 10,
        name: "create_tracker_cache_table",
        sql: "CREATE TABLE IF NOT EXISTS tracker_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            username TEXT NOT NULL,
            profile_json TEXT NOT NULL,
            fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(platform, username)
        );",
    },
    Migration {
        version: 11,
        name: "add_match_type_and_playlist_to_matches",
        sql: "ALTER TABLE matches ADD COLUMN match_type TEXT;
             ALTER TABLE matches ADD COLUMN playlist TEXT;
             CREATE INDEX IF NOT EXISTS idx_matches_match_type ON matches(match_type);",
    },
    Migration {
        version: 12,
        name: "create_mmr_cache_table",
        sql: "CREATE TABLE IF NOT EXISTS mmr_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            platform TEXT NOT NULL,
            identifier TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            fetched_at TEXT NOT NULL,
            UNIQUE(provider, platform, identifier)
        );

        CREATE INDEX IF NOT EXISTS idx_mmr_cache_lookup ON mmr_cache(provider, platform, identifier);",
    },
    Migration {
        version: 13,
        name: "add_mmr_to_match_players",
        sql: "ALTER TABLE match_players ADD COLUMN mmr INTEGER;",
    },
    Migration {
        version: 14,
        name: "create_rlstats_cache_table",
        sql: "CREATE TABLE IF NOT EXISTS rlstats_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            username TEXT NOT NULL,
            profile_json TEXT NOT NULL,
            fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(platform, username)
        );",
    },
    Migration {
        version: 15,
        name: "add_avg_score_to_daily_rollups",
        sql: "ALTER TABLE daily_rollups ADD COLUMN avg_score INTEGER NOT NULL DEFAULT 0;",
    },
    Migration {
        version: 16,
        name: "create_friends_table",
        sql: "CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
            tag TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_friends_player_id ON friends(player_id);",
    },
    Migration {
        version: 17,
        name: "add_head_to_head_to_match_players",
        sql: "ALTER TABLE match_players ADD COLUMN head_to_head_json TEXT;",
    },
    Migration {
        version: 18,
        name: "add_kickoff_goals",
        sql: "ALTER TABLE match_players ADD COLUMN kickoff_goals INTEGER NOT NULL DEFAULT 0;\n         ALTER TABLE daily_rollups ADD COLUMN kickoff_goals_scored INTEGER NOT NULL DEFAULT 0;\n         ALTER TABLE daily_rollups ADD COLUMN kickoff_goals_conceded INTEGER NOT NULL DEFAULT 0;",
    },
    Migration {
        version: 19,
        name: "create_user_presets_table",
        sql: "CREATE TABLE IF NOT EXISTS user_presets (\n            id INTEGER PRIMARY KEY AUTOINCREMENT,\n            name TEXT NOT NULL,\n            description TEXT,\n            camera_json TEXT,\n            controls_json TEXT,\n            deadzone_json TEXT,\n            hardware_json TEXT,\n            created_at TEXT NOT NULL,\n            updated_at TEXT NOT NULL\n        );\n        CREATE INDEX IF NOT EXISTS idx_user_presets_name ON user_presets(name);",
    },
    Migration {
        version: 20,
        name: "create_local_sync_metadata",
        sql: "CREATE TABLE IF NOT EXISTS sync_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sync_entity_state (
            entity_type TEXT NOT NULL,
            entity_key TEXT NOT NULL,
            cloud_id TEXT,
            payload_hash TEXT,
            server_revision INTEGER NOT NULL DEFAULT 0,
            dirty INTEGER NOT NULL DEFAULT 0,
            last_pushed_at TEXT,
            last_pulled_at TEXT,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (entity_type, entity_key)
        );

        CREATE TABLE IF NOT EXISTS sync_outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_key TEXT NOT NULL,
            operation TEXT NOT NULL CHECK(operation IN ('upsert', 'delete')),
            payload_json TEXT NOT NULL DEFAULT '{}',
            idempotency_key TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            available_at TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            locked_at TEXT,
            synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sync_tombstones (
            entity_type TEXT NOT NULL,
            entity_key TEXT NOT NULL,
            deleted_at TEXT NOT NULL,
            payload_json TEXT NOT NULL DEFAULT '{}',
            source_outbox_id INTEGER,
            PRIMARY KEY (entity_type, entity_key)
        );

        CREATE INDEX IF NOT EXISTS idx_sync_entity_state_dirty ON sync_entity_state(dirty, updated_at);
        CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(synced_at, available_at, id);
        CREATE INDEX IF NOT EXISTS idx_sync_outbox_entity ON sync_outbox(entity_type, entity_key);
        CREATE INDEX IF NOT EXISTS idx_sync_tombstones_deleted_at ON sync_tombstones(deleted_at);",
    },
    Migration {
        version: 21,
        name: "add_game_clock_to_match_events",
        sql: "ALTER TABLE match_events ADD COLUMN game_time_remaining REAL;",
    },
    Migration {
        version: 22,
        name: "add_mood_to_matches",
        sql: "ALTER TABLE matches ADD COLUMN mood TEXT;",
    },
];

/// Run all pending migrations against the given connection.
/// Creates the `schema_migrations` tracking table if it does not exist,
/// then applies each unapplied migration inside its own transaction.
pub fn run_migrations(conn: &Connection) -> AppResult<()> {
    // Ensure the tracking table exists (this is NOT a versioned migration itself).
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| AppError::StorageError(format!("Failed to create schema_migrations: {e}")))?;

    // Read the highest version that has already been applied.
    let current_version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    info!(
        current_version,
        "Checking migrations ({} total defined)",
        MIGRATIONS.len()
    );

    let mut applied_count = 0u32;

    for migration in MIGRATIONS {
        if migration.version <= current_version {
            continue;
        }

        debug!(
            version = migration.version,
            name = migration.name,
            "Applying migration"
        );

        // Run the migration SQL inside a transaction.
        conn.execute("BEGIN", [])
            .map_err(|e| AppError::StorageError(format!("BEGIN failed: {e}")))?;

        let result = conn.execute_batch(migration.sql);

        match result {
            Ok(()) => {
                let now = chrono::Utc::now().to_rfc3339();
                conn.execute(
                    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
                    params![migration.version, migration.name, now],
                )
                .map_err(|e| {
                    AppError::StorageError(format!(
                        "Failed to record migration v{}: {e}",
                        migration.version
                    ))
                })?;

                conn.execute("COMMIT", [])
                    .map_err(|e| AppError::StorageError(format!("COMMIT failed: {e}")))?;

                applied_count += 1;
                info!(
                    version = migration.version,
                    name = migration.name,
                    "Migration applied"
                );
            }
            Err(e) => {
                // Rollback on failure.
                let _ = conn.execute("ROLLBACK", []);
                return Err(AppError::StorageError(format!(
                    "Migration v{} ({}) failed: {e}",
                    migration.version, migration.name
                )));
            }
        }
    }

    if applied_count > 0 {
        info!(applied_count, "Migrations completed");
    } else {
        info!("Database is up to date — no migrations needed");
    }

    Ok(())
}
