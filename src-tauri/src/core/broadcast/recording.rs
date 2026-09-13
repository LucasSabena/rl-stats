//! Match recording and replay ("retransmisión").
//!
//! The recorder taps the broadcast hub and writes every game event to a
//! JSONL file (one `{ts, payload}` per line) plus a small metadata sidecar.
//! Replay re-emits those events on the same hub with the original pacing
//! (scaled by a speed factor), so overlays behave exactly as in the live
//! match. Tournaments use it to re-air a match or to recover a graphics feed
//! after a crash without replaying the game itself.
//!
//! Files live under `<app data>/broadcast_recordings/`:
//! - `<id>.jsonl` — events
//! - `<id>.meta.json` — label, timing, event count, match guid
//!
//! Replay events carry `"source": "replay"` and the recorder skips them, so a
//! replayed match never records itself.

use super::BroadcastHub;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tracing::{info, warn};

/// Event types the recorder stores. High-frequency `state` frames are
/// downsampled; chat is intentionally excluded (not part of a match replay).
const RECORDED_TYPES: &[&str] = &[
    "state",
    "goal",
    "statfeed",
    "ball_hit",
    "clock",
    "match_started",
    "match_ended",
    "match_paused",
    "match_unpaused",
    "replay_start",
    "replay_end",
    "countdown_begin",
    "crossbar",
    "scene",
    "series",
    "tournament",
    "timer",
    "delay",
    "graphic",
];

/// `state` frames are capped to this interval while recording.
const STATE_SAMPLE_MS: i64 = 200;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSummary {
    pub id: String,
    pub label: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub duration_ms: i64,
    pub events: u64,
    pub size_bytes: u64,
    pub match_guid: Option<String>,
    /// True while the recorder is still writing this file.
    pub active: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordingMeta {
    id: String,
    label: String,
    started_at: i64,
    ended_at: Option<i64>,
    events: u64,
    match_guid: Option<String>,
}

struct ActiveRecording {
    id: String,
    label: String,
    started_at: i64,
    path: PathBuf,
    meta_path: PathBuf,
    writer: std::io::BufWriter<std::fs::File>,
    events: u64,
    last_state_ms: i64,
    match_guid: Option<String>,
}

/// Owns the recording directory and the single active recording.
#[derive(Clone)]
pub struct RecordingManager {
    dir: PathBuf,
    active: Arc<Mutex<Option<ActiveRecording>>>,
    replay_stop: Arc<AtomicBool>,
    replay_active: Arc<AtomicBool>,
}

impl RecordingManager {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            active: Arc::new(Mutex::new(None)),
            replay_stop: Arc::new(AtomicBool::new(false)),
            replay_active: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn ensure_dir(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.dir)
    }

    pub fn is_recording(&self) -> bool {
        self.active
            .lock()
            .map(|guard| guard.is_some())
            .unwrap_or(false)
    }

    /// Starts a new recording. Idempotent: an active recording is returned.
    pub fn start(&self, label: &str) -> Result<RecordingSummary, String> {
        let mut guard = self.active.lock().map_err(|_| "recorder lock poisoned")?;
        if let Some(active) = guard.as_ref() {
            return Ok(summary_from_meta(
                &RecordingMeta {
                    id: active.id.clone(),
                    label: active.label.clone(),
                    started_at: active.started_at,
                    ended_at: None,
                    events: active.events,
                    match_guid: active.match_guid.clone(),
                },
                active.path.clone(),
                active.meta_path.clone(),
            ));
        }

        self.ensure_dir().map_err(|error| error.to_string())?;
        let id = uuid::Uuid::new_v4().simple().to_string();
        let path = self.dir.join(format!("{id}.jsonl"));
        let meta_path = self.dir.join(format!("{id}.meta.json"));
        let file = std::fs::File::create(&path).map_err(|error| error.to_string())?;
        let started_at = chrono::Utc::now().timestamp_millis();
        let active = ActiveRecording {
            id: id.clone(),
            label: if label.trim().is_empty() {
                format!("Grabación {}", chrono::Local::now().format("%H:%M"))
            } else {
                label.trim().to_string()
            },
            started_at,
            path: path.clone(),
            meta_path: meta_path.clone(),
            writer: std::io::BufWriter::new(file),
            events: 0,
            last_state_ms: 0,
            match_guid: None,
        };
        *guard = Some(active);
        if let Some(active) = guard.as_ref() {
            write_meta(active, false);
        }
        info!(id, "Recording started");
        let active = guard.as_ref().expect("recording just created");
        Ok(summary_from_meta(
            &RecordingMeta {
                id: active.id.clone(),
                label: active.label.clone(),
                started_at: active.started_at,
                ended_at: None,
                events: 0,
                match_guid: None,
            },
            path,
            meta_path,
        ))
    }

    /// Stops the active recording and returns its summary.
    pub fn stop(&self) -> Result<Option<RecordingSummary>, String> {
        let mut guard = self.active.lock().map_err(|_| "recorder lock poisoned")?;
        let Some(mut active) = guard.take() else {
            return Ok(None);
        };
        let _ = active.writer.flush();
        write_meta(&active, true);
        info!(id = %active.id, events = active.events, "Recording stopped");
        Ok(Some(summary_from_meta(
            &RecordingMeta {
                id: active.id.clone(),
                label: active.label.clone(),
                started_at: active.started_at,
                ended_at: Some(chrono::Utc::now().timestamp_millis()),
                events: active.events,
                match_guid: active.match_guid.clone(),
            },
            active.path.clone(),
            active.meta_path.clone(),
        )))
    }

    /// Taps one broadcast event. Called from the hub recorder task.
    pub fn record_value(&self, value: &Value) {
        let event_type = value.get("type").and_then(Value::as_str).unwrap_or("");
        if !RECORDED_TYPES.contains(&event_type) {
            return;
        }
        if value.get("source").and_then(Value::as_str) == Some("replay") {
            return;
        }
        let now = chrono::Utc::now().timestamp_millis();
        let mut guard = match self.active.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        let Some(active) = guard.as_mut() else {
            return;
        };
        if event_type == "state" && now - active.last_state_ms < STATE_SAMPLE_MS {
            return;
        }
        if event_type == "state" {
            active.last_state_ms = now;
            if active.match_guid.is_none() {
                active.match_guid = value
                    .get("data")
                    .and_then(|data| data.get("matchGuid"))
                    .and_then(Value::as_str)
                    .map(str::to_string);
            }
        }
        let line = json!({ "ts": now, "payload": value });
        if writeln!(active.writer, "{line}").is_err() {
            return;
        }
        active.events += 1;
        if active.events % 200 == 0 {
            let _ = active.writer.flush();
            write_meta(active, false);
        }
    }

    pub fn list(&self) -> Result<Vec<RecordingSummary>, String> {
        let entries = std::fs::read_dir(&self.dir)
            .map_err(|error| error.to_string())?
            .flatten();
        let active_id = self
            .active
            .lock()
            .ok()
            .and_then(|guard| guard.as_ref().map(|active| active.id.clone()));
        let mut summaries = Vec::new();
        for entry in entries {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("jsonl") {
                continue;
            }
            let id = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or_default()
                .to_string();
            let meta_path = self.dir.join(format!("{id}.meta.json"));
            let meta = read_meta(&meta_path).unwrap_or_else(|| RecordingMeta {
                id: id.clone(),
                label: id.clone(),
                started_at: 0,
                ended_at: None,
                events: 0,
                match_guid: None,
            });
            let mut summary = summary_from_meta(&meta, path.clone(), meta_path);
            summary.size_bytes = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
            summary.active = active_id.as_deref() == Some(id.as_str());
            summaries.push(summary);
        }
        summaries.sort_by_key(|summary| -summary.started_at);
        Ok(summaries)
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        if self
            .active
            .lock()
            .ok()
            .and_then(|guard| guard.as_ref().map(|active| active.id == id))
            .unwrap_or(false)
        {
            return Err("No se puede borrar una grabación en curso".into());
        }
        for path in [
            self.dir.join(format!("{id}.jsonl")),
            self.dir.join(format!("{id}.meta.json")),
        ] {
            if path.exists() {
                std::fs::remove_file(path).map_err(|error| error.to_string())?;
            }
        }
        Ok(())
    }

    /// Replays a recording into the hub with the original pacing.
    pub fn replay(
        &self,
        hub: BroadcastHub,
        id: &str,
        speed: f64,
        loop_events: bool,
    ) -> Result<(), String> {
        let path = self.dir.join(format!("{id}.jsonl"));
        if !path.exists() {
            return Err(format!("Grabación no encontrada: {id}"));
        }
        let speed = if speed.is_finite() && speed > 0.05 {
            speed.clamp(0.1, 8.0)
        } else {
            1.0
        };
        let stop = Arc::clone(&self.replay_stop);
        let active = Arc::clone(&self.replay_active);
        let id = id.to_string();
        stop.store(false, Ordering::SeqCst);
        active.store(true, Ordering::SeqCst);
        info!(id = %id, speed, "Replay started");

        tauri::async_runtime::spawn(async move {
            loop {
                let events = match read_events(&path) {
                    Ok(events) => events,
                    Err(error) => {
                        warn!(error = %error, "Replay failed to read recording");
                        break;
                    }
                };
                if events.is_empty() {
                    break;
                }
                let base = events[0].0;
                let mut previous = 0i64;
                for (ts, payload) in &events {
                    if stop.load(Ordering::SeqCst) {
                        info!("Replay stopped by user");
                        active.store(false, Ordering::SeqCst);
                        return;
                    }
                    let offset = (ts - base).max(0) - previous;
                    previous += offset;
                    if offset > 0 {
                        let sleep_ms = ((offset as f64) / speed).round() as u64;
                        tokio::time::sleep(Duration::from_millis(sleep_ms.min(60_000))).await;
                    }
                    let mut payload = payload.clone();
                    if let Value::Object(ref mut map) = payload {
                        map.insert("source".into(), json!("replay"));
                    }
                    hub.publish(payload);
                }
                if !loop_events {
                    break;
                }
            }
            active.store(false, Ordering::SeqCst);
            info!(id = %id, "Replay finished");
        });
        Ok(())
    }

    pub fn stop_replay(&self) {
        self.replay_stop.store(true, Ordering::SeqCst);
        self.replay_active.store(false, Ordering::SeqCst);
    }

    pub fn is_replaying(&self) -> bool {
        self.replay_active.load(Ordering::SeqCst)
    }
}

fn summary_from_meta(meta: &RecordingMeta, path: PathBuf, _meta_path: PathBuf) -> RecordingSummary {
    let duration_ms = match meta.ended_at {
        Some(end) => (end - meta.started_at).max(0),
        None => (chrono::Utc::now().timestamp_millis() - meta.started_at).max(0),
    };
    RecordingSummary {
        id: meta.id.clone(),
        label: meta.label.clone(),
        started_at: meta.started_at,
        ended_at: meta.ended_at,
        duration_ms,
        events: meta.events,
        size_bytes: path.metadata().map(|metadata| metadata.len()).unwrap_or(0),
        match_guid: meta.match_guid.clone(),
        active: meta.ended_at.is_none(),
    }
}

fn write_meta(active: &ActiveRecording, finished: bool) {
    let meta = RecordingMeta {
        id: active.id.clone(),
        label: active.label.clone(),
        started_at: active.started_at,
        ended_at: finished.then(|| chrono::Utc::now().timestamp_millis()),
        events: active.events,
        match_guid: active.match_guid.clone(),
    };
    if let Ok(text) = serde_json::to_string_pretty(&meta) {
        let _ = std::fs::write(&active.meta_path, text);
    }
}

fn read_meta(path: &Path) -> Option<RecordingMeta> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Reads `(timestamp_ms, payload)` pairs from a recording file.
fn read_events(path: &Path) -> Result<Vec<(i64, Value)>, String> {
    let file = std::fs::File::open(path).map_err(|error| error.to_string())?;
    let reader = BufReader::new(file);
    let mut events = Vec::new();
    for line in reader.lines() {
        let Ok(line) = line else { continue };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let Some(ts) = value.get("ts").and_then(Value::as_i64) else {
            continue;
        };
        let Some(payload) = value.get("payload").cloned() else {
            continue;
        };
        events.push((ts, payload));
    }
    Ok(events)
}

/// Spawns the hub tap that feeds the recorder. Runs for the app lifetime.
pub fn spawn_recorder(hub: BroadcastHub, manager: RecordingManager) {
    let mut rx = hub.subscribe_tap();
    tauri::async_runtime::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(value) => manager.record_value(&value),
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });
    info!("Broadcast recorder tap started");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_manager(name: &str) -> RecordingManager {
        let dir = std::env::temp_dir().join(format!(
            "rl-stats-recording-{}-{}-{}",
            name,
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        RecordingManager::new(dir)
    }

    #[test]
    fn records_supported_events_and_skips_noise() {
        let manager = temp_manager("record");
        let summary = manager.start("Test").unwrap();
        assert!(manager.is_recording());

        manager.record_value(&json!({ "type": "goal", "data": { "scorerName": "A" } }));
        manager.record_value(&json!({ "type": "chat", "data": { "user": "x" } }));
        manager.record_value(&json!({ "type": "state", "data": { "matchGuid": "g1" } }));
        // A second state within the sampling window is dropped.
        manager.record_value(&json!({ "type": "state", "data": { "matchGuid": "g1" } }));

        let stopped = manager.stop().unwrap().unwrap();
        assert_eq!(stopped.events, 2);
        assert_eq!(stopped.match_guid.as_deref(), Some("g1"));
        assert_eq!(stopped.id, summary.id);

        let listed = manager.list().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].events, 2);

        let events = read_events(&manager.dir.join(format!("{}.jsonl", summary.id))).unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].1["type"], "goal");
    }

    #[test]
    fn replay_events_are_not_recorded() {
        let manager = temp_manager("replay-skip");
        manager.start("Test").unwrap();
        manager.record_value(&json!({ "type": "goal", "source": "replay" }));
        manager.record_value(&json!({ "type": "goal" }));
        let stopped = manager.stop().unwrap().unwrap();
        assert_eq!(stopped.events, 1);
    }

    #[test]
    fn start_is_idempotent_and_delete_removes_files() {
        let manager = temp_manager("idempotent");
        let first = manager.start("One").unwrap();
        let second = manager.start("Two").unwrap();
        assert_eq!(first.id, second.id);
        let stopped = manager.stop().unwrap().unwrap();
        assert!(manager.delete(&stopped.id).is_ok());
        assert!(manager.list().unwrap().is_empty());
    }

    #[test]
    fn stop_without_recording_is_none() {
        let manager = temp_manager("stop-none");
        assert!(manager.stop().unwrap().is_none());
    }
}
