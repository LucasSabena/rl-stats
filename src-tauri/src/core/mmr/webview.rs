//! Local scraping bridge for rlstats.net using an embedded WebView2 window.
//!
//! rlstats.net sits behind a Cloudflare challenge that a plain HTTP client
//! cannot solve. A hidden Tauri webview runs the real browser engine, clears
//! the challenge once, and then keeps the clearance cookies for subsequent
//! lookups. The page is scraped from inside the webview with injected
//! JavaScript and the structured result is handed back through
//! `eval_with_callback`, so no remote IPC or extra permissions are needed.
//!
//! Design constraints:
//! - One lookup at a time (serialized) to stay well below any rate limit.
//! - The window is reused across lookups, never shown, and never focused.
//! - Callers cache the result; this module does no caching itself.

use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::{oneshot, Mutex};
use tracing::{debug, warn};

pub const RLSTATS_WEBVIEW_LABEL: &str = "mmr-scraper";
const RLSTATS_BASE: &str = "https://rlstats.net";
const SCRAPE_TIMEOUT: Duration = Duration::from_secs(30);
const FIRST_POLL_DELAY: Duration = Duration::from_millis(900);
const POLL_INTERVAL: Duration = Duration::from_millis(700);
const EVAL_TIMEOUT: Duration = Duration::from_secs(6);
const WINDOW_WIDTH: f64 = 1080.0;
const WINDOW_HEIGHT: f64 = 720.0;
/// How long the hidden window may sit unused before it is destroyed. WebView2
/// persists cookies on disk, so recreating it keeps any Cloudflare clearance.
const IDLE_CLOSE: Duration = Duration::from_secs(10 * 60);
/// Cadence of the idle reaper. One atomic read per tick, so it is effectively
/// free while the user is playing.
const REAPER_INTERVAL: Duration = Duration::from_secs(60);

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| u64::try_from(duration.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

/// One playlist column extracted from the rlstats profile tables.
#[derive(Clone, Debug, Deserialize)]
pub struct ExtractedPlaylist {
    pub label: String,
    #[serde(default)]
    pub rank: Option<String>,
    #[serde(default)]
    pub division: Option<String>,
    #[serde(default)]
    pub mmr: Option<f64>,
    #[serde(default)]
    pub matches: Option<i64>,
    #[serde(default)]
    pub streak: Option<String>,
}

/// Structured payload returned by the injected extractor script.
#[derive(Clone, Debug, Deserialize)]
pub struct ExtractedProfile {
    pub ok: bool,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub season: Option<i64>,
    #[serde(default)]
    pub playlists: Vec<ExtractedPlaylist>,
    #[serde(default)]
    pub casual: Option<f64>,
}

/// Injected extractor. Must be synchronous and return a plain object: the
/// WebView2 evaluation result is JSON-serialized by the host.
///
/// The current season is the only visible `.block-skills` block; older seasons
/// are hidden ancestors. MMR cells for the current season carry `<mmr>` delta
/// tags around the real value, so those elements are removed before reading.
const EXTRACTOR_JS: &str = r#"
(function () {
  try {
    function visible(el) {
      for (var node = el; node; node = node.parentElement) {
        var style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    }
    var title = (document.title || '').trim();
    var blocks = Array.prototype.slice.call(document.querySelectorAll('.block-skills'));
    var skills = null;
    for (var i = 0; i < blocks.length; i++) {
      if (visible(blocks[i])) { skills = blocks[i]; break; }
    }
    if (!skills) {
      if (/just a moment|attention required|security verification/i.test(title)) {
        return { ok: false, reason: 'challenge' };
      }
      if (/not found|404/i.test(title)) {
        return { ok: false, reason: 'not-found' };
      }
      if (/profile/i.test(title)) {
        return { ok: true, season: null, playlists: [], casual: null };
      }
      return { ok: false, reason: 'no-skills' };
    }
    var season = null;
    var body = skills.closest('.block-body');
    if (body) season = body.getAttribute('data-season');
    var playlists = [];
    var tables = skills.querySelectorAll('table');
    for (var t = 0; t < tables.length; t++) {
      var rows = tables[t].querySelectorAll('tr');
      if (rows.length < 2) continue;
      var headers = Array.prototype.slice.call(rows[0].children).map(function (cell) {
        return cell.textContent.trim().replace(/\s+/g, ' ');
      });
      if (!headers.length) continue;
      var cols = headers.map(function () {
        return { rank: null, division: null, mmr: null, matches: null, streak: null };
      });
      for (var r = 1; r < rows.length; r++) {
        var cells = rows[r].children;
        for (var c = 0; c < cells.length && c < cols.length; c++) {
          var cell = cells[c];
          var text = cell.textContent.trim().replace(/\s+/g, ' ');
          if (!text) continue;
          if (/^Division\b/i.test(text)) { cols[c].division = text; continue; }
          var match = text.match(/^Matches Played:\s*(\d+)/i);
          if (match) { cols[c].matches = parseInt(match[1], 10); continue; }
          if (/^(Win|Loss) Streak:/i.test(text)) { cols[c].streak = text; continue; }
          if (/^Rating\b/i.test(text)) continue;
          var clone = cell.cloneNode(true);
          var deltas = clone.querySelectorAll('mmr');
          for (var d = 0; d < deltas.length; d++) {
            if (deltas[d].parentNode) deltas[d].parentNode.removeChild(deltas[d]);
          }
          var plain = clone.textContent.trim().replace(/\s+/g, ' ');
          if (/^\d+(\.\d+)?$/.test(plain)) { cols[c].mmr = parseFloat(plain); continue; }
          if (!cols[c].rank && /[A-Za-z]/.test(text)) cols[c].rank = text;
        }
      }
      for (var h = 0; h < headers.length; h++) {
        playlists.push({
          label: headers[h],
          rank: cols[h].rank,
          division: cols[h].division,
          mmr: cols[h].mmr,
          matches: cols[h].matches,
          streak: cols[h].streak
        });
      }
    }
    var casual = null;
    var unranked = skills.querySelector('.unranked-block table');
    if (unranked) {
      var casualMatch = unranked.textContent.replace(/\s+/g, ' ').match(/Rating\s+(\d+(\.\d+)?)/i);
      if (casualMatch) casual = parseFloat(casualMatch[1]);
    }
    return { ok: true, season: season ? parseInt(season, 10) : null, playlists: playlists, casual: casual };
  } catch (error) {
    return { ok: false, reason: 'exception: ' + (error && error.message ? error.message : String(error)) };
  }
})()
"#;

/// Serialized scraper. Holds the hidden window (lazily created) and a lock so
/// only one navigation/extraction runs at a time.
///
/// The window is also kept idle-free: after every scrape it is parked on
/// `about:blank` (the site's JavaScript stops running) and a background reaper
/// destroys it entirely after [`IDLE_CLOSE`] without use. WebView2 keeps the
/// Cloudflare clearance cookies on disk, so a later lookup reuses them.
pub struct RlstatsScraper {
    app: AppHandle,
    window: Mutex<Option<WebviewWindow>>,
    scrape_lock: Mutex<()>,
    /// Epoch millis of the last scrape activity. Read by the reaper; a plain
    /// atomic keeps the reaper from needing the window lock on every tick.
    last_used_ms: AtomicU64,
}

impl RlstatsScraper {
    pub fn new(app: AppHandle) -> Arc<Self> {
        let scraper = Arc::new(Self {
            app,
            window: Mutex::new(None),
            scrape_lock: Mutex::new(()),
            last_used_ms: AtomicU64::new(now_ms()),
        });

        let weak = Arc::downgrade(&scraper);
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(REAPER_INTERVAL).await;
                let Some(scraper) = weak.upgrade() else {
                    break;
                };
                scraper.close_if_idle().await;
            }
        });

        scraper
    }

    fn mark_used(&self) {
        self.last_used_ms.store(now_ms(), Ordering::Relaxed);
    }

    /// Destroys the hidden window once it has been unused for [`IDLE_CLOSE`].
    /// A scrape updates `last_used_ms` when it starts, and a scrape can last at
    /// most [`SCRAPE_TIMEOUT`], far below the idle window, so this can never
    /// close a window mid-scrape.
    async fn close_if_idle(&self) {
        let mut guard = self.window.lock().await;
        if guard.is_none() {
            return;
        }
        let idle_ms = now_ms().saturating_sub(self.last_used_ms.load(Ordering::Relaxed));
        if idle_ms < IDLE_CLOSE.as_millis() as u64 {
            return;
        }

        if let Some(window) = guard.take() {
            debug!("Closing idle MMR scraper window");
            let _ = window.close();
        }
    }

    /// Fetches and extracts the rlstats profile for `platform`/`identifier`,
    /// taking the scrape lock for the duration.
    ///
    /// Returns `Ok` with `ok: false` only for terminal page states (not found);
    /// transient states (Cloudflare challenge, still loading) are retried until
    /// `SCRAPE_TIMEOUT` and then reported as an error.
    pub async fn fetch_profile(
        &self,
        platform: &str,
        identifier: &str,
    ) -> AppResult<ExtractedProfile> {
        let _guard = self.lock_scrape().await;
        self.fetch_profile_unlocked(platform, identifier).await
    }

    /// Serializes access to the shared hidden window.
    ///
    /// Callers that need cache-check-then-scrape atomicity (the MMR resolver)
    /// should hold this guard across their cache read and a call to
    /// [`Self::fetch_profile_unlocked`], so a whole lobby is served by a single
    /// navigation instead of one scrape per player.
    pub async fn lock_scrape(&self) -> tokio::sync::MutexGuard<'_, ()> {
        self.scrape_lock.lock().await
    }

    /// Scrapes without taking the lock. The caller must hold [`Self::lock_scrape`].
    pub async fn fetch_profile_unlocked(
        &self,
        platform: &str,
        identifier: &str,
    ) -> AppResult<ExtractedProfile> {
        let url = build_profile_url(platform, identifier)?;
        self.mark_used();
        let window = self.ensure_window().await?;
        window
            .navigate(url)
            .map_err(|e| AppError::ConnectionError(format!("No se pudo abrir RLStats: {e}")))?;

        let started = Instant::now();
        tokio::time::sleep(FIRST_POLL_DELAY).await;

        let mut last_reason = String::from("sin respuesta");
        while started.elapsed() < SCRAPE_TIMEOUT {
            match self.extract_once(&window).await {
                Ok(Some(profile)) => {
                    if profile.ok {
                        debug!(
                            playlists = profile.playlists.len(),
                            elapsed_ms = started.elapsed().as_millis() as u64,
                            "RLStats profile extracted via webview"
                        );
                        self.park_window(&window);
                        return Ok(profile);
                    }
                    let reason = profile.reason.clone().unwrap_or_default();
                    if reason == "not-found" {
                        self.park_window(&window);
                        return Err(AppError::ConfigError(format!(
                            "Perfil no encontrado en RLStats: {platform}/{identifier}"
                        )));
                    }
                    last_reason = reason;
                }
                Ok(None) => {}
                Err(error) => {
                    debug!(%error, "Webview extraction attempt failed");
                    last_reason = error.to_string();
                }
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }

        Err(AppError::ConnectionError(format!(
            "RLStats no devolvio el perfil en {}s (estado: {last_reason}). \
             Abri rlstats.net en tu navegador una vez para resolver el challenge.",
            SCRAPE_TIMEOUT.as_secs()
        )))
    }

    /// Parks the window on `about:blank` so the scraped page stops running
    /// JavaScript and network timers between lookups. Cookies stay in the
    /// WebView2 profile, so the next navigation still has Cloudflare clearance.
    fn park_window(&self, window: &WebviewWindow) {
        if let Ok(blank) = tauri::Url::parse("about:blank") {
            let _ = window.navigate(blank);
        }
    }

    async fn ensure_window(&self) -> AppResult<WebviewWindow> {
        let mut guard = self.window.lock().await;
        if let Some(existing) = guard.as_ref() {
            // A stored window can be gone if the runtime destroyed it.
            if existing.is_visible().is_ok() {
                return Ok(existing.clone());
            }
            *guard = None;
        }

        // Adopt a window with our label if one already exists (e.g. created in
        // a previous resolver instance).
        if let Some(existing) = self.app.get_webview_window(RLSTATS_WEBVIEW_LABEL) {
            *guard = Some(existing.clone());
            return Ok(existing);
        }

        let url = tauri::Url::parse(RLSTATS_BASE)
            .map_err(|e| AppError::ConnectionError(format!("URL base invalida: {e}")))?;

        let window =
            WebviewWindowBuilder::new(&self.app, RLSTATS_WEBVIEW_LABEL, WebviewUrl::External(url))
                .title("RL Stats MMR")
                .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
                .visible(false)
                .focused(false)
                .skip_taskbar(true)
                .decorations(false)
                .resizable(false)
                .on_navigation(|url| {
                    url.host_str()
                        .map(|host| host.ends_with("rlstats.net"))
                        .unwrap_or(false)
                })
                .build()
                .map_err(|e| {
                    AppError::ConnectionError(format!(
                        "No se pudo crear la ventana de scraping (WebView2): {e}"
                    ))
                })?;

        *guard = Some(window.clone());
        Ok(window)
    }

    /// Runs the extractor once. `Ok(None)` means the evaluation never completed
    /// (navigation in progress); `Ok(Some(_))` is the script's own payload.
    async fn extract_once(&self, window: &WebviewWindow) -> AppResult<Option<ExtractedProfile>> {
        let (tx, rx) = oneshot::channel::<String>();
        let tx = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));

        window
            .eval_with_callback(EXTRACTOR_JS, move |result| {
                if let Some(sender) = tx.lock().ok().and_then(|mut guard| guard.take()) {
                    let _ = sender.send(result);
                }
            })
            .map_err(|e| AppError::ConnectionError(format!("eval fallo: {e}")))?;

        match tokio::time::timeout(EVAL_TIMEOUT, rx).await {
            Ok(Ok(raw)) => parse_extractor_result(&raw).map(Some),
            Ok(Err(_)) => Ok(None),
            Err(_) => Ok(None),
        }
    }
}

fn build_profile_url(platform: &str, identifier: &str) -> AppResult<tauri::Url> {
    let mut url = tauri::Url::parse(RLSTATS_BASE)
        .map_err(|e| AppError::ConnectionError(format!("URL base invalida: {e}")))?;
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| AppError::ConnectionError("URL base invalida".into()))?;
        segments.push("profile");
        segments.push(platform);
        segments.push(identifier);
    }
    Ok(url)
}

/// The webview returns the script object JSON-serialized. Depending on the
/// platform it can arrive double-encoded, so both shapes are accepted.
fn parse_extractor_result(raw: &str) -> AppResult<ExtractedProfile> {
    if let Ok(profile) = serde_json::from_str::<ExtractedProfile>(raw) {
        return Ok(profile);
    }
    if let Ok(inner) = serde_json::from_str::<String>(raw) {
        if let Ok(profile) = serde_json::from_str::<ExtractedProfile>(&inner) {
            return Ok(profile);
        }
    }
    warn!(raw = %raw.chars().take(200).collect::<String>(), "Unexpected webview result");
    Err(AppError::ParseError(
        "La extraccion del perfil RLStats devolvio un formato inesperado.".into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_encoded_profile_url() {
        let url = build_profile_url("Epic", "Some Name#123").unwrap();
        assert!(url
            .as_str()
            .starts_with("https://rlstats.net/profile/Epic/"));
        assert!(!url.as_str().contains(' '));
        assert!(url.as_str().contains("Some%20Name"));
    }

    #[test]
    fn parses_object_payload() {
        let raw = r#"{"ok":true,"season":25,"playlists":[{"label":"1v1 Solo Duel","rank":"Diamond III","division":"Division I","mmr":938,"matches":34,"streak":"Loss Streak: 3"}],"casual":1202}"#;
        let parsed = parse_extractor_result(raw).unwrap();
        assert!(parsed.ok);
        assert_eq!(parsed.playlists.len(), 1);
        assert_eq!(parsed.playlists[0].mmr, Some(938.0));
        assert_eq!(parsed.casual, Some(1202.0));
    }

    #[test]
    fn parses_double_encoded_payload() {
        let inner = r#"{"ok":false,"reason":"challenge"}"#;
        let raw = serde_json::to_string(inner).unwrap();
        let parsed = parse_extractor_result(&raw).unwrap();
        assert!(!parsed.ok);
        assert_eq!(parsed.reason.as_deref(), Some("challenge"));
    }
}
