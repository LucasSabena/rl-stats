#[cfg(target_os = "windows")]
use tracing::{info, warn};
#[cfg(target_os = "windows")]
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

#[cfg(target_os = "windows")]
const AUTOSTART_REG_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
#[cfg(target_os = "windows")]
const APP_NAME: &str = "RLStats";

#[cfg(target_os = "windows")]
fn get_current_exe_path() -> Option<String> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.to_str().map(|s| format!("\"{}\" --minimized", s)))
}

#[cfg(target_os = "windows")]
pub fn enable_autostart() {
    let exe_path = match get_current_exe_path() {
        Some(p) => p,
        None => {
            warn!("Failed to get current exe path for autostart");
            return;
        }
    };

    match RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(AUTOSTART_REG_PATH, winreg::enums::KEY_WRITE)
    {
        Ok(run_key) => match run_key.set_value(APP_NAME, &exe_path) {
            Ok(()) => info!(path = %exe_path, "Autostart enabled"),
            Err(e) => warn!(error = %e, "Failed to set autostart registry value"),
        },
        Err(e) => warn!(error = %e, "Failed to open Run registry key"),
    }
}

#[cfg(target_os = "windows")]
pub fn disable_autostart() {
    match RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(AUTOSTART_REG_PATH, winreg::enums::KEY_WRITE)
    {
        Ok(run_key) => {
            match run_key.delete_value(APP_NAME) {
                Ok(()) => info!("Autostart disabled"),
                Err(e) => {
                    // If value doesn't exist, that's fine
                    if e.kind() != std::io::ErrorKind::NotFound {
                        warn!(error = %e, "Failed to remove autostart registry value");
                    }
                }
            }
        }
        Err(e) => warn!(error = %e, "Failed to open Run registry key"),
    }
}

#[cfg(target_os = "windows")]
pub fn configure_autostart(enabled: bool) {
    if enabled {
        enable_autostart();
    } else {
        disable_autostart();
    }
}

#[cfg(not(target_os = "windows"))]
pub fn enable_autostart() {}

#[cfg(not(target_os = "windows"))]
pub fn disable_autostart() {}

#[cfg(not(target_os = "windows"))]
pub fn configure_autostart(_enabled: bool) {}
