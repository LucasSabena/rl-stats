use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate};
use tauri::Emitter;
use tracing::info;

const RL_PROCESS_NAMES: &[&str] = &["RocketLeague.exe", "RocketLeague-Win64-Shipping.exe"];

pub struct ProcessWatcher {
    pub game_running: Arc<AtomicBool>,
}

impl Default for ProcessWatcher {
    fn default() -> Self {
        Self::new()
    }
}

impl ProcessWatcher {
    pub fn new() -> Self {
        ProcessWatcher {
            game_running: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Start background thread that polls for the Rocket League process every 4 seconds.
    /// Emits Tauri events when game state changes so the overlay can show/hide.
    pub fn start(self, app_handle: tauri::AppHandle) -> Arc<AtomicBool> {
        let game_running = Arc::clone(&self.game_running);
        thread::spawn(move || {
            let mut last_state = false;
            let mut system = sysinfo::System::new();
            loop {
                let running = is_rl_running_with_system(&mut system);
                if running != last_state {
                    last_state = running;
                    game_running.store(running, Ordering::SeqCst);
                    info!(running, "Rocket League process state changed");

                    // Emit Tauri event so frontend and overlay can react
                    let _ = app_handle.emit(
                        "game-status-changed",
                        serde_json::json!({
                            "running": running
                        }),
                    );
                }
                thread::sleep(Duration::from_secs(4));
            }
        });
        self.game_running
    }
}

fn is_rl_running_with_system(system: &mut sysinfo::System) -> bool {
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    for process in system.processes().values() {
        let name = process.name().to_str().unwrap_or_default();
        for rl_name in RL_PROCESS_NAMES {
            if name.eq_ignore_ascii_case(rl_name) {
                return true;
            }
        }
    }
    false
}
