use crate::core::settings::AppSettings;
use serde::Serialize;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const OVERLAY_LABEL: &str = "overlay";

#[derive(Clone, Debug, Serialize)]
pub struct OverlayWindowState {
    pub visible: bool,
    pub clickthrough: bool,
    pub opacity: f64,
    pub position_x: i32,
    pub position_y: i32,
    pub width: i32,
    pub height: i32,
}

/// Create or show the overlay window with settings from the database.
#[tauri::command]
pub async fn create_overlay_window(
    app: tauri::AppHandle,
    settings: tauri::State<'_, crate::AppState>,
) -> Result<OverlayWindowState, String> {
    let app_settings = {
        let pool = &settings.db_pool;
        crate::core::settings::get_settings(pool).unwrap_or_default()
    };

    // If already exists, just show and update it
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        apply_overlay_settings(&win, &app_settings)?;
        let _ = win.show();
        let _ = win.set_focus();

        return Ok(build_state(&app_settings, true));
    }

    let url = WebviewUrl::App("index.html".into());

    #[cfg(target_os = "windows")]
    let builder = WebviewWindowBuilder::new(&app, OVERLAY_LABEL, url)
        .title("RL Overlay")
        .inner_size(
            app_settings.overlay_width as f64,
            app_settings.overlay_height as f64,
        )
        .position(
            app_settings.overlay_position_x as f64,
            app_settings.overlay_position_y as f64,
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
    let builder = WebviewWindowBuilder::new(&app, OVERLAY_LABEL, url)
        .title("RL Overlay")
        .inner_size(
            app_settings.overlay_width as f64,
            app_settings.overlay_height as f64,
        )
        .position(
            app_settings.overlay_position_x as f64,
            app_settings.overlay_position_y as f64,
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

    apply_overlay_settings(&win, &app_settings)?;

    let _ = win.show();

    Ok(build_state(&app_settings, true))
}

/// Hide the overlay window without destroying its WebView.
///
/// Keeping one transparent WebView alive avoids native teardown races when the
/// overlay is toggled while Rocket League is rendering.
#[tauri::command]
pub async fn destroy_overlay_window(app: tauri::AppHandle) -> Result<OverlayWindowState, String> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(OverlayWindowState {
        visible: false,
        clickthrough: true,
        opacity: 0.0,
        position_x: 0,
        position_y: 0,
        width: 0,
        height: 0,
    })
}

/// Get current overlay window state.
#[tauri::command]
pub async fn get_overlay_window_state(
    app: tauri::AppHandle,
    settings: tauri::State<'_, crate::AppState>,
) -> Result<OverlayWindowState, String> {
    let app_settings = {
        let pool = &settings.db_pool;
        crate::core::settings::get_settings(pool).unwrap_or_default()
    };

    let visible = overlay_is_visible(&app);
    Ok(build_state(&app_settings, visible))
}

/// Move the overlay window to a new position and persist.
#[tauri::command]
pub async fn update_overlay_position(
    app: tauri::AppHandle,
    settings: tauri::State<'_, crate::AppState>,
    x: i32,
    y: i32,
) -> Result<OverlayWindowState, String> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
            x, y,
        )))
        .map_err(|e| e.to_string())?;
    }

    let mut app_settings = {
        let pool = &settings.db_pool;
        crate::core::settings::get_settings(pool).unwrap_or_default()
    };
    app_settings.overlay_position_x = x;
    app_settings.overlay_position_y = y;
    let pool = settings.db_pool.clone();
    crate::core::settings::set_settings(&pool, &app_settings).map_err(|e| e.to_string())?;

    let visible = overlay_is_visible(&app);
    Ok(build_state(&app_settings, visible))
}

/// Resize the overlay window and persist.
#[tauri::command]
pub async fn update_overlay_size(
    app: tauri::AppHandle,
    settings: tauri::State<'_, crate::AppState>,
    width: i32,
    height: i32,
) -> Result<OverlayWindowState, String> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        win.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
            width as u32,
            height as u32,
        )))
        .map_err(|e| e.to_string())?;
    }

    let mut app_settings = {
        let pool = &settings.db_pool;
        crate::core::settings::get_settings(pool).unwrap_or_default()
    };
    app_settings.overlay_width = width;
    app_settings.overlay_height = height;
    let pool = settings.db_pool.clone();
    crate::core::settings::set_settings(&pool, &app_settings).map_err(|e| e.to_string())?;

    let visible = overlay_is_visible(&app);
    Ok(build_state(&app_settings, visible))
}

/// Update overlay opacity and persist.
#[tauri::command]
pub async fn update_overlay_opacity(
    app: tauri::AppHandle,
    settings: tauri::State<'_, crate::AppState>,
    opacity: f64,
) -> Result<OverlayWindowState, String> {
    let opacity = opacity.clamp(0.1, 1.0);

    // Emit event to the overlay webview to update its CSS opacity
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.emit("overlay-opacity-changed", opacity);
    }

    let mut app_settings = {
        let pool = &settings.db_pool;
        crate::core::settings::get_settings(pool).unwrap_or_default()
    };
    app_settings.overlay_opacity = opacity;
    let pool = settings.db_pool.clone();
    crate::core::settings::set_settings(&pool, &app_settings).map_err(|e| e.to_string())?;

    let visible = overlay_is_visible(&app);
    Ok(build_state(&app_settings, visible))
}

/// Toggle clickthrough mode (pass clicks to game vs. interactable overlay).
#[tauri::command]
pub async fn set_overlay_clickthrough(
    app: tauri::AppHandle,
    settings: tauri::State<'_, crate::AppState>,
    clickthrough: bool,
) -> Result<OverlayWindowState, String> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        win.set_ignore_cursor_events(clickthrough)
            .map_err(|e| e.to_string())?;

        // Emit to the overlay so it can show/hide controls
        let _ = win.emit("overlay-clickthrough-changed", clickthrough);
    }

    let mut app_settings = {
        let pool = &settings.db_pool;
        crate::core::settings::get_settings(pool).unwrap_or_default()
    };
    app_settings.overlay_clickthrough = clickthrough;
    let pool = settings.db_pool.clone();
    crate::core::settings::set_settings(&pool, &app_settings).map_err(|e| e.to_string())?;

    let visible = overlay_is_visible(&app);
    Ok(build_state(&app_settings, visible))
}

/// Toggle overlay enabled state and persist. Creates or destroys the window.
#[tauri::command]
pub async fn toggle_overlay_enabled(
    app: tauri::AppHandle,
    settings: tauri::State<'_, crate::AppState>,
) -> Result<OverlayWindowState, String> {
    let mut app_settings = {
        let pool = &settings.db_pool;
        crate::core::settings::get_settings(pool).unwrap_or_default()
    };

    app_settings.overlay_enabled = !app_settings.overlay_enabled;
    let pool = settings.db_pool.clone();
    crate::core::settings::set_settings(&pool, &app_settings).map_err(|e| e.to_string())?;

    if app_settings.overlay_enabled {
        create_overlay_window(app.clone(), app.state::<crate::AppState>()).await
    } else {
        destroy_overlay_window(app).await
    }
}

/// Notify the overlay window that settings changed (fields, font scale, etc).
#[tauri::command]
pub async fn notify_overlay_settings_changed(
    app: tauri::AppHandle,
    settings: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    let app_settings = {
        let pool = &settings.db_pool;
        crate::core::settings::get_settings(pool).unwrap_or_default()
    };

    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.emit(
            "overlay-settings-updated",
            serde_json::json!({
                "showScore": app_settings.overlay_show_score,
                "showPlayers": app_settings.overlay_show_players,
                "showStats": app_settings.overlay_show_stats,
                "showTimer": app_settings.overlay_show_timer,
                "fontScale": app_settings.overlay_font_scale,
                "opacity": app_settings.overlay_opacity,
                "playerScope": app_settings.overlay_player_scope,
                "showNames": app_settings.overlay_show_names,
                "showPlayerScore": app_settings.overlay_show_player_score,
                "showBoost": app_settings.overlay_show_boost,
                "showMmr": app_settings.overlay_show_mmr,
                "showSpeed": app_settings.overlay_show_speed,
            }),
        );
    }

    Ok(())
}

/// Make overlay interactive temporarily (for repositioning via drag).
#[tauri::command]
pub async fn set_overlay_interactive(
    app: tauri::AppHandle,
    duration_secs: u64,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        // Enable interaction temporarily
        win.set_ignore_cursor_events(false)
            .map_err(|e| e.to_string())?;
        let _ = win.emit("overlay-interactive-mode", true);

        let win_clone = win.clone();
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_secs(duration_secs)).await;
            if win_clone.is_visible().unwrap_or(false) {
                let _ = win_clone.set_ignore_cursor_events(true);
                let _ = win_clone.emit("overlay-interactive-mode", false);
            }
        });
    }

    Ok(())
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn overlay_is_visible(app: &tauri::AppHandle) -> bool {
    app.get_webview_window(OVERLAY_LABEL)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

fn apply_overlay_settings(
    win: &tauri::WebviewWindow,
    settings: &AppSettings,
) -> Result<(), String> {
    win.set_ignore_cursor_events(settings.overlay_clickthrough)
        .map_err(|e| e.to_string())?;

    // Emit initial settings to the overlay webview
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
            "showSpeed": settings.overlay_show_speed,
        }),
    );

    let _ = win.emit("overlay-opacity-changed", settings.overlay_opacity);
    let _ = win.emit(
        "overlay-clickthrough-changed",
        settings.overlay_clickthrough,
    );

    Ok(())
}

fn build_state(settings: &AppSettings, visible: bool) -> OverlayWindowState {
    OverlayWindowState {
        visible,
        clickthrough: settings.overlay_clickthrough,
        opacity: settings.overlay_opacity,
        position_x: settings.overlay_position_x,
        position_y: settings.overlay_position_y,
        width: settings.overlay_width,
        height: settings.overlay_height,
    }
}
