//! Broadcast Studio core.
//!
//! The overlay server used to own its broadcast channel. To let chat,
//! tournament state and operator actions feed the same WebSocket fan-out, the
//! channel lives here in a [`BroadcastHub`] that is shared by the overlay
//! server, the chat readers and the game-command bridge.
//!
//! The hub also implements the broadcast delay: tournaments often delay the
//! video feed to make stream sniping useless, so the graphics must be delayed
//! by the same amount. Events published while `delay > 0` are queued and
//! re-emitted after the configured delay.

pub mod actions;
pub mod chat;
pub mod game_commands;
pub mod packs;
pub mod store;
pub mod tournament;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;
use tokio::sync::broadcast;

/// A normalized chat message from Twitch, Kick or any future platform.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub platform: String,
    pub user: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default)]
    pub badges: Vec<String>,
    #[serde(default)]
    pub emotes: Vec<ChatEmote>,
    pub timestamp: i64,
}

/// Emote occurrence inside a chat message. `url` points at the platform CDN.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatEmote {
    pub name: String,
    pub url: String,
}

/// An operator action, either typed in the Control Room or sent to
/// `POST /api/v2/action` from the OBS dock or a Stream Deck.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActionRequest {
    pub action: String,
    #[serde(default)]
    pub data: Value,
}

impl ActionRequest {
    pub fn new(action: &str, data: Value) -> Self {
        Self {
            action: action.to_string(),
            data,
        }
    }

    pub fn str_field(&self, key: &str) -> Option<&str> {
        self.data.get(key).and_then(Value::as_str)
    }

    pub fn i64_field(&self, key: &str) -> Option<i64> {
        self.data.get(key).and_then(Value::as_i64)
    }

    pub fn u64_field(&self, key: &str) -> Option<u64> {
        self.data.get(key).and_then(Value::as_u64)
    }

    pub fn bool_field(&self, key: &str) -> Option<bool> {
        self.data.get(key).and_then(Value::as_bool)
    }
}

struct PendingEvent {
    due: Instant,
    text: String,
    state_data: Option<String>,
}

/// Shared WebSocket fan-out plus delay buffer.
///
/// Cloneable: every clone shares the same channel, cache and counters.
#[derive(Clone)]
pub struct BroadcastHub {
    tx: broadcast::Sender<String>,
    actions_tx: broadcast::Sender<ActionRequest>,
    latest_state: Arc<RwLock<Option<String>>>,
    client_count: Arc<AtomicUsize>,
    delay_secs: Arc<AtomicU64>,
    pending: Arc<Mutex<VecDeque<PendingEvent>>>,
    seq: Arc<AtomicU64>,
}

impl Default for BroadcastHub {
    fn default() -> Self {
        Self::new()
    }
}

impl BroadcastHub {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel::<String>(512);
        let (actions_tx, _) = broadcast::channel::<ActionRequest>(64);
        Self {
            tx,
            actions_tx,
            latest_state: Arc::new(RwLock::new(None)),
            client_count: Arc::new(AtomicUsize::new(0)),
            delay_secs: Arc::new(AtomicU64::new(0)),
            pending: Arc::new(Mutex::new(VecDeque::new())),
            seq: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Wraps a payload in the v2 envelope and publishes it.
    ///
    /// The envelope keeps the legacy `type`/`data` contract intact and adds
    /// `v`, `seq` and `ts`, so old SDK clients keep working while new clients
    /// can detect the version and dedupe/order.
    pub fn publish(&self, mut value: Value) {
        if let Value::Object(ref mut map) = value {
            map.insert("v".into(), json!(2));
            map.insert(
                "seq".into(),
                json!(self.seq.fetch_add(1, Ordering::Relaxed)),
            );
            map.insert("ts".into(), json!(chrono::Utc::now().timestamp_millis()));
        }

        let state_data = if value.get("type").and_then(Value::as_str) == Some("state") {
            value.get("data").map(Value::to_string)
        } else {
            None
        };

        let text = match serde_json::to_string(&value) {
            Ok(text) => text,
            Err(error) => {
                tracing::warn!(error = %error, "Failed to serialize broadcast event");
                return;
            }
        };

        let delay = self.delay_secs.load(Ordering::Relaxed);
        if delay == 0 {
            self.deliver(text, state_data);
        } else if let Ok(mut queue) = self.pending.lock() {
            queue.push_back(PendingEvent {
                due: Instant::now() + std::time::Duration::from_secs(delay),
                text,
                state_data,
            });
            // Hard cap so a runaway producer can never grow the queue without
            // bound: keep the newest window.
            const MAX_PENDING: usize = 4096;
            while queue.len() > MAX_PENDING {
                queue.pop_front();
            }
        }
    }

    /// Convenience wrapper: `publish(json!({ "type": ty, "data": data }))`.
    pub fn publish_typed(&self, ty: &str, data: Option<Value>) {
        let mut value = json!({ "type": ty });
        if let Some(data) = data {
            value["data"] = data;
        }
        self.publish(value);
    }

    /// Emits queued events whose delay has elapsed. The app runs this on a
    /// 200 ms tick; it is also exercised directly by tests.
    pub fn flush_due(&self) -> usize {
        let now = Instant::now();
        let mut batch = Vec::new();
        if let Ok(mut queue) = self.pending.lock() {
            while queue.front().is_some_and(|item| item.due <= now) {
                if let Some(item) = queue.pop_front() {
                    batch.push(item);
                }
            }
        }
        let count = batch.len();
        for item in batch {
            self.deliver(item.text, item.state_data);
        }
        count
    }

    fn deliver(&self, text: String, state_data: Option<String>) {
        if let Some(data) = state_data {
            if let Ok(mut guard) = self.latest_state.write() {
                *guard = Some(data);
            }
        }
        let _ = self.tx.send(text);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.tx.subscribe()
    }

    pub fn subscribe_actions(&self) -> broadcast::Receiver<ActionRequest> {
        self.actions_tx.subscribe()
    }

    /// Queues an operator action for the action listener task.
    pub fn dispatch(&self, action: ActionRequest) {
        let _ = self.actions_tx.send(action);
    }

    pub fn cached_state(&self) -> Option<String> {
        self.latest_state
            .read()
            .ok()
            .and_then(|guard| guard.clone())
    }

    /// Replaces the cached state (used by tests and by the delay flusher).
    pub fn set_cached_state(&self, data: Option<String>) {
        if let Ok(mut guard) = self.latest_state.write() {
            *guard = data;
        }
    }

    pub fn delay_seconds(&self) -> u64 {
        self.delay_secs.load(Ordering::Relaxed)
    }

    /// Sets the broadcast delay. Already queued events keep their original due
    /// time; new events use the new delay.
    pub fn set_delay_seconds(&self, seconds: u64) {
        self.delay_secs.store(seconds, Ordering::Relaxed);
    }

    pub fn client_count(&self) -> usize {
        self.client_count.load(Ordering::SeqCst)
    }

    pub fn client_connected(&self) {
        self.client_count.fetch_add(1, Ordering::SeqCst);
    }

    pub fn client_disconnected(&self) {
        self.client_count.fetch_sub(1, Ordering::SeqCst);
    }
}

/// Broadcast states the Control Room can switch between.
pub const BROADCAST_STATES: &[&str] = &["waiting", "live", "replay", "post", "brb"];

pub fn is_broadcast_state(value: &str) -> bool {
    BROADCAST_STATES.contains(&value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn publish_without_delay_delivers_immediately() {
        let hub = BroadcastHub::new();
        let mut rx = hub.subscribe();
        hub.publish_typed("match_started", None);

        let message: Value = serde_json::from_str(&rx.try_recv().unwrap()).unwrap();
        assert_eq!(message["type"], "match_started");
        assert_eq!(message["v"], 2);
        assert!(message["seq"].is_number());
        assert!(message["ts"].is_number());
    }

    #[test]
    fn publish_queues_until_delay_elapses() {
        let hub = BroadcastHub::new();
        hub.set_delay_seconds(60);
        let mut rx = hub.subscribe();
        hub.publish_typed("chat", Some(json!({ "user": "alice" })));

        assert!(rx.try_recv().is_err(), "event must wait for the delay");

        hub.set_delay_seconds(0);
        // The queued item is still due in 60s, so flushing now delivers
        // nothing; simulate the wait by rewriting the due time.
        {
            let mut queue = hub.pending.lock().unwrap();
            queue.front_mut().unwrap().due = Instant::now();
        }
        assert_eq!(hub.flush_due(), 1);

        let message: Value = serde_json::from_str(&rx.try_recv().unwrap()).unwrap();
        assert_eq!(message["type"], "chat");
        assert_eq!(message["data"]["user"], "alice");
    }

    #[test]
    fn delayed_state_updates_the_cache_only_when_delivered() {
        let hub = BroadcastHub::new();
        hub.set_delay_seconds(30);
        hub.publish_typed("state", Some(json!({ "scoreBlue": 1 })));
        assert!(hub.cached_state().is_none());

        {
            let mut queue = hub.pending.lock().unwrap();
            queue.front_mut().unwrap().due = Instant::now();
        }
        hub.flush_due();
        let cached: Value = serde_json::from_str(&hub.cached_state().unwrap()).unwrap();
        assert_eq!(cached["scoreBlue"], 1);
    }

    #[test]
    fn delay_is_clamped_by_max_pending_window() {
        let hub = BroadcastHub::new();
        hub.set_delay_seconds(300);
        for index in 0..5000 {
            hub.publish_typed("clock", Some(json!({ "time": index })));
        }
        assert!(hub.pending.lock().unwrap().len() <= 4096);
    }

    #[test]
    fn actions_are_dispatched_to_subscribers() {
        let hub = BroadcastHub::new();
        let mut rx = hub.subscribe_actions();
        hub.dispatch(ActionRequest::new("set_state", json!({ "state": "live" })));
        let action = rx.try_recv().unwrap();
        assert_eq!(action.action, "set_state");
        assert_eq!(action.str_field("state"), Some("live"));
    }
}
