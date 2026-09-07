//! Generic post-match prompt window ("prompt").
//!
//! Unlike the passive overlay widget, this window is meant to take focus on
//! top of the game so the player can answer with a gamepad, keyboard or
//! mouse. It is opt-in (`prompt_focus_enabled`) because on exclusive
//! fullscreen Windows minimizes the game when another window takes focus.
//!
//! The window is created once and reused (hide, never destroy), mirroring the
//! overlay's teardown-race avoidance. Content is generic: `show_prompt_window`
//! carries a `{ kind, match_id }` payload and the frontend `PromptHost`
//! renders the matching prompt (mood today, anything tomorrow).

use serde::Serialize;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const PROMPT_LABEL: &str = "prompt";

#[derive(Clone, Debug, Serialize)]
pub struct PromptPayload {
    pub kind: String,
    pub match_id: i64,
}

/// Get the prompt window, creating it hidden on first use.
fn ensure_prompt_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(win) = app.get_webview_window(PROMPT_LABEL) {
        return Ok(win);
    }

    #[cfg(target_os = "windows")]
    let builder =
        WebviewWindowBuilder::new(app, PROMPT_LABEL, WebviewUrl::App("index.html".into()))
            .title("RL Prompt")
            .inner_size(560.0, 480.0)
            .center()
            .transparent(true)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .resizable(false)
            .minimizable(false)
            .maximizable(false)
            .shadow(false)
            .visible_on_all_workspaces(true);

    #[cfg(not(target_os = "windows"))]
    let builder =
        WebviewWindowBuilder::new(app, PROMPT_LABEL, WebviewUrl::App("index.html".into()))
            .title("RL Prompt")
            .inner_size(560.0, 480.0)
            .center()
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .resizable(false)
            .minimizable(false)
            .maximizable(false)
            .shadow(false)
            .visible_on_all_workspaces(true);

    builder
        .build()
        .map_err(|e| format!("Failed to create prompt window: {e}"))
}

/// Show the prompt window with a payload and take focus.
///
/// Callers decide whether stealing focus is appropriate (setting enabled,
/// game running, not a training match). Hiding the window later returns
/// focus to the game automatically — never try to re-focus the game
/// programmatically; Windows foreground rules make that unreliable.
pub fn show_prompt_window(app: &tauri::AppHandle, payload: PromptPayload) -> Result<(), String> {
    let win = ensure_prompt_window(app)?;
    win.emit("prompt-open", &payload)
        .map_err(|e| format!("Failed to emit prompt-open: {e}"))?;
    win.show()
        .map_err(|e| format!("Failed to show prompt window: {e}"))?;
    let _ = win.set_always_on_top(true);
    // Best effort: on exclusive fullscreen this minimizes the game (physical
    // Windows behavior, documented in settings). The prompt stays usable via
    // mouse/keyboard/gamepad regardless.
    let _ = win.set_focus();
    Ok(())
}

/// Hide the prompt window, telling its content to reset first.
pub fn hide_prompt_window(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(win) = app.get_webview_window(PROMPT_LABEL) else {
        return Ok(());
    };
    let _ = win.emit("prompt-close", serde_json::json!({}));
    win.hide()
        .map_err(|e| format!("Failed to hide prompt window: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn show_prompt(app: tauri::AppHandle, kind: String, match_id: i64) -> Result<(), String> {
    show_prompt_window(&app, PromptPayload { kind, match_id })
}

#[tauri::command]
pub async fn hide_prompt(app: tauri::AppHandle) -> Result<(), String> {
    hide_prompt_window(&app)
}

#[tauri::command]
pub async fn get_prompt_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let visible = app
        .get_webview_window(PROMPT_LABEL)
        .map(|win| win.is_visible().unwrap_or(false))
        .unwrap_or(false);
    Ok(serde_json::json!({ "visible": visible }))
}
