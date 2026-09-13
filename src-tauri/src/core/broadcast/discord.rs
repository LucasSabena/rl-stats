//! Discord notifications for tournament operations.
//!
//! The webhook URL is a credential: it is stripped from cloud sync, kept only
//! on this device and validated against Discord's own hostnames before any
//! request, so a tampered settings row cannot turn the app into an SSRF
//! proxy.

use crate::core::settings::get_settings;
use crate::core::storage::DbPool;
use serde_json::json;

const ALLOWED_PREFIXES: &[&str] = &[
    "https://discord.com/api/webhooks/",
    "https://discordapp.com/api/webhooks/",
    "https://canary.discord.com/api/webhooks/",
    "https://ptb.discord.com/api/webhooks/",
];

/// Whether `url` is a Discord webhook endpoint. Anything else is rejected.
pub fn is_valid_webhook(url: &str) -> bool {
    let url = url.trim();
    ALLOWED_PREFIXES
        .iter()
        .any(|prefix| url.len() > prefix.len() && url.starts_with(prefix))
}

/// Fire-and-forget notification using the configured webhook, if any.
pub fn notify(pool: &DbPool, content: &str) {
    let Ok(settings) = get_settings(pool) else {
        return;
    };
    let webhook = settings.discord_webhook.trim().to_string();
    if webhook.is_empty() || !is_valid_webhook(&webhook) {
        return;
    }
    let content = content.to_string();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = send(&webhook, &content).await {
            tracing::warn!(error = %error, "Discord notification failed");
        }
    });
}

pub async fn send(webhook: &str, content: &str) -> Result<(), String> {
    if !is_valid_webhook(webhook) {
        return Err("Webhook de Discord inválido".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .post(webhook.trim())
        .json(&json!({ "content": content }))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Discord respondió {}", response.status()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn webhook_validation_only_allows_discord_hosts() {
        assert!(is_valid_webhook(
            "https://discord.com/api/webhooks/123456/abcdef"
        ));
        assert!(is_valid_webhook(
            "https://canary.discord.com/api/webhooks/1/x"
        ));
        assert!(!is_valid_webhook("https://evil.com/api/webhooks/1/x"));
        assert!(!is_valid_webhook("http://discord.com/api/webhooks/1/x"));
        assert!(!is_valid_webhook(
            "https://discord.com.evil.com/api/webhooks/1/x"
        ));
        assert!(!is_valid_webhook("https://discord.com/api/webhooks/"));
        assert!(!is_valid_webhook(""));
    }
}
