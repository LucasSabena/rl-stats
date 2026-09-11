//! Integration tests for Tauri command handlers using the mock runtime
//! (`tauri::test`). Each test builds a real `AppState` backed by a temporary
//! SQLite database and drives the registered IPC commands exactly like the
//! frontend would.

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use rl_stats_lib::core::models::ConnectionStatus;
use rl_stats_lib::core::session::SessionManager;
use rl_stats_lib::core::settings::{get_settings, set_settings};
use rl_stats_lib::core::storage::{init_storage, DbPool};
use rl_stats_lib::{AppState, SessionTally};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY,
};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindowBuilder};

const LOCAL_ID: &str = "Steam|local";
const LOCAL_NAME: &str = "LocalPlayer";

/// Unique temp database path; the caller removes it (and its WAL siblings).
fn temp_db_path() -> PathBuf {
    let dir = std::env::temp_dir().join("rl_stats_cmd_tests");
    std::fs::create_dir_all(&dir).expect("create temp dir");
    dir.join(format!("cmd_{}.db", uuid::Uuid::new_v4()))
}

fn cleanup(path: &PathBuf) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(path.with_extension("db-wal"));
    let _ = std::fs::remove_file(path.with_extension("db-shm"));
}

/// Build a mock-runtime app with the analytics commands registered and an
/// `AppState` pointing at the given pool (no scraper: production sets it to
/// `None` under the mock runtime).
///
/// `Builder::setup` only runs when the event loop starts, which command tests
/// never do, so the state is managed directly on the built app.
fn create_app(pool: Arc<DbPool>) -> tauri::App<MockRuntime> {
    let app = mock_builder()
        .invoke_handler(tauri::generate_handler![
            rl_stats_lib::commands::analytics::get_sessions,
            rl_stats_lib::commands::analytics::get_session_matches,
            rl_stats_lib::commands::analytics::get_analytics,
        ])
        .build(mock_context(noop_assets()))
        .expect("failed to build mock tauri app");

    app.manage(AppState {
        db_pool: pool,
        session_manager: Arc::new(tokio::sync::RwLock::new(SessionManager::new(7))),
        ingestor_status: Arc::new(tokio::sync::RwLock::new(ConnectionStatus {
            connected: false,
            address: "127.0.0.1:49123".to_string(),
            last_error: None,
            reconnect_attempts: 0,
            game_running: false,
        })),
        game_running: Arc::new(AtomicBool::new(false)),
        session_tally: Arc::new(tokio::sync::Mutex::new(SessionTally::default())),
        overlay_server: Arc::new(tokio::sync::Mutex::new(None)),
        overlay_handle: Arc::new(std::sync::Mutex::new(None)),
        rlstats_scraper: None,
    });

    app
}

fn create_webview(app: &tauri::App<MockRuntime>) -> tauri::WebviewWindow<MockRuntime> {
    WebviewWindowBuilder::new(app, "main", Default::default())
        .build()
        .expect("failed to build mock webview")
}

/// Invoke a registered command and deserialize its JSON response.
fn invoke(
    webview: &tauri::WebviewWindow<MockRuntime>,
    cmd: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, serde_json::Value> {
    get_ipc_response(
        webview,
        InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: "tauri://localhost".parse().unwrap(),
            body: InvokeBody::Json(body),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|response| {
        response
            .deserialize::<serde_json::Value>()
            .expect("command response must be valid JSON")
    })
}

/// Configure the profile-local identity so the commands can resolve the local
/// team (`local_team`, `is_win`, `my_kickoff_goals`, individual scope).
fn seed_local_settings(pool: &DbPool) {
    let mut settings = get_settings(pool).expect("get default settings");
    settings.local_primary_id = Some(LOCAL_ID.to_string());
    settings.player_name = LOCAL_NAME.to_string();
    set_settings(pool, &settings).expect("persist test settings");
}

/// Seed one ranked match: local player (team 0) beats a rival 3-1, with 2
/// kickoff goals scored by the local player and 1 by the rival.
fn seed_match(pool: &DbPool, start: chrono::DateTime<chrono::Utc>) -> i64 {
    let conn = pool.get().expect("checkout db connection");

    conn.execute(
        "INSERT INTO matches (guid, start_time, end_time, arena, score_blue, score_orange,
             winner, is_online, is_overtime, duration_seconds, match_type, playlist)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            "cmd-test-guid",
            start.to_rfc3339(),
            (start + chrono::Duration::minutes(6)).to_rfc3339(),
            "DFHStadium",
            3,
            1,
            0,
            1,
            0,
            360,
            "ranked",
            "Doubles",
        ],
    )
    .expect("insert match");
    let match_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO players (primary_id, name) VALUES (?1, ?2)",
        rusqlite::params![LOCAL_ID, LOCAL_NAME],
    )
    .expect("insert local player");
    let local_player_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO players (primary_id, name) VALUES (?1, ?2)",
        rusqlite::params!["Epic|rival", "Rival"],
    )
    .expect("insert rival player");
    let rival_player_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO match_players (match_id, player_id, team_num, score, goals, shots,
             assists, saves, touches, car_touches, demos, speed, boost, kickoff_goals)
         VALUES (?1, ?2, 0, 500, 2, 4, 1, 0, 20, 10, 1, 1500.0, 40, 2)",
        rusqlite::params![match_id, local_player_id],
    )
    .expect("insert local match player");

    conn.execute(
        "INSERT INTO match_players (match_id, player_id, team_num, score, goals, shots,
             assists, saves, touches, car_touches, demos, speed, boost, kickoff_goals)
         VALUES (?1, ?2, 1, 300, 1, 3, 0, 2, 15, 8, 0, 1400.0, 30, 1)",
        rusqlite::params![match_id, rival_player_id],
    )
    .expect("insert rival match player");

    match_id
}

/// `get_sessions` on a freshly migrated, empty database returns `[]`.
#[test]
fn get_sessions_empty_db_returns_empty_list() {
    let path = temp_db_path();
    let pool = Arc::new(init_storage(&path).expect("init storage"));
    let app = create_app(pool);
    let webview = create_webview(&app);

    let response =
        invoke(&webview, "get_sessions", serde_json::json!({})).expect("get_sessions must succeed");

    assert_eq!(response, serde_json::json!([]));

    drop(webview);
    drop(app);
    cleanup(&path);
}

/// `get_session_matches` returns the seeded match with its players resolved,
/// the local team, the win flag and the local team's kickoff goals.
#[test]
fn get_session_matches_returns_seeded_match_and_players() {
    let path = temp_db_path();
    let pool = Arc::new(init_storage(&path).expect("init storage"));
    seed_local_settings(&pool);
    let start = chrono::Utc::now();
    let match_id = seed_match(&pool, start);

    let app = create_app(Arc::clone(&pool));
    let webview = create_webview(&app);

    let query = serde_json::json!({
        "query": {
            "start_time": (start - chrono::Duration::hours(1)).to_rfc3339(),
            "end_time": (start + chrono::Duration::hours(1)).to_rfc3339(),
        }
    });
    let response =
        invoke(&webview, "get_session_matches", query).expect("get_session_matches must succeed");

    let matches = response
        .as_array()
        .expect("get_session_matches must return an array");
    assert_eq!(matches.len(), 1, "exactly one seeded match expected");

    let matched = &matches[0];
    assert_eq!(matched["id"], serde_json::json!(match_id));
    assert_eq!(matched["local_team"], serde_json::json!(0));
    assert_eq!(matched["is_win"], serde_json::json!(true));
    assert_eq!(matched["my_kickoff_goals"], serde_json::json!(2));
    assert_eq!(
        matched["players"]
            .as_array()
            .expect("players must be an array")
            .len(),
        2,
        "both seeded players must be returned"
    );

    drop(webview);
    drop(app);
    cleanup(&path);
}

/// `get_analytics` for the last 7 days counts the seeded match in the summary.
#[test]
fn get_analytics_week_summary_counts_seeded_match() {
    let path = temp_db_path();
    let pool = Arc::new(init_storage(&path).expect("init storage"));
    seed_local_settings(&pool);
    let start = chrono::Utc::now();
    let _match_id = seed_match(&pool, start);

    let app = create_app(Arc::clone(&pool));
    let webview = create_webview(&app);

    let response = invoke(
        &webview,
        "get_analytics",
        serde_json::json!({
            "period": { "days": 7 },
            "scope": "me",
        }),
    )
    .expect("get_analytics must succeed");

    assert_eq!(
        response["summary"]["totalMatches"],
        serde_json::json!(1),
        "the seeded match must be counted in the 7-day summary"
    );

    drop(webview);
    drop(app);
    cleanup(&path);
}
