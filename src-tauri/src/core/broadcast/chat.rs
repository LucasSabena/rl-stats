//! Read-only chat integration (Twitch + Kick).
//!
//! Both platforms are consumed over WebSockets from Rust: Twitch's IRC-over-
//! WebSocket gateway and Kick's Pusher channel. Running them here (instead of
//! in the overlay page) means:
//!
//! - Kick's Pusher endpoint, which rejects browser connections from
//!   `localhost` origins, works because the client is not a browser;
//! - a single connection feeds the OBS overlay, the Control Room and the dock;
//! - credentials (none needed for reading) never reach the page.
//!
//! Messages are normalized to [`ChatMessage`] and published on the broadcast
//! hub as `{"type":"chat"}` events.

use super::{BroadcastHub, ChatEmote, ChatMessage};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tracing::{debug, info};

const TWITCH_GATEWAY: &str = "wss://irc-ws.chat.twitch.tv:443";
const KICK_PUSHER: &str = "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.6.0&flash=false";
const TWITCH_EMOTE_CDN: &str = "https://static-cdn.jtvnw.net/emoticons/v2";
const KICK_EMOTE_CDN: &str = "https://files.kick.com/emotes";

/// Owns the background chat readers. One task per platform; starting a
/// platform again replaces the previous connection.
#[derive(Clone)]
pub struct ChatManager {
    hub: BroadcastHub,
    tasks: std::sync::Arc<Mutex<HashMap<String, JoinHandle<()>>>>,
}

impl ChatManager {
    pub fn new(hub: BroadcastHub) -> Self {
        Self {
            hub,
            tasks: std::sync::Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn is_running(&self, platform: &str) -> bool {
        self.tasks
            .lock()
            .map(|tasks| tasks.contains_key(platform))
            .unwrap_or(false)
    }

    pub fn running_platforms(&self) -> Vec<String> {
        self.tasks
            .lock()
            .map(|tasks| tasks.keys().cloned().collect())
            .unwrap_or_default()
    }

    /// Starts (or restarts) the Twitch reader for `channel`.
    pub fn start_twitch(&self, channel: &str) {
        let channel = channel.trim().trim_start_matches('#').to_ascii_lowercase();
        if channel.is_empty() {
            return;
        }
        let hub = self.hub.clone();
        self.spawn("twitch", async move {
            twitch_loop(hub, channel).await;
        });
    }

    /// Starts (or restarts) the Kick reader for `channel` (slug).
    pub fn start_kick(&self, channel: &str) {
        let channel = channel.trim().trim_start_matches('@').to_ascii_lowercase();
        if channel.is_empty() {
            return;
        }
        let hub = self.hub.clone();
        self.spawn("kick", async move {
            kick_loop(hub, channel).await;
        });
    }

    pub fn stop(&self, platform: &str) {
        if let Ok(mut tasks) = self.tasks.lock() {
            if let Some(handle) = tasks.remove(platform) {
                handle.abort();
                info!(platform, "Chat reader stopped");
            }
        }
    }

    pub fn stop_all(&self) {
        if let Ok(mut tasks) = self.tasks.lock() {
            for (platform, handle) in tasks.drain() {
                handle.abort();
                info!(platform, "Chat reader stopped");
            }
        }
    }

    fn spawn(&self, platform: &str, task: impl std::future::Future<Output = ()> + Send + 'static) {
        if let Ok(mut tasks) = self.tasks.lock() {
            if let Some(previous) = tasks.remove(platform) {
                previous.abort();
            }
            tasks.insert(platform.to_string(), tokio::spawn(task));
            info!(platform, "Chat reader started");
        }
    }
}

// ---------------------------------------------------------------------------
// Twitch
// ---------------------------------------------------------------------------

async fn twitch_loop(hub: BroadcastHub, channel: String) {
    let mut backoff = 2u64;
    loop {
        if let Err(error) = twitch_connect(&hub, &channel).await {
            debug!(error = %error, "Twitch chat connection ended");
        }
        tokio::time::sleep(Duration::from_secs(backoff)).await;
        backoff = (backoff * 2).min(30);
    }
}

async fn twitch_connect(hub: &BroadcastHub, channel: &str) -> Result<(), String> {
    let request = TWITCH_GATEWAY
        .into_client_request()
        .map_err(|error| error.to_string())?;
    let (mut socket, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|error| error.to_string())?;

    // Anonymous read-only login (justinfan).
    let nick = format!(
        "justinfan{}",
        (chrono::Utc::now().timestamp_millis() % 90_000) + 10_000
    );
    socket
        .send(WsMessage::Text(
            "PASS justinfan12345\r\n".to_string().into(),
        ))
        .await
        .map_err(|error| error.to_string())?;
    socket
        .send(WsMessage::Text(format!("NICK {nick}\r\n").into()))
        .await
        .map_err(|error| error.to_string())?;
    socket
        .send(WsMessage::Text(format!("JOIN #{channel}\r\n").into()))
        .await
        .map_err(|error| error.to_string())?;

    while let Some(message) = socket.next().await {
        let message = message.map_err(|error| error.to_string())?;
        let text = match message {
            WsMessage::Text(text) => text.to_string(),
            WsMessage::Ping(payload) => {
                let _ = socket.send(WsMessage::Pong(payload)).await;
                continue;
            }
            _ => continue,
        };

        for line in text.lines() {
            if line.starts_with("PING") {
                let _ = socket
                    .send(WsMessage::Text("PONG :tmi.twitch.tv\r\n".into()))
                    .await;
                continue;
            }
            if let Some(message) = parse_twitch_privmsg(line) {
                hub.publish_typed(
                    "chat",
                    Some(serde_json::to_value(message).unwrap_or_default()),
                );
            }
        }
    }

    Err("Gateway closed".into())
}

fn parse_tag_value(raw: &str) -> Option<(&str, &str)> {
    let (key, value) = raw.split_once('=')?;
    Some((key, value))
}

/// Parses a Twitch IRC `PRIVMSG` line into a normalized chat message.
pub fn parse_twitch_privmsg(line: &str) -> Option<ChatMessage> {
    let mut rest = line;
    let mut tags = HashMap::new();

    if let Some(stripped) = rest.strip_prefix('@') {
        let (tag_section, remainder) = stripped.split_once(' ')?;
        for raw in tag_section.split(';') {
            if let Some((key, value)) = parse_tag_value(raw) {
                tags.insert(key.to_string(), value.to_string());
            }
        }
        rest = remainder;
    }

    // Prefix, command, channel, then ":" message.
    let (prefix, remainder) = rest.split_once(' ')?;
    let mut parts = remainder.splitn(3, ' ');
    let command = parts.next()?;
    if command != "PRIVMSG" {
        return None;
    }
    let _channel = parts.next()?;
    let body = parts.next()?.trim_start_matches(':');
    let user = prefix
        .trim_start_matches(':')
        .split('!')
        .next()
        .unwrap_or("")
        .to_string();

    let display_name = tags
        .get("display-name")
        .filter(|value| !value.is_empty())
        .cloned()
        .unwrap_or_else(|| user.clone());

    let color = tags
        .get("color")
        .filter(|value| value.starts_with('#') && value.len() == 7)
        .cloned();

    let badges: Vec<String> = tags
        .get("badges")
        .map(|value| {
            value
                .split(',')
                .filter(|entry| !entry.is_empty())
                .map(|entry| entry.split('/').next().unwrap_or(entry).to_string())
                .collect()
        })
        .unwrap_or_default();

    let mut emotes = Vec::new();
    if let Some(ranges) = tags.get("emotes") {
        for entry in ranges.split('/') {
            let Some((id, positions)) = entry.split_once(':') else {
                continue;
            };
            let Some((start, end)) = positions.split_once('-') else {
                continue;
            };
            let (Ok(start), Ok(end)) = (start.parse::<usize>(), end.parse::<usize>()) else {
                continue;
            };
            // IRC positions are in code points, not bytes.
            let chars: Vec<char> = body.chars().collect();
            if start > end || end >= chars.len() {
                continue;
            }
            let name: String = chars[start..=end].iter().collect();
            emotes.push(ChatEmote {
                name,
                url: format!("{TWITCH_EMOTE_CDN}/{id}/default/dark/2.0"),
            });
        }
    }

    Some(ChatMessage {
        platform: "twitch".into(),
        user: display_name,
        text: body.to_string(),
        color,
        badges,
        emotes,
        timestamp: chrono::Utc::now().timestamp_millis(),
    })
}

// ---------------------------------------------------------------------------
// Kick
// ---------------------------------------------------------------------------

async fn kick_loop(hub: BroadcastHub, channel: String) {
    let mut backoff = 3u64;
    loop {
        if let Err(error) = kick_connect(&hub, &channel).await {
            debug!(error = %error, "Kick chat connection ended");
        }
        tokio::time::sleep(Duration::from_secs(backoff)).await;
        backoff = (backoff * 2).min(45);
    }
}

async fn kick_chatroom_id(channel: &str) -> Result<i64, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) RLStats/1.0")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;
    let url = format!("https://kick.com/api/v2/channels/{channel}");
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Kick API responded {}", response.status()));
    }
    let payload: Value = response.json().await.map_err(|error| error.to_string())?;
    payload
        .get("chatroom")
        .and_then(|chatroom| chatroom.get("id"))
        .and_then(Value::as_i64)
        .ok_or_else(|| format!("Kick channel '{channel}' has no chatroom"))
}

async fn kick_connect(hub: &BroadcastHub, channel: &str) -> Result<(), String> {
    let chatroom_id = kick_chatroom_id(channel).await?;
    info!(channel, chatroom_id, "Kick chatroom resolved");

    let mut request = KICK_PUSHER
        .into_client_request()
        .map_err(|error| error.to_string())?;
    // Pusher rejects connections without a browser-looking origin.
    request.headers_mut().insert(
        "Origin",
        "https://kick.com"
            .parse()
            .map_err(|error| format!("{error:?}"))?,
    );
    request.headers_mut().insert(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RLStats/1.0"
            .parse()
            .map_err(|error| format!("{error:?}"))?,
    );

    let (mut socket, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|error| error.to_string())?;

    let subscribe = serde_json::json!({
        "event": "pusher:subscribe",
        "data": { "auth": "", "channel": format!("chatrooms.{chatroom_id}.v2") }
    });
    socket
        .send(WsMessage::Text(subscribe.to_string().into()))
        .await
        .map_err(|error| error.to_string())?;

    let mut emotes_cache: HashMap<i64, String> = HashMap::new();

    while let Some(message) = socket.next().await {
        let message = message.map_err(|error| error.to_string())?;
        let text = match message {
            WsMessage::Text(text) => text.to_string(),
            WsMessage::Ping(payload) => {
                let _ = socket.send(WsMessage::Pong(payload)).await;
                continue;
            }
            _ => continue,
        };

        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        if value.get("event").and_then(Value::as_str) != Some("App\\Events\\ChatMessageEvent") {
            continue;
        }
        let Some(data) = value.get("data").and_then(Value::as_str) else {
            continue;
        };
        let Ok(payload) = serde_json::from_str::<Value>(data) else {
            continue;
        };
        if let Some(message) = parse_kick_message(&payload, &mut emotes_cache) {
            hub.publish_typed(
                "chat",
                Some(serde_json::to_value(message).unwrap_or_default()),
            );
        }
    }

    Err("Pusher closed".into())
}

/// Parses a Kick `ChatMessageEvent` payload into a normalized chat message.
/// Kick sends emotes inline as `[emote:12345:name]`.
pub fn parse_kick_message(
    payload: &Value,
    emotes_cache: &mut HashMap<i64, String>,
) -> Option<ChatMessage> {
    let content = payload.get("content")?.as_str()?;
    let sender = payload.get("sender")?;
    let user = sender
        .get("username")
        .or_else(|| sender.get("slug"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let color = sender
        .get("identity")
        .and_then(|identity| identity.get("color"))
        .and_then(Value::as_str)
        .filter(|value| value.starts_with('#') && value.len() == 7)
        .map(str::to_string);
    let badges = payload
        .get("sender")
        .and_then(|sender| sender.get("identity"))
        .and_then(|identity| identity.get("badges"))
        .and_then(Value::as_array)
        .map(|badges| {
            badges
                .iter()
                .filter_map(|badge| badge.get("type").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    let mut text = content.to_string();
    let mut emotes = Vec::new();
    // Replace `[emote:id:name]` tokens with their name and remember the CDN URL.
    while let Some(start) = text.find("[emote:") {
        let Some(end) = text[start..].find(']').map(|offset| start + offset) else {
            break;
        };
        let token = text[start + 7..end].to_string();
        let mut parts = token.splitn(2, ':');
        let id = parts.next().unwrap_or("").to_string();
        let name = parts.next().unwrap_or("").to_string();
        if let Ok(id) = id.parse::<i64>() {
            emotes_cache.insert(id, name.clone());
            emotes.push(ChatEmote {
                name: name.clone(),
                url: format!("{KICK_EMOTE_CDN}/{id}/fullsize"),
            });
            text.replace_range(start..=end, &name);
        } else {
            break;
        }
    }

    Some(ChatMessage {
        platform: "kick".into(),
        user,
        text,
        color,
        badges,
        emotes,
        timestamp: chrono::Utc::now().timestamp_millis(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_twitch_privmsg_with_tags() {
        let line = "@badge-info=subscriber/3;badges=moderator/1,subscriber/12;color=#1E90FF;display-name=Alice;emotes=25:5-9/1902:11-13;id=abc123 :alice!alice@alice.tmi.twitch.tv PRIVMSG #channel :Hola Kappa LUL";
        let message = parse_twitch_privmsg(line).expect("parses");
        assert_eq!(message.platform, "twitch");
        assert_eq!(message.user, "Alice");
        assert_eq!(message.color.as_deref(), Some("#1E90FF"));
        assert_eq!(message.badges, vec!["moderator", "subscriber"]);
        assert_eq!(message.text, "Hola Kappa LUL");
        // "Kappa" occupies chars 5..=9 and "LUL" chars 11..=13.
        assert_eq!(message.emotes.len(), 2);
        assert_eq!(message.emotes[0].name, "Kappa");
        assert!(message.emotes[0].url.contains("/25/default/dark/2.0"));
        assert_eq!(message.emotes[1].name, "LUL");
    }

    #[test]
    fn ignores_non_privmsg_lines() {
        assert!(parse_twitch_privmsg("PING :tmi.twitch.tv").is_none());
        assert!(parse_twitch_privmsg(":tmi.twitch.tv 001 justinfan123 :Welcome").is_none());
    }

    #[test]
    fn twitch_message_without_tags_still_parses() {
        let line = ":bob!bob@bob.tmi.twitch.tv PRIVMSG #chan :hello world";
        let message = parse_twitch_privmsg(line).unwrap();
        assert_eq!(message.user, "bob");
        assert_eq!(message.text, "hello world");
        assert!(message.emotes.is_empty());
        assert!(message.color.is_none());
    }

    #[test]
    fn parses_kick_message_with_emotes() {
        let payload = serde_json::json!({
            "content": "gg [emote:37226:KEKW] team",
            "sender": {
                "username": "KickUser",
                "identity": {
                    "color": "#00FF00",
                    "badges": [{ "type": "subscriber" }]
                }
            }
        });
        let mut cache = HashMap::new();
        let message = parse_kick_message(&payload, &mut cache).unwrap();
        assert_eq!(message.platform, "kick");
        assert_eq!(message.user, "KickUser");
        assert_eq!(message.text, "gg KEKW team");
        assert_eq!(
            message.emotes[0].url,
            "https://files.kick.com/emotes/37226/fullsize"
        );
        assert!(cache.contains_key(&37226));
    }

    #[test]
    fn kick_message_without_sender_is_ignored() {
        let payload = serde_json::json!({ "content": "hi" });
        let mut cache = HashMap::new();
        assert!(parse_kick_message(&payload, &mut cache).is_none());
    }
}
