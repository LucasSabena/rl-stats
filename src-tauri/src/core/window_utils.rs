//! Z-order helpers shared by the overlay and prompt windows.

use tauri::{Manager, WebviewWindow};

/// Push a window back to the top of the TOPMOST band without activating it.
///
/// Tauri/tao only invokes the native `SetWindowPos` when the `always_on_top`
/// flag actually changes. The overlay and prompt builders are created with
/// `always_on_top(true)`, so every "re-assert" in the codebase was a silent
/// no-op: after a fullscreen game or another topmost window took the top spot
/// (alt-tab, Steam/Epic relaunch) the WebView stayed behind. Toggling the flag
/// forces the native re-insertion while `set_focus` stays untouched.
pub fn force_topmost(win: &WebviewWindow) {
    let _ = win.set_always_on_top(false);
    let _ = win.set_always_on_top(true);
}

/// Whether a window with the given label currently exists and is visible.
pub fn is_window_visible(app: &tauri::AppHandle, label: &str) -> bool {
    app.get_webview_window(label)
        .and_then(|win| win.is_visible().ok())
        .unwrap_or(false)
}
