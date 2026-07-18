use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsInfo {
    log_directory: String,
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
    }
}
