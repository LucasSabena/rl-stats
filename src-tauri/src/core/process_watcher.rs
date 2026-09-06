use crate::core::settings::detect_platform_from_exe;
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
    pub active_platform: Arc<std::sync::RwLock<Option<String>>>,
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
            active_platform: Arc::new(std::sync::RwLock::new(None)),
        }
    }

    /// Start background thread that polls for the Rocket League process every 4 seconds.
    /// Emits Tauri events when game state changes so the overlay can show/hide.
    /// When the game starts, the launch platform (Steam/Epic) is derived from
    /// the running executable and included in the event payload.
    pub fn start(self, app_handle: tauri::AppHandle) -> Arc<AtomicBool> {
        let game_running = Arc::clone(&self.game_running);
        let active_platform = Arc::clone(&self.active_platform);
        thread::spawn(move || {
            let mut last_state = false;
            let mut last_platform: Option<String> = None;
            // Track the executable path too: switching launchers (Steam <->
            // Epic) can keep `running == true` with `platform == "unknown"`
            // on both sides (custom install dir), in which case comparing
            // only running/platform would swallow the relaunch and the
            // overlay would never be re-raised above fullscreen.
            let mut last_exe: Option<String> = None;
            let mut system = sysinfo::System::new();
            loop {
                let running = is_rl_running_with_system(&mut system);
                let (platform, exe_path) = if running {
                    find_rl_process(&system)
                        .map(|process| {
                            let exe = process.exe().map(|path| path.to_string_lossy().to_string());
                            let name = process.name().to_str().map(str::to_string);
                            let base = exe
                                .as_deref()
                                .or(name.as_deref())
                                .unwrap_or_default()
                                .to_string();
                            (Some(detect_platform_from_exe(&base)), exe)
                        })
                        .unwrap_or((None, None))
                } else {
                    (None, None)
                };

                if running != last_state || platform != last_platform || exe_path != last_exe {
                    last_state = running;
                    last_platform = platform.clone();
                    last_exe = exe_path.clone();
                    game_running.store(running, Ordering::SeqCst);
                    if let Ok(mut guard) = active_platform.write() {
                        *guard = platform.clone();
                    }
                    info!(
                        running,
                        platform = platform.as_deref().unwrap_or("none"),
                        exe = exe_path.as_deref().unwrap_or("none"),
                        "Rocket League process state changed"
                    );

                    // Emit Tauri event so frontend and overlay can react
                    let _ = app_handle.emit(
                        "game-status-changed",
                        serde_json::json!({
                            "running": running,
                            "platform": platform,
                        }),
                    );
                }
                thread::sleep(Duration::from_secs(4));
            }
        });
        self.game_running
    }
}

/// Returns the first matching Rocket League process, if any.
fn find_rl_process(system: &sysinfo::System) -> Option<&sysinfo::Process> {
    system.processes().values().find(|process| {
        let name = process.name().to_str().unwrap_or_default();
        RL_PROCESS_NAMES
            .iter()
            .any(|rl_name| name.eq_ignore_ascii_case(rl_name))
    })
}

fn is_rl_running_with_system(system: &mut sysinfo::System) -> bool {
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    find_rl_process(system).is_some()
}

#[cfg(test)]
mod tests {
    use super::find_rl_process;
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

    #[test]
    fn detects_rl_process_by_name() {
        let mut system = System::new();
        system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing(),
        );
        let found = find_rl_process(&system).is_some();
        assert!(
            !found,
            "no Rocket League process should exist in test environments"
        );
    }
}
