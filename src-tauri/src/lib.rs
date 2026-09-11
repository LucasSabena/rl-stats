use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration as StdDuration, Instant};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder,
};
#[cfg(not(debug_assertions))]
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::RwLock;
use tracing::{error, info};

pub mod commands;
pub mod core;
pub mod error;
mod updater;

use crate::core::autostart::configure_autostart;
use crate::core::ingestor::{start_ingestor, IngestorHandle};
use crate::core::models::RlEvent;
use crate::core::obs_text;
use crate::core::overlay::OverlayServer;
use crate::core::process_watcher::ProcessWatcher;
use crate::core::profiles::{
    find_matching_profile, find_profile_by_primary_id, get_active_profile, get_db_path_for_profile,
    init_profiles, update_profile_player_identity,
};
use crate::core::rlstats_api::RlstatsClient;
use crate::core::session::{
    resolve_local_player_identity, MatchPhase, PersistResult, SessionManager,
};
use crate::core::settings::{get_settings, set_settings, sync_rl_installations};
use crate::core::storage::{init_storage, DbPool};
use crate::core::tracker_api::TrackerClient;

pub struct AppState {
    pub db_pool: Arc<DbPool>,
    pub session_manager: Arc<RwLock<SessionManager>>,
    pub ingestor_status: Arc<RwLock<core::models::ConnectionStatus>>,
    pub game_running: Arc<std::sync::atomic::AtomicBool>,
    /// Running W/L tally for the current Rocket League session. Accumulates
    /// across matches and is emitted (then reset) when the game process
    /// closes, so the UI can show an end-of-session summary.
    pub session_tally: Arc<tokio::sync::Mutex<SessionTally>>,
    pub overlay_server: Arc<tokio::sync::Mutex<Option<OverlayServer>>>,
    pub overlay_handle: Arc<std::sync::Mutex<Option<tauri::WebviewWindow>>>,
    /// Hidden WebView2-backed rlstats.net scraper used by the primary MMR
    /// provider. Lazily creates its window on first lookup. `None` in tests
    /// and in builds where the scraper could not be created: the scraper is
    /// Wry-typed, so it cannot be instantiated under the mock runtime.
    pub rlstats_scraper: Option<Arc<core::mmr::webview::RlstatsScraper>>,
}

pub(crate) fn diagnostics_log_directory() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("com.lukit.rl-stats")
        .join("logs")
}

fn init_diagnostics() -> Option<tracing_appender::non_blocking::WorkerGuard> {
    let log_directory = diagnostics_log_directory();
    if let Err(error) = std::fs::create_dir_all(&log_directory) {
        eprintln!("Could not create diagnostics directory: {error}");
        return None;
    }

    let file_appender = tracing_appender::rolling::daily(log_directory, "rl-stats.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
    let subscriber = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_ansi(false)
        .with_writer(non_blocking);

    if subscriber.try_init().is_err() {
        return None;
    }

    let previous_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        let payload = panic_info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| {
                panic_info
                    .payload()
                    .downcast_ref::<String>()
                    .map(String::as_str)
            })
            .unwrap_or("non-string panic payload");
        let location = panic_info
            .location()
            .map(ToString::to_string)
            .unwrap_or_else(|| "unknown location".to_string());
        error!(payload, location, "Unhandled Rust panic");
        previous_hook(panic_info);
    }));

    Some(guard)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Check if launched with --minimized (autostart)
    let start_minimized = std::env::args().any(|arg| arg == "--minimized");

    let _diagnostics_guard = init_diagnostics();

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::live::get_live_state,
            commands::live::get_live_head_to_head,
            commands::live::get_connection_status,
            commands::mmr::fetch_live_mmr_snapshot,
            commands::mmr::set_session_mmr_snapshot,
            commands::mmr::set_local_mmr,
            commands::mmr::get_mmr_provider_health,
            commands::mmr::test_mmr_provider,
            commands::mmr::get_mmr_history,
            commands::history::get_matches,
            commands::history::get_match_detail,
            commands::history::delete_match_cmd,
            commands::history::update_match_cmd,
            commands::history::set_match_mood_cmd,
            commands::history::export_history_csv,
            commands::analytics::get_analytics,
            commands::analytics::get_analytics_comparison,
            commands::analytics::get_sessions,
            commands::analytics::get_daily_rollups,
            commands::analytics::get_session_matches,
            commands::analytics::get_insights,
            commands::analytics::get_player_analytics_summary,
            commands::analytics::get_player_analytics_matches,
            commands::analytics::get_session_curve,
            commands::analytics::get_teammate_stats,
            commands::analytics::get_custom_breakdown,
            commands::analytics::get_training_analytics,
            commands::analytics::recompute_kickoff_goals,
            commands::prompt_window::show_prompt,
            commands::prompt_window::hide_prompt,
            commands::prompt_window::get_pending_prompt,
            commands::prompt_window::get_prompt_state,
            commands::players::get_player_directory,
            commands::players::get_player_detail,
            commands::players::get_player_detail_by_primary_id,
            commands::settings::get_settings_cmd,
            commands::settings::set_settings_cmd,
            commands::settings::configure_rl_ini_cmd,
            commands::settings::configure_rl_ini_all_cmd,
            commands::settings::sync_rl_installations_cmd,
            commands::settings::export_data,
            commands::settings::export_data_json,
            commands::settings::import_data,
            commands::settings::import_data_json,
            commands::settings::get_storage_stats_cmd,
            commands::settings::clear_all_data_cmd,
            commands::presets::list_user_presets_cmd,
            commands::presets::get_user_preset_cmd,
            commands::presets::save_user_preset_cmd,
            commands::presets::delete_user_preset_cmd,
            commands::presets::export_preset_json_cmd,
            commands::presets::import_preset_json_cmd,
            commands::detect::detect_rl_path,
            commands::detect::inspect_rl_path,
            commands::detect::detect_local_accounts_cmd,
            commands::diagnostics::report_frontend_error,
            commands::diagnostics::get_diagnostics_info,
            commands::window::toggle_overlay_mode,
            commands::window::is_overlay_mode,
            commands::tracker::fetch_tracker_profile,
            commands::tracker::get_cached_profile,
            commands::tracker::refresh_tracker_profile,
            commands::rlstats::fetch_rlstats_profile,
            commands::rlstats::get_cached_rlstats_profile,
            commands::rlstats::refresh_rlstats_profile,
            commands::overlay::start_overlay_server,
            commands::overlay::stop_overlay_server,
            commands::overlay::get_overlay_server_status,
            commands::overlay::get_overlay_urls,
            commands::overlay::get_overlay_state,
            commands::overlay_window::create_overlay_window,
            commands::overlay_window::destroy_overlay_window,
            commands::overlay_window::get_overlay_window_state,
            commands::overlay_window::toggle_overlay_enabled,
            commands::overlay_window::update_overlay_position,
            commands::overlay_window::update_overlay_size,
            commands::overlay_window::update_overlay_opacity,
            commands::overlay_window::set_overlay_clickthrough,
            commands::overlay_window::notify_overlay_settings_changed,
            commands::overlay_window::set_overlay_interactive,
            commands::profiles::list_profiles_cmd,
            commands::profiles::get_active_profile_cmd,
            commands::profiles::create_profile_cmd,
            commands::profiles::delete_profile_cmd,
            commands::profiles::switch_profile_cmd,
            commands::profiles::rename_profile_cmd,
            commands::profiles::find_matching_profile_cmd,
            commands::profiles::update_profile_player_identity_cmd,
            commands::friends::add_friend_cmd,
            commands::friends::remove_friend_cmd,
            commands::friends::get_friends_cmd,
            commands::friends::is_friend_cmd,
            commands::cloud::get_cloud_config_cmd,
            commands::cloud::set_cloud_config_cmd,
            commands::cloud::get_cloud_sync_status_cmd,
            commands::cloud::get_profile_sync_status_cmd,
            commands::cloud::prepare_cloud_push_batch_cmd,
            commands::cloud::mark_cloud_push_succeeded_cmd,
            commands::cloud::mark_cloud_push_failed_cmd,
            commands::cloud::enqueue_existing_profile_history_for_sync_cmd,
        ])
        .setup(move |app| {
            #[cfg(all(desktop, not(debug_assertions)))]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    match handle.updater() {
                        Ok(updater) => match updater.check().await {
                            Ok(Some(update)) => {
                                info!(
                                    version = %update.version,
                                    "Update available: {}",
                                    update.version
                                );
                            }
                            Ok(None) => {
                                info!("App is up to date");
                            }
                            Err(e) => {
                                tracing::warn!(error = %e, "Background update check failed");
                            }
                        },
                        Err(e) => {
                            tracing::warn!(error = %e, "Failed to create updater handle");
                        }
                    }
                });
            }

            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;

            crate::core::app_sync::init_app_sync(&app_dir)?;

            let active_profile_id = init_profiles(&app_dir)?;

            // Attempt recovery from a legacy app-data directory even if profiles.json
            // already exists. This handles Tauri identifier changes.
            if let Ok(true) = crate::core::profiles::try_migrate_from_legacy(&app_dir) {
                info!("Migrated data from legacy directory");
            }

            let db_path = get_db_path_for_profile(&app_dir, &active_profile_id);

            info!(profile_id = %active_profile_id, db_path = %db_path.display(), "Initializing storage");
            let db_pool = Arc::new(init_storage(&db_path)?);

            // One-off v21 analytics repair (runs once per profile database):
            // daily rollups switch to local-time dates and kickoff goals are
            // recounted from the goal timeline. Runs in the background so a
            // large history never blocks the window.
            {
                let pool = db_pool.clone();
                tauri::async_runtime::spawn(async move {
                    // v21 repair, then a second pass that purges training rows
                    // from the daily rollups. Databases upgraded from before the
                    // training-exclusion fix carry training stints counted as
                    // "matches played", which made the analytics summary show
                    // more games than wins + losses.
                    let rollups_dirty = !crate::core::storage::get_kv_flag(
                        &pool,
                        "analytics_repair_v21",
                    );
                    // v21's backfill ran with the old classification (no
                    // GoalTime, no OT handling, false positives from the live
                    // re-anchor bug kept in matches it never touched). v25
                    // re-derives every kickoff count from stored evidence and
                    // rewrites whole matches, so run it once on top of v21.
                    let kickoff_repair_pending = !crate::core::storage::get_kv_flag(
                        &pool,
                        "analytics_repair_kickoff_v25",
                    );
                    if rollups_dirty || kickoff_repair_pending {
                        if rollups_dirty {
                            info!("Running one-off v21 analytics repair");
                        }
                        if kickoff_repair_pending {
                            info!("Running v25 kickoff-goal recount");
                        }
                        let settings =
                            crate::core::settings::get_settings(&pool).unwrap_or_default();
                        let backfill = crate::core::patterns::recompute_kickoff_goals(
                            &pool,
                            settings.kickoff_goal_threshold_seconds,
                        );
                        match backfill {
                            Ok(report) => info!(report = %report, "Kickoff backfill finished"),
                            Err(error) => {
                                tracing::warn!(error = %error, "Kickoff backfill failed");
                            }
                        }
                    }

                    let training_repair_pending = !crate::core::storage::get_kv_flag(
                        &pool,
                        "analytics_repair_training_v23",
                    );
                    if training_repair_pending {
                        // Old builds persisted a finished training stint once
                        // per following MatchCreated, minting duplicate rows
                        // with inflated durations. Drop them before the rollup
                        // rebuild below so both the training totals and the
                        // match analytics start clean.
                        if let Err(error) =
                            crate::core::storage::remove_duplicate_training_rows(&pool)
                        {
                            tracing::warn!(error = %error, "Training dedup failed");
                        }
                    }
                    if rollups_dirty || training_repair_pending || kickoff_repair_pending {
                        let settings =
                            crate::core::settings::get_settings(&pool).unwrap_or_default();
                        let names = crate::core::storage::identity_candidate_names(&settings);
                        if let Err(error) =
                            crate::core::storage::rebuild_daily_rollups_for_identity(
                                &pool,
                                settings.local_primary_id.as_deref(),
                                &names,
                            )
                        {
                            tracing::warn!(error = %error, "Rollup rebuild failed");
                        }
                    }

                    for flag in [
                        "analytics_repair_v21",
                        "analytics_repair_training_v23",
                        "analytics_repair_kickoff_v25",
                    ] {
                        if let Err(error) = crate::core::storage::set_kv_flag(&pool, flag) {
                            tracing::warn!(error = %error, flag, "Could not persist repair flag");
                        }
                    }
                });
            }

            let settings = get_settings(&db_pool).unwrap_or_default();
            let port = settings.port;

            // Auto-configure the Stats API INI for every detected install so
            // the game exports stats no matter which platform it launches from.
            {
                let pool = db_pool.clone();
                tauri::async_runtime::spawn(async move {
                    match sync_rl_installations(&pool, port) {
                        Ok(result) => {
                            info!(
                                installs = result.paths.len(),
                                failures = result.failures.len(),
                                "Stats API INI auto-configured for all installs"
                            );
                        }
                        Err(error) => {
                            tracing::warn!(error = %error, "Failed to auto-configure Stats API INIs");
                        }
                    }
                });
            }

            // Configure autostart based on current setting
            configure_autostart(settings.auto_start);

            // Start hidden if launched via autostart
            let main_window = app.get_webview_window("main");

            // Build system tray
            let show_item = MenuItem::with_id(app, "show", "Mostrar", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let tray_builder = TrayIconBuilder::new();
            let tray_builder = if let Some(icon) = app.default_window_icon() {
                tray_builder.icon(icon.clone())
            } else {
                tracing::warn!("No default tray icon is available");
                tray_builder
            };
            let tray = tray_builder
                .tooltip("RL Stats")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Intercept close event to hide instead of quitting
            if let Some(ref window) = main_window {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }

            // If launched via autostart, start minimized to tray
            if start_minimized {
                if let Some(ref window) = main_window {
                    let _ = window.hide();
                }
            }

            let watcher = ProcessWatcher::new();
            let app_handle_for_watcher = app.handle().clone();
            let game_running_flag = watcher.start(app_handle_for_watcher);

            let ingestor = start_ingestor(port, Arc::clone(&game_running_flag));
            let ingestor_status = Arc::clone(&ingestor.status);

            let session_manager = Arc::new(RwLock::new(SessionManager::new(
                settings.kickoff_goal_threshold_seconds,
            )));

            let session_mgr_clone = Arc::clone(&session_manager);
            let db_pool_clone = Arc::clone(&db_pool);
            let app_handle = app.handle().clone();
            let session_tally = Arc::new(tokio::sync::Mutex::new(SessionTally::default()));
            let session_tally_for_events = Arc::clone(&session_tally);
            tauri::async_runtime::spawn(async move {
                process_events(
                    ingestor,
                    session_mgr_clone,
                    db_pool_clone,
                    app_handle,
                    session_tally_for_events,
                )
                .await;
            });

            let db_pool_tracker = Arc::clone(&db_pool);
            let app_handle_tracker = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tracker_refresh_loop(db_pool_tracker, app_handle_tracker).await;
            });

            let session_manager_for_game_events = Arc::clone(&session_manager);
            let session_tally_for_listener = Arc::clone(&session_tally);
            app.manage(AppState {
                db_pool: db_pool.clone(),
                session_manager,
                ingestor_status,
                game_running: game_running_flag,
                session_tally,
                overlay_server: Arc::new(tokio::sync::Mutex::new(None)),
                overlay_handle: Arc::new(std::sync::Mutex::new(None)),
                rlstats_scraper: Some(core::mmr::webview::RlstatsScraper::new(
                    app.handle().clone(),
                )),
            });

            // Store tray in app state so it stays alive. We move it into a "leaked" Box to
            // keep it for the lifetime of the app without having to manage it through AppState.
            // The tray handle must not be dropped.
            app.manage(TrayHandle {
                _tray: Box::new(tray),
            });

            // Pre-create the post-match prompt window hidden: its webview loads
            // with the app instead of during the seconds after a match ends.
            // Best effort — the pull model covers a cold window if this fails.
            crate::commands::prompt_window::prewarm_prompt_window(app.handle());

            // Keeper tasks: Windows pushes a topmost WebView behind a game
            // that is itself topmost after alt-tabbing back into Rocket
            // League. Re-assert the z-order while each window is on screen so
            // the overlay/prompt do not silently fall to the background.
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let mut tick = tokio::time::interval(tokio::time::Duration::from_secs(2));
                    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
                    loop {
                        tick.tick().await;
                        let running = app_handle
                            .state::<AppState>()
                            .game_running
                            .load(std::sync::atomic::Ordering::Relaxed);
                        if running {
                            crate::commands::overlay_window::keep_overlay_on_top(&app_handle);
                        }
                    }
                });
            }
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let mut tick = tokio::time::interval(tokio::time::Duration::from_secs(1));
                    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
                    loop {
                        tick.tick().await;
                        crate::commands::prompt_window::keep_prompt_on_top(&app_handle);
                    }
                });
            }

            // Restore overlay window if it was enabled last session and game is running
            // Also setup game status listener to auto-show/hide overlay
            if settings.overlay_enabled {
                let app_handle = app.handle().clone();
                let pool = db_pool.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    let app_settings = get_settings(&pool).unwrap_or_default();

                    // Only restore overlay if game is currently running
                    let game_running = app_settings.game_running;
                    if app_settings.overlay_enabled && game_running {
                        if let Err(e) = create_overlay_window_inner(&app_handle, &app_settings).await {
                            tracing::warn!(error = %e, "Failed to restore overlay window on startup");
                        }
                    }
                });
            }

            // Setup game status change listener to auto-show/hide overlay
            {
                let app_handle = app.handle().clone();
                let pool = db_pool.clone();
                let session_manager = Arc::clone(&session_manager_for_game_events);
                tauri::async_runtime::spawn(async move {
                    let app_handle_for_listener = app_handle.clone();
                    let pool_for_closure = pool.clone();
                    let session_manager_for_closure = Arc::clone(&session_manager);
                    let session_tally_for_closure = Arc::clone(&session_tally_for_listener);

                    let _receiver = app_handle_for_listener.listen("game-status-changed", move |event| {
                        let payload: serde_json::Value = serde_json::from_str(event.payload()).unwrap_or_default();
                        let game_running = payload.get("running").and_then(|v| v.as_bool()).unwrap_or(false);
                        let active_platform = payload
                            .get("platform")
                            .and_then(|v| v.as_str())
                            .map(str::to_string);
                        let pool = pool_for_closure.clone();
                        let app_handle = app_handle.clone();
                        let session_manager = Arc::clone(&session_manager_for_closure);
                        let session_tally = Arc::clone(&session_tally_for_closure);

                        tauri::async_runtime::spawn(async move {
                            // Update game_running + active_platform in settings
                            if let Ok(mut app_settings) = get_settings(&pool) {
                                app_settings.game_running = game_running;
                                app_settings.active_platform = active_platform.clone();
                                let _ = set_settings(&pool, &app_settings);
                            }

                            if !game_running {
                                // Game closed: a live training stint ends here,
                                // and its last-activity timestamp is the best
                                // available end. Also dismiss any pending prompt.
                                finalize_active_training(&session_manager, &pool, &app_handle).await;
                                let _ = crate::commands::prompt_window::hide_prompt_window(
                                    &app_handle,
                                );

                                // End-of-session summary: emit the running
                                // tally once per Rocket League run and reset it
                                // so the next run starts from zero.
                                let mut tally = session_tally.lock().await;
                                if tally.matches > 0 {
                                    let payload = serde_json::json!({
                                        "matches": tally.matches,
                                        "wins": tally.wins,
                                        "losses": tally.losses,
                                        "streak": tally.streak,
                                        "goalsFor": tally.goals_for,
                                        "goalsAgainst": tally.goals_against,
                                        "durationSeconds": tally.duration_seconds,
                                        "startedAt": tally.started_at.map(|d| d.to_rfc3339()),
                                        "bestHour": tally.best_hour(),
                                    });
                                    let _ = app_handle.emit("session-summary", payload);
                                    tally.reset();
                                }
                            }

                            if let Ok(app_settings) = get_settings(&pool) {
                                if !app_settings.overlay_enabled {
                                    return;
                                }

                                let overlay_win = app_handle.get_webview_window("overlay");

                                if game_running {
                                    // Game started (or relaunched from another
                                    // launcher, Steam <-> Epic): show overlay if
                                    // enabled. Re-assert always-on-top without
                                    // stealing focus — `show()` alone leaves the
                                    // window behind exclusive fullscreen.
                                    if overlay_win.is_none() {
                                        if let Err(e) = create_overlay_window_inner(&app_handle, &app_settings).await {
                                            tracing::warn!(error = %e, "Failed to create overlay window when game started");
                                        }
                                    } else if let Some(ref win) = overlay_win {
                                        crate::commands::overlay_window::bring_overlay_to_front(win);
                                    }
                                } else {
                                    // Game closed: hide overlay
                                    if let Some(ref win) = overlay_win {
                                        let _ = win.hide();
                                    }
                                }
                            }
                        });
                    });

                    // Keep task alive
                    loop {
                        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(error) = result {
        error!(error = %error, "Tauri application exited with an error");
    }
}

/// Wrapper to keep the tray icon alive for the app lifetime.
pub struct TrayHandle {
    _tray: Box<tauri::tray::TrayIcon>,
}

/// Win/loss counters for the current session. Bundled so the persist helper
/// and the event loop share one mutable record.
#[derive(Default, Clone)]
pub struct SessionTally {
    wins: i32,
    losses: i32,
    streak: i32,
    last_was_win: Option<bool>,
    matches: i32,
    goals_for: i32,
    goals_against: i32,
    duration_seconds: i64,
    started_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Match starts per local hour of day, for the end-of-session summary's
    /// "best hour" line.
    hours: [u32; 24],
}

impl SessionTally {
    /// Fold one persisted non-training match into the running session tally.
    fn add_match(
        &mut self,
        summary: &crate::core::models::SessionSummary,
        started_at: Option<chrono::DateTime<chrono::Utc>>,
    ) {
        self.matches += 1;
        self.duration_seconds += i64::from(summary.duration_seconds.max(0));
        if let Some(team) = summary.local_team_num {
            let (for_goals, against_goals) = if team == 0 {
                (summary.score_blue, summary.score_orange)
            } else {
                (summary.score_orange, summary.score_blue)
            };
            self.goals_for += for_goals;
            self.goals_against += against_goals;
        }
        if let Some(start) = started_at {
            let hour = start
                .with_timezone(&chrono::Local)
                .format("%H")
                .to_string()
                .parse::<usize>()
                .unwrap_or(0)
                .min(23);
            self.hours[hour] += 1;
        }
    }

    /// Local hour with the most matches in this session, if any.
    fn best_hour(&self) -> Option<u32> {
        self.hours
            .iter()
            .enumerate()
            .max_by_key(|(_, count)| **count)
            .filter(|(_, count)| **count > 0)
            .map(|(hour, _)| hour as u32)
    }

    fn reset(&mut self) {
        *self = Self::default();
    }
}

/// Persist a finished session: write the match, update the tally, emit
/// `match-summary`/`match-finished` (showing the focus prompt when enabled)
/// and sync the detected identity. Shared by the normal delayed path and the
/// interrupted path (a new match arriving before the grace window elapsed).
async fn persist_finished_session(
    session: &mut SessionManager,
    db_pool: &Arc<DbPool>,
    app_handle: &tauri::AppHandle,
    tally: &mut SessionTally,
) {
    // Read before persisting: `persist_finished_match` consumes the session
    // (resets it), so the start time is gone afterwards.
    let session_started_at = session.started_at();
    match session.persist_finished_match(db_pool) {
        Ok(result) => {
            let PersistResult {
                match_id,
                is_training,
                skipped_training,
                summary,
                detected_primary_id,
                detected_player_name,
            } = result;

            // Training tracking disabled: nothing was written, just close the
            // session quietly without firing match-summary/match-finished.
            if skipped_training {
                session.handle_event(RlEvent::MatchDestroyed);
                let final_state = session.live_state();
                let _ = app_handle.emit("live-update", final_state);
                return;
            }
            info!(guid = %summary.match_guid, "Match persisted");

            if !is_training {
                tally.add_match(&summary, session_started_at);
                if tally.started_at.is_none() {
                    // The summary carries duration, not start time; the first
                    // persisted match anchors the session window.
                    tally.started_at = session_started_at.or_else(|| {
                        Some(
                            chrono::Utc::now()
                                - chrono::Duration::seconds(i64::from(
                                    summary.duration_seconds.max(0),
                                )),
                        )
                    });
                }
            }

            if let Some(winner) = summary.winner {
                let settings = get_settings(db_pool).unwrap_or_default();
                let local_team = settings.local_primary_id.as_ref().and_then(|pid| {
                    summary
                        .players
                        .iter()
                        .find(|p| &p.primary_id == pid)
                        .map(|p| p.team_num)
                });
                let is_win = local_team == Some(winner);
                if is_win {
                    tally.wins += 1;
                } else {
                    tally.losses += 1;
                }
                tally.streak = match tally.last_was_win {
                    Some(true) if is_win => tally.streak + 1,
                    Some(false) if !is_win => tally.streak - 1,
                    _ => {
                        if is_win {
                            1
                        } else {
                            -1
                        }
                    }
                };
                tally.last_was_win = Some(is_win);
                obs_text::update_obs_files_win(is_win, tally.wins, tally.losses, tally.streak);
            }

            let _ = app_handle.emit("match-summary", &summary);
            // Post-match mood prompt: the frontend opens the mood
            // modal on this event (skipped for training matches).
            //
            // When the focus prompt is enabled, show the generic
            // prompt window on top of the game instead: the
            // desktop modal stands down (see `promptShown`).
            let prompt_settings = get_settings(db_pool).unwrap_or_default();
            let prompt_shown = !is_training
                && prompt_settings.prompt_focus_enabled
                && (!prompt_settings.prompt_only_when_game_running || prompt_settings.game_running)
                && crate::commands::prompt_window::show_prompt_window(
                    app_handle,
                    crate::commands::prompt_window::PromptPayload {
                        kind: "mood".to_string(),
                        match_id,
                    },
                    u64::from(prompt_settings.prompt_timeout_secs),
                )
                .is_ok();
            let _ = app_handle.emit(
                "match-finished",
                serde_json::json!({
                    "matchId": match_id,
                    "guid": summary.match_guid,
                    "isTraining": is_training,
                    "winner": summary.winner,
                    "scoreBlue": summary.score_blue,
                    "scoreOrange": summary.score_orange,
                    "promptShown": prompt_shown,
                }),
            );
            session.handle_event(RlEvent::MatchDestroyed);
            let final_state = session.live_state();
            let _ = app_handle.emit("live-update", final_state);

            // Sync detected identity to the active profile only when it does not
            // clearly belong to another configured profile. This prevents a match
            // played on the wrong app profile from silently reassigning identities.
            if let (Some(pid), Some(pname)) = (detected_primary_id, detected_player_name) {
                if !pid.is_empty() {
                    let app_dir = app_handle.path().app_data_dir().unwrap_or_default();
                    if let Ok(active_profile) = get_active_profile(&app_dir) {
                        let belongs_to_other_profile = find_profile_by_primary_id(&app_dir, &pid)
                            .ok()
                            .flatten()
                            .map(|profile| profile.id != active_profile.id)
                            .unwrap_or(false);

                        if !belongs_to_other_profile {
                            let _ = update_profile_player_identity(
                                &app_dir,
                                &active_profile.id,
                                &pid,
                                &pname,
                            );
                        }
                    }
                }
            }
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to persist match");
        }
    }
}

/// Persist an in-progress training stint when external evidence says it is
/// over (the game process closed). Free Play never emits MatchEnded, and
/// waiting for the idle sweeper would lose the tail of the session.
async fn finalize_active_training(
    session_manager: &Arc<RwLock<SessionManager>>,
    db_pool: &Arc<DbPool>,
    app_handle: &tauri::AppHandle,
) {
    let mut session = session_manager.write().await;
    if session.check_training_superseded_finalize() {
        let mut tally = SessionTally::default();
        persist_finished_session(&mut session, db_pool, app_handle, &mut tally).await;
    }
}

/// Background task that consumes events from the ingestor and drives the session manager.
/// Emits Tauri `live-update` events when game state changes so the frontend can react in real time.
async fn process_events(
    mut ingestor: IngestorHandle,
    session_manager: Arc<RwLock<SessionManager>>,
    db_pool: Arc<DbPool>,
    app_handle: tauri::AppHandle,
    session_tally: Arc<tokio::sync::Mutex<SessionTally>>,
) {
    info!("Event processing task started");

    // Set once per session when the roster first proves a real match (more
    // than one player). Free Play entries never set it, so a post-match prompt
    // survives a hop into training and only yields when an actual game starts.
    let mut real_match_started = false;

    struct MismatchState {
        alerted: bool,
        last_detected_id: Option<String>,
    }

    let mut mismatch_state = MismatchState {
        alerted: false,
        last_detected_id: None,
    };
    let mut last_live_publish = Instant::now() - StdDuration::from_secs(1);
    let mut last_identity_check = Instant::now() - StdDuration::from_secs(5);

    // Free Play stints end with silence, not with a game event, so the loop
    // multiplexes the event channel with a periodic tick: without the tick a
    // fully quiet training stint would never wake this task to persist itself.
    const IDLE_TICK_SECS: u64 = 5;
    let mut idle_tick = tokio::time::interval(tokio::time::Duration::from_secs(IDLE_TICK_SECS));
    idle_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        let event = tokio::select! {
            event = ingestor.event_rx.recv() => event,
            _ = idle_tick.tick() => {
                let mut session = session_manager.write().await;
                let was_finished = session.phase() == &MatchPhase::Finished;
                if was_finished {
                    continue;
                }
                if session.check_training_idle_finalize() {
                    drop(session);
                    let mut session = session_manager.write().await;
                    if session.phase() == &MatchPhase::Finished {
                        let mut tally = session_tally.lock().await;
                        persist_finished_session(
                            &mut session,
                            &db_pool,
                            &app_handle,
                            &mut tally,
                        )
                        .await;
                    }
                }
                continue;
            }
            else => break,
        };
        let Some(event) = event else {
            break;
        };
        let mut session = session_manager.write().await;
        let was_finished = session.phase() == &MatchPhase::Finished;

        match &event {
            RlEvent::MatchCreated | RlEvent::MatchInitialized => {
                // A match that finished inside the grace window (the player
                // hopped into training or queued the next match in <2s) was
                // never persisted — and reset() below would wipe it forever,
                // losing the match, its summary event and its mood prompt.
                // Persist it first. The persist consumes the session, so the
                // new MatchCreated starts from a clean slate.
                let interrupted = session.phase() == &MatchPhase::Finished;
                if interrupted {
                    let mut tally = session_tally.lock().await;
                    persist_finished_session(&mut session, &db_pool, &app_handle, &mut tally).await;
                } else if session.is_training_session()
                    && session.check_training_superseded_finalize()
                {
                    // The player left training and queued straight into a
                    // match: the training stint is over even though Free Play
                    // never emits MatchEnded. Finalize + persist before
                    // reset() erases it.
                    let mut tally = session_tally.lock().await;
                    persist_finished_session(&mut session, &db_pool, &app_handle, &mut tally).await;
                }
                real_match_started = false;
                // NOTE: the tally is deliberately NOT reset per match. It is
                // the running Rocket League session record (OBS overlay +
                // end-of-session summary) and resets when the game closes.
                mismatch_state.alerted = false;
                mismatch_state.last_detected_id = None;
                last_live_publish = Instant::now() - StdDuration::from_secs(1);
                last_identity_check = Instant::now() - StdDuration::from_secs(5);
                obs_text::update_obs_files(0, 0, "");
                // No `match-started` / prompt hide here: a MatchCreated also
                // fires for Free Play. The real signal is the roster reaching
                // two players, handled on UpdateState below.
            }
            _ => {}
        }

        session.handle_event(event.clone());

        {
            let overlay = app_handle.state::<AppState>().overlay_server.clone();
            broadcast_to_overlay(&overlay, &event);
        }

        if let Some(live_event) = map_live_event(&event) {
            let _ = app_handle.emit("live-event", live_event);
        }

        // Only emit live-update for UpdateState events to avoid flickering
        // from high-frequency non-state events (goals, statfeed, etc.)
        if matches!(&event, RlEvent::UpdateState { .. }) {
            // The roster reaching two players is the first moment a session is
            // provably a real match. It is the point where the previous match's
            // rating prompt must yield: a Free Play hop (one player) leaves the
            // prompt open so the player still has time to answer.
            if !real_match_started && session.is_real_match() {
                real_match_started = true;
                let _ = crate::commands::prompt_window::hide_prompt_window(&app_handle);
                let _ = app_handle.emit(
                    "match-started",
                    serde_json::json!({
                        "timestamp": chrono::Utc::now().to_rfc3339()
                    }),
                );
            }

            // Rocket League can publish up to 120 snapshots per second. The session still
            // processes every packet, but UI/IPC work is capped at 20 FPS to avoid saturating
            // WebView2 and the main thread while the game is under load.
            if last_live_publish.elapsed() >= StdDuration::from_millis(50) {
                last_live_publish = Instant::now();
                let live_data = session.live_state();
                let _ = app_handle.emit("live-update", &live_data);

                let overlay = app_handle.state::<AppState>().overlay_server.clone();
                if let Ok(guard) = overlay.try_lock() {
                    if let Some(ref server) = *guard {
                        server.broadcast_state(&live_data);
                    }
                };
            }

            // Account mismatch detection
            if !mismatch_state.alerted && last_identity_check.elapsed() >= StdDuration::from_secs(2)
            {
                last_identity_check = Instant::now();
                let settings = get_settings(&db_pool).unwrap_or_default();
                let local_identity =
                    resolve_local_player_identity(session.players().values(), &settings);

                if let Some((detected_pid, _detected_team)) = &local_identity {
                    let current_profile_pid = settings.local_primary_id.as_deref();
                    let is_mismatch = match current_profile_pid {
                        Some(current_pid) => current_pid != detected_pid.as_str(),
                        None => true,
                    };

                    if is_mismatch && settings.warn_on_profile_mismatch {
                        let detected_player_name = session
                            .players()
                            .iter()
                            .find(|(id, _)| *id == detected_pid)
                            .map(|(_, player)| player.name.clone())
                            .unwrap_or_default();

                        let app_dir = app_handle.path().app_data_dir().unwrap_or_default();
                        let active_profile = get_active_profile(&app_dir).ok();
                        let mut payload = serde_json::json!({
                            "detected_primary_id": detected_pid,
                            "detected_player_name": detected_player_name,
                            "current_profile_id": active_profile.as_ref().map(|p| p.id.clone()).unwrap_or_default(),
                            "current_profile_name": active_profile.as_ref().map(|p| p.name.clone()).unwrap_or_else(|| settings.player_name.clone()),
                            "auto_switch_enabled": settings.auto_switch_profile_on_exact_match,
                            "matched_profile_is_exact_primary_id": false,
                        });

                        if let Ok(Some(profile)) =
                            find_profile_by_primary_id(&app_dir, detected_pid)
                        {
                            payload["matched_profile_id"] = serde_json::json!(profile.id);
                            payload["matched_profile_name"] = serde_json::json!(profile.name);
                            payload["matched_profile_is_exact_primary_id"] =
                                serde_json::json!(true);
                        } else if let Ok(Some(profile)) =
                            find_matching_profile(&app_dir, detected_pid, &detected_player_name)
                        {
                            payload["matched_profile_id"] = serde_json::json!(profile.id);
                            payload["matched_profile_name"] = serde_json::json!(profile.name);
                        }

                        let _ = app_handle.emit("account-mismatch", payload);
                    }
                    // Once the local identity is known, there is no reason to query SQLite and
                    // profiles again for every subsequent snapshot in this match.
                    mismatch_state.alerted = true;
                    mismatch_state.last_detected_id = Some(detected_pid.clone());
                }
            }
        }

        let is_finished = session.phase() == &MatchPhase::Finished;
        if !was_finished && is_finished {
            drop(session);
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

            let mut session = session_manager.write().await;
            if session.phase() == &MatchPhase::Finished {
                let mut tally = session_tally.lock().await;
                persist_finished_session(&mut session, &db_pool, &app_handle, &mut tally).await;
            }
        }
    }

    info!("Event processing task ended");
}

fn map_live_event(event: &RlEvent) -> Option<serde_json::Value> {
    let event_type = match event {
        RlEvent::MatchCreated | RlEvent::MatchInitialized => "MatchCreated",
        RlEvent::GoalScored { .. } => "GoalScored",
        RlEvent::StatfeedEvent { .. } => "StatfeedEvent",
        RlEvent::MatchEnded { .. } => "MatchEnded",
        RlEvent::BallHit => "BallHit",
        RlEvent::CountdownBegin => "CountdownBegin",
        RlEvent::MatchPaused => "MatchPaused",
        RlEvent::MatchUnpaused => "MatchUnpaused",
        RlEvent::GoalReplayStart => "GoalReplayStart",
        RlEvent::GoalReplayEnd => "GoalReplayEnd",
        RlEvent::ClockUpdatedSeconds { .. } => "ClockUpdatedSeconds",
        RlEvent::RoundStarted => "RoundStarted",
        _ => return None,
    };

    Some(serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "type": event_type,
        "timestamp": chrono::Utc::now().timestamp(),
        "data": {}
    }))
}

fn broadcast_to_overlay(
    overlay: &std::sync::Arc<tokio::sync::Mutex<Option<OverlayServer>>>,
    event: &RlEvent,
) {
    if let Ok(guard) = overlay.try_lock() {
        if let Some(ref server) = *guard {
            match event {
                RlEvent::GoalScored { data } => {
                    server.broadcast_goal(&data.scorer.name, data.scorer.team_num);
                }
                RlEvent::StatfeedEvent { data } => {
                    server.broadcast_statfeed(
                        &data.event_name,
                        &data.main_target.name,
                        data.main_target.team_num,
                        data.secondary_target.as_ref().map(|t| t.name.as_str()),
                        data.secondary_target.as_ref().map(|t| t.team_num),
                    );
                }
                RlEvent::BallHit => {
                    server.broadcast_ball_hit(-1);
                }
                RlEvent::ClockUpdatedSeconds { time } => {
                    server.broadcast_clock(*time);
                }
                RlEvent::MatchCreated | RlEvent::MatchInitialized => {
                    server.broadcast_match_started();
                }
                RlEvent::MatchEnded { winner_team_num } => {
                    server.broadcast_match_ended(*winner_team_num);
                }
                RlEvent::GoalReplayStart => {
                    server.broadcast_replay_start();
                }
                RlEvent::GoalReplayEnd => {
                    server.broadcast_replay_end();
                }
                RlEvent::MatchPaused => {
                    server.broadcast_match_paused();
                }
                RlEvent::MatchUnpaused => {
                    server.broadcast_match_unpaused();
                }
                _ => {}
            }
        }
    }
}

async fn tracker_refresh_loop(db_pool: Arc<DbPool>, app_handle: tauri::AppHandle) {
    tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

    loop {
        let settings = match get_settings(&db_pool) {
            Ok(s) => s,
            Err(e) => {
                tracing::error!(error = %e, "Failed to read settings for tracker refresh");
                tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                continue;
            }
        };

        if !settings.tracker_auto_refresh {
            tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
            continue;
        }

        let platform = match settings.tracker_platform.clone() {
            Some(p) => p,
            None => {
                tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
                continue;
            }
        };

        let username = match settings.tracker_username.clone() {
            Some(u) => u,
            None => {
                tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
                continue;
            }
        };

        let api_key = settings.tracker_api_key.clone();
        let interval_secs = (settings.tracker_refresh_interval_min.max(1) as u64) * 60;

        let fetch_result = if api_key.is_some() {
            let client = match TrackerClient::new(api_key) {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!(error = %e, "Failed to create TrackerClient for auto-refresh");
                    tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                    continue;
                }
            };
            client.fetch_profile(&platform, &username).await
        } else {
            Err(crate::error::AppError::ConfigError(
                "No Tracker API key configured, using RLStats directly.".into(),
            ))
        };

        match fetch_result {
            Ok(profile) => {
                if let Ok(profile_json) = serde_json::to_string(&profile) {
                    if let Err(e) = crate::core::storage::upsert_tracker_cache(
                        &db_pool,
                        &platform,
                        &username,
                        &profile_json,
                    ) {
                        tracing::error!(error = %e, "Failed to cache tracker profile");
                    } else {
                        let _ = app_handle.emit("tracker-profile-updated", &profile);
                    }
                }
            }
            Err(tracker_err) => {
                tracing::warn!(error = %tracker_err, "Auto-refresh tracker profile failed, trying RLStats");

                let rlstats_platform = match platform.to_lowercase().as_str() {
                    "steam" => "Steam",
                    "epic" => "Epic",
                    "xbl" => "Xbox",
                    "psn" => "PS4",
                    _ => {
                        tokio::time::sleep(tokio::time::Duration::from_secs(interval_secs)).await;
                        continue;
                    }
                };

                match RlstatsClient::new() {
                    Ok(rl_client) => {
                        match rl_client
                            .fetch_profile_html(rlstats_platform, &username)
                            .await
                        {
                            Ok(html) => {
                                match crate::core::rlstats_api::parse_profile_html(
                                    &html, &platform, &username,
                                ) {
                                    Ok(profile) => {
                                        if let Ok(profile_json) = serde_json::to_string(&profile) {
                                            if let Err(e) =
                                                crate::core::storage::upsert_rlstats_cache(
                                                    &db_pool,
                                                    &platform,
                                                    &username,
                                                    &profile_json,
                                                )
                                            {
                                                tracing::error!(error = %e, "Failed to cache rlstats profile");
                                            } else {
                                                let _ = app_handle
                                                    .emit("tracker-profile-updated", &profile);
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        tracing::error!(error = %e, "Failed to parse RLStats profile")
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::error!(error = %e, "Failed to fetch RLStats profile")
                            }
                        }
                    }
                    Err(e) => tracing::error!(error = %e, "Failed to create RLStats client"),
                }
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(interval_secs)).await;
    }
}

/// Internal helper to create the overlay window without going through the command system.
/// Used during startup restoration.
async fn create_overlay_window_inner(
    app: &tauri::AppHandle,
    settings: &crate::core::settings::AppSettings,
) -> Result<(), String> {
    let url = WebviewUrl::App("index.html".into());

    #[cfg(target_os = "windows")]
    let builder = WebviewWindowBuilder::new(app, "overlay", url)
        .title("RL Overlay")
        .inner_size(
            settings.overlay_width as f64,
            settings.overlay_height as f64,
        )
        .position(
            settings.overlay_position_x as f64,
            settings.overlay_position_y as f64,
        )
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .shadow(false)
        .visible_on_all_workspaces(true);

    #[cfg(not(target_os = "windows"))]
    let builder = WebviewWindowBuilder::new(app, "overlay", url)
        .title("RL Overlay")
        .inner_size(
            settings.overlay_width as f64,
            settings.overlay_height as f64,
        )
        .position(
            settings.overlay_position_x as f64,
            settings.overlay_position_y as f64,
        )
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .shadow(false)
        .visible_on_all_workspaces(true);

    let win = builder
        .build()
        .map_err(|e| format!("Failed to create overlay window: {}", e))?;

    win.set_ignore_cursor_events(settings.overlay_clickthrough)
        .map_err(|e| e.to_string())?;

    let _ = win.emit(
        "overlay-settings-updated",
        serde_json::json!({
            "showScore": settings.overlay_show_score,
            "showPlayers": settings.overlay_show_players,
            "showStats": settings.overlay_show_stats,
            "showTimer": settings.overlay_show_timer,
            "fontScale": settings.overlay_font_scale,
            "opacity": settings.overlay_opacity,
            "playerScope": settings.overlay_player_scope,
            "showNames": settings.overlay_show_names,
            "showPlayerScore": settings.overlay_show_player_score,
            "showBoost": settings.overlay_show_boost,
            "showMmr": settings.overlay_show_mmr,
        }),
    );
    let _ = win.emit("overlay-opacity-changed", settings.overlay_opacity);
    let _ = win.emit(
        "overlay-clickthrough-changed",
        settings.overlay_clickthrough,
    );

    // Re-assert TOPMOST without stealing focus (see overlay_window.rs).
    let _ = win.show();
    let _ = win.set_always_on_top(true);

    Ok(())
}
