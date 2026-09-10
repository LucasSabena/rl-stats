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
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const PROMPT_LABEL: &str = "prompt";

#[derive(Clone, Debug, Serialize)]
pub struct PromptPayload {
    pub kind: String,
    pub match_id: i64,
}

/// A prompt triggered while its window is still cold-starting.
///
/// Tauri drops events emitted before the frontend JS registers its listener
/// (see tauri-apps/tauri#3484 and discussion #9303 — our exact symptom: the
/// window takes focus but renders empty because `prompt-open` fired while
/// React was still mounting). The official recommendation is a pull model:
/// the backend stores the payload and the frontend fetches it on mount via
/// `get_pending_prompt`. The push emit is kept for already-open windows.
#[derive(Clone, Debug)]
struct PendingPrompt {
    payload: PromptPayload,
    shown_at: Instant,
    timeout_secs: u64,
}

#[derive(Default)]
struct PendingStore {
    inner: Option<PendingPrompt>,
}

impl PendingStore {
    fn store(&mut self, payload: PromptPayload, timeout_secs: u64, now: Instant) {
        self.inner = Some(PendingPrompt {
            payload,
            shown_at: now,
            timeout_secs,
        });
    }

    /// The stored payload, if any, provided it has not outlived its timeout.
    /// Reads never consume: a slow mount retrying still finds it.
    fn fresh(&self, now: Instant) -> Option<PromptPayload> {
        self.inner.as_ref().and_then(|pending| {
            if now.saturating_duration_since(pending.shown_at)
                < Duration::from_secs(pending.timeout_secs.max(1))
            {
                Some(pending.payload.clone())
            } else {
                None
            }
        })
    }

    fn clear(&mut self) {
        self.inner = None;
    }

    /// Whether the given prompt is already the one on screen. Used to make
    /// re-showing the same prompt a no-op: stealing focus again for a prompt
    /// the player is already looking at is what made the window feel like it
    /// flashed and reappeared.
    fn is_current(&self, payload: &PromptPayload) -> bool {
        self.inner
            .as_ref()
            .map(|pending| {
                pending.payload.kind == payload.kind && pending.payload.match_id == payload.match_id
            })
            .unwrap_or(false)
    }
}

static PENDING: Mutex<PendingStore> = Mutex::new(PendingStore { inner: None });

fn pending_lock() -> std::sync::MutexGuard<'static, PendingStore> {
    PENDING
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
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

/// Create the prompt window hidden so its webview is warm before the first
/// match ends. Building a brand-new webview right after a match is what made
/// the window appear seconds late (or not at all on slow machines).
pub fn prewarm_prompt_window(app: &tauri::AppHandle) {
    if let Err(error) = ensure_prompt_window(app) {
        tracing::warn!(error = %error, "Could not pre-create the prompt window");
    }
}

/// Show the prompt window with a payload and take focus.
///
/// Callers decide whether stealing focus is appropriate (setting enabled,
/// game running, not a training match). Hiding the window later returns
/// focus to the game automatically — never try to re-focus the game
/// programmatically; Windows foreground rules make that unreliable.
pub fn show_prompt_window(
    app: &tauri::AppHandle,
    payload: PromptPayload,
    timeout_secs: u64,
) -> Result<(), String> {
    let already_visible = app
        .get_webview_window(PROMPT_LABEL)
        .map(|win| win.is_visible().unwrap_or(false))
        .unwrap_or(false);

    // Same prompt already on screen: refresh nothing, steal no focus. This is
    // what makes a duplicate `match-finished` (a re-persist or an event replay)
    // harmless.
    if already_visible && pending_lock().is_current(&payload) {
        tracing::debug!(
            kind = %payload.kind,
            match_id = payload.match_id,
            "Prompt already visible; ignoring duplicate request"
        );
        return Ok(());
    }

    // Store first: a cold window misses the push emit below, so it pulls
    // the payload on mount instead. Order matters — store before build.
    pending_lock().store(payload.clone(), timeout_secs, Instant::now());
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
    tracing::info!(
        kind = %payload.kind,
        match_id = payload.match_id,
        "Prompt window shown"
    );
    Ok(())
}

/// Hide the prompt window, telling its content to reset first.
pub fn hide_prompt_window(app: &tauri::AppHandle) -> Result<(), String> {
    pending_lock().clear();
    let Some(win) = app.get_webview_window(PROMPT_LABEL) else {
        return Ok(());
    };
    let _ = win.emit("prompt-close", serde_json::json!({}));
    win.hide()
        .map_err(|e| format!("Failed to hide prompt window: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn show_prompt(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
    kind: String,
    match_id: i64,
) -> Result<(), String> {
    let timeout_secs = crate::core::settings::get_settings(&state.db_pool)
        .map(|s| u64::from(s.prompt_timeout_secs))
        .unwrap_or(30);
    show_prompt_window(&app, PromptPayload { kind, match_id }, timeout_secs)
}

/// Pull model for cold windows: returns the pending prompt if it has not
/// outlived its timeout, so a frontend that mounted after the push emit
/// still receives its payload. Called once by `PromptHost` on mount.
#[tauri::command]
pub async fn get_pending_prompt() -> Result<Option<PromptPayload>, String> {
    Ok(pending_lock().fresh(Instant::now()))
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

#[cfg(test)]
mod pending_store_tests {
    use super::*;
    use std::time::Duration;

    fn payload() -> PromptPayload {
        PromptPayload {
            kind: "mood".to_string(),
            match_id: 42,
        }
    }

    #[test]
    fn fresh_payload_survives_slow_mounts_but_expires() {
        let mut store = PendingStore::default();
        assert!(store.fresh(Instant::now()).is_none());

        let shown = Instant::now();
        store.store(payload(), 30, shown);
        // A cold window mounting seconds later still gets it.
        let got = store
            .fresh(shown + Duration::from_secs(5))
            .expect("pending prompt must survive a slow mount");
        assert_eq!(got.match_id, 42);
        assert_eq!(got.kind, "mood");
        // Reads never consume: retries keep working.
        assert!(store.fresh(shown + Duration::from_secs(6)).is_some());
        // Past the timeout it is gone.
        assert!(store.fresh(shown + Duration::from_secs(31)).is_none());
    }

    #[test]
    fn clear_drops_the_pending_prompt() {
        let mut store = PendingStore::default();
        let shown = Instant::now();
        store.store(payload(), 30, shown);
        store.clear();
        assert!(store.fresh(shown).is_none());
    }

    #[test]
    fn newer_payload_replaces_the_previous_one() {
        let mut store = PendingStore::default();
        let shown = Instant::now();
        store.store(payload(), 30, shown);
        store.store(
            PromptPayload {
                kind: "mood".to_string(),
                match_id: 43,
            },
            30,
            shown + Duration::from_secs(1),
        );
        assert_eq!(
            store
                .fresh(shown + Duration::from_secs(2))
                .unwrap()
                .match_id,
            43
        );
    }

    #[test]
    fn duplicate_show_of_the_same_prompt_is_detected() {
        let mut store = PendingStore::default();
        let now = Instant::now();
        store.store(payload(), 30, now);

        assert!(store.is_current(&payload()), "same prompt must be a no-op");
        assert!(!store.is_current(&PromptPayload {
            kind: "mood".to_string(),
            match_id: 43,
        }));
        assert!(!store.is_current(&PromptPayload {
            kind: "other".to_string(),
            match_id: 42,
        }));

        store.clear();
        assert!(!store.is_current(&payload()));
    }
}
