use crate::core::settings::{
    detect_local_accounts, get_rl_installation_paths, inspect_rl_installation, DetectedAccount,
    RlInstallation,
};

#[tauri::command]
pub async fn detect_rl_path(platform: Option<String>) -> Result<Vec<RlInstallation>, String> {
    let installations = get_rl_installation_paths(platform.as_deref());
    Ok(installations)
}

#[tauri::command]
pub async fn inspect_rl_path(
    path: String,
    platform: Option<String>,
) -> Result<RlInstallation, String> {
    inspect_rl_installation(&path, platform.as_deref()).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn detect_local_accounts_cmd() -> Result<Vec<DetectedAccount>, String> {
    Ok(detect_local_accounts())
}
