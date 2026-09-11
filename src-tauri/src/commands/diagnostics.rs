use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsInfo {
    log_directory: String,
    app_version: String,
    os: String,
    arch: String,
}

#[tauri::command]
pub fn report_frontend_error(message: String, stack: Option<String>) {
    tracing::error!(message = %message, stack = stack.as_deref().unwrap_or("unavailable"), "Frontend error boundary captured an error");
}

#[tauri::command]
pub fn get_diagnostics_info() -> DiagnosticsInfo {
    DiagnosticsInfo {
        log_directory: crate::diagnostics_log_directory()
            .to_string_lossy()
            .into_owned(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

/// Returns the tail of the most recent log files (up to `max_bytes`).
///
/// The frontend copies or downloads this for bug reports; without it the logs
/// were only reachable by knowing the app-data path.
#[tauri::command]
pub fn get_recent_logs(max_bytes: Option<usize>) -> Result<String, String> {
    let budget = max_bytes.unwrap_or(200_000).min(2_000_000);
    let directory = crate::diagnostics_log_directory();
    let entries = match std::fs::read_dir(&directory) {
        Ok(entries) => entries,
        Err(_) => return Ok(String::new()),
    };

    let mut files: Vec<std::path::PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .collect();
    // Newest first (daily rolling files sort by name).
    files.sort();
    files.reverse();

    let mut output = String::new();
    for path in files {
        if output.len() >= budget {
            break;
        }
        if let Ok(content) = std::fs::read_to_string(&path) {
            let header = format!("===== {} =====\n", path.display());
            let remaining = budget.saturating_sub(output.len());
            let mut section = String::with_capacity(header.len() + content.len());
            section.push_str(&header);
            section.push_str(&content);
            if section.len() > remaining {
                // Keep the tail of the file: the newest lines matter most.
                let start = section.len() - remaining;
                let start = section
                    .char_indices()
                    .map(|(index, _)| index)
                    .find(|index| *index >= start)
                    .unwrap_or(section.len());
                section = section[start..].to_string();
            }
            output.push_str(&section);
            output.push('\n');
        }
    }

    Ok(output)
}

/// Opens the log folder in the OS file manager.
#[tauri::command]
pub fn open_log_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let directory = crate::diagnostics_log_directory();
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(directory.to_string_lossy().into_owned(), None::<String>)
        .map_err(|e| e.to_string())
}
