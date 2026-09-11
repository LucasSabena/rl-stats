use crate::core::models::{ConnectionStatus, RlEvent};
use crate::core::parser::parse_event;
use crate::error::AppResult;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tokio::io::AsyncReadExt;
use tokio::net::TcpStream;
use tokio::sync::{mpsc, RwLock};
use tokio::time::{sleep, Duration};
use tracing::{debug, error, info, warn};

/// Default Rocket League Stats API TCP port.
pub const DEFAULT_RL_PORT: u16 = 49123;
pub const DEFAULT_RL_HOST: &str = "127.0.0.1";
const MAX_PENDING_BYTES: usize = 4 * 1024 * 1024;

/// Ingestor handle returned to the application layer.
pub struct IngestorHandle {
    pub event_rx: mpsc::Receiver<RlEvent>,
    pub status: Arc<RwLock<ConnectionStatus>>,
    pub game_running: Arc<AtomicBool>,
}

/// Start the TCP ingestor as a background Tokio task.
/// Returns a channel receiver for parsed events and a shared connection status.
pub fn start_ingestor(port: u16, game_running: Arc<AtomicBool>) -> IngestorHandle {
    let (event_tx, event_rx) = mpsc::channel::<RlEvent>(1024);
    let status = Arc::new(RwLock::new(ConnectionStatus {
        connected: false,
        address: format!("{}:{}", DEFAULT_RL_HOST, port),
        last_error: None,
        reconnect_attempts: 0,
        game_running: false,
    }));

    let status_clone = Arc::clone(&status);
    let game_running_clone = Arc::clone(&game_running);
    thread::spawn(move || {
        let rt = match tokio::runtime::Runtime::new() {
            Ok(runtime) => runtime,
            Err(error) => {
                error!(%error, "Failed to create the ingestor runtime");
                return;
            }
        };
        rt.block_on(async move {
            if let Err(e) = ingestor_loop(status_clone, event_tx, port, game_running_clone).await {
                error!(error = %e, "Ingestor loop terminated unexpectedly");
            }
        });
    });

    IngestorHandle {
        event_rx,
        status,
        game_running,
    }
}

async fn ingestor_loop(
    status: Arc<RwLock<ConnectionStatus>>,
    event_tx: mpsc::Sender<RlEvent>,
    port: u16,
    game_running: Arc<AtomicBool>,
) -> AppResult<()> {
    let mut backoff_seconds = 1u64;
    let max_backoff = 5u64;

    loop {
        // Before attempting to connect, check if the game is running.
        // If not, use a slow poll interval to avoid spamming connection attempts.
        if !game_running.load(Ordering::SeqCst) {
            sleep(Duration::from_secs(5)).await;
            // Update status to reflect game is not running
            {
                let mut s = status.write().await;
                s.connected = false;
                s.game_running = false;
                if s.last_error.is_none() {
                    s.last_error = Some("Rocket League is not running".into());
                }
            }
            continue;
        }

        let address = format!("{}:{}", DEFAULT_RL_HOST, port);
        info!(%address, "Attempting to connect to Rocket League Stats API");

        {
            let mut s = status.write().await;
            s.game_running = true;
        }

        match TcpStream::connect(&address).await {
            Ok(stream) => {
                info!(%address, "Connected to Rocket League Stats API");
                {
                    let mut s = status.write().await;
                    s.connected = true;
                    s.last_error = None;
                    s.reconnect_attempts = 0;
                }
                backoff_seconds = 1;

                if let Err(e) = read_events(stream, &event_tx, &status).await {
                    warn!(error = %e, "Connection lost, will reconnect");
                    {
                        let mut s = status.write().await;
                        s.connected = false;
                        s.last_error = Some(e.to_string());
                    }
                }
            }
            Err(e) => {
                let err_msg = format!("Failed to connect: {}", e);
                warn!(%err_msg);
                {
                    let mut s = status.write().await;
                    s.connected = false;
                    s.last_error = Some(err_msg);
                    s.reconnect_attempts += 1;
                }
            }
        }

        // After connection loss or failure, wait with backoff before retrying.
        info!(seconds = backoff_seconds, "Waiting before reconnect");
        sleep(Duration::from_secs(backoff_seconds)).await;
        backoff_seconds = (backoff_seconds * 2).min(max_backoff);
    }
}

async fn read_events(
    stream: TcpStream,
    event_tx: &mpsc::Sender<RlEvent>,
    status: &Arc<RwLock<ConnectionStatus>>,
) -> AppResult<()> {
    let mut stream = stream;
    let mut read_buffer = [0u8; 8192];
    let mut pending = String::new();

    loop {
        let bytes_read = stream.read(&mut read_buffer).await?;
        if bytes_read == 0 {
            break;
        }

        let chunk = String::from_utf8_lossy(&read_buffer[..bytes_read]);
        debug!(bytes_read, "Received stats API chunk");
        pending.push_str(&chunk);

        if pending.len() > MAX_PENDING_BYTES {
            warn!(
                pending_bytes = pending.len(),
                "Discarding oversized incomplete Stats API payload"
            );
            if let Some(last_object) = pending.rfind('{') {
                pending.drain(..last_object);
            } else {
                pending.clear();
            }
        }

        let messages = extract_json_messages(&mut pending);
        for message in messages {
            match parse_event(&message) {
                Ok(event) => {
                    if event_tx.send(event).await.is_err() {
                        error!("Event channel closed, stopping ingestor read loop");
                        return Err(crate::error::AppError::ConnectionError(
                            "Event channel closed".into(),
                        ));
                    }
                }
                Err(e) => {
                    warn!(error = %e, payload_bytes = message.len(), "Failed to parse event");
                }
            }
        }
    }

    {
        let mut s = status.write().await;
        s.connected = false;
        s.last_error = Some("Stream ended".into());
    }

    Ok(())
}

fn extract_json_messages(buffer: &mut String) -> Vec<String> {
    let mut messages = Vec::new();
    let chars: Vec<(usize, char)> = buffer.char_indices().collect();
    let mut start_index: Option<usize> = None;
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escaped = false;
    let mut consumed_until = 0usize;

    for (byte_index, ch) in chars {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }
            match ch {
                '\\' => escaped = true,
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' => {
                if depth == 0 {
                    start_index = Some(byte_index);
                }
                depth += 1;
            }
            '}' if depth > 0 => {
                depth -= 1;
                if depth == 0 {
                    if let Some(start) = start_index {
                        let end = byte_index + ch.len_utf8();
                        messages.push(buffer[start..end].to_string());
                        consumed_until = end;
                        start_index = None;
                    }
                }
            }
            _ => {}
        }
    }

    if consumed_until > 0 {
        buffer.drain(..consumed_until);
    }

    if depth == 0 && buffer.trim().is_empty() {
        buffer.clear();
    }

    messages
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncWriteExt;

    fn feed(buffer: &mut String, chunks: &[&str]) -> Vec<String> {
        let mut messages = Vec::new();
        for chunk in chunks {
            buffer.push_str(chunk);
            messages.extend(extract_json_messages(buffer));
        }
        messages
    }

    #[test]
    fn extracts_multiple_concatenated_objects_and_keeps_trailing_garbage() {
        let mut buffer = String::from(r#"{"Event":"A"}{"Event":"B"}tail"#);
        let messages = extract_json_messages(&mut buffer);
        assert_eq!(messages, vec![r#"{"Event":"A"}"#, r#"{"Event":"B"}"#]);
        assert_eq!(buffer, "tail");
    }

    #[test]
    fn reassembles_object_split_across_chunks() {
        let mut buffer = String::new();
        let messages = feed(&mut buffer, &[r##"{"Event":"Match"##, "Created\"}"]);
        assert_eq!(messages, vec![r#"{"Event":"MatchCreated"}"#]);
        assert!(buffer.is_empty());
    }

    #[test]
    fn keeps_incomplete_object_in_buffer() {
        let mut buffer = String::from(r#"{"Event":"Unfinished"#);
        let messages = extract_json_messages(&mut buffer);
        assert!(messages.is_empty());
        assert_eq!(buffer, r#"{"Event":"Unfinished"#);
    }

    #[test]
    fn ignores_braces_and_quotes_inside_strings() {
        let mut buffer = String::from(r#"{"Data":"{\"a\":\"}\"}"}"#);
        let messages = extract_json_messages(&mut buffer);
        assert_eq!(messages, vec![r#"{"Data":"{\"a\":\"}\"}"}"#]);
        assert!(serde_json::from_str::<serde_json::Value>(&messages[0]).is_ok());
        assert!(buffer.is_empty());
    }

    #[test]
    fn handles_escaped_backslashes_before_closing_quote() {
        let mut buffer = String::from(r#"{"a":"\\"}"#);
        let messages = extract_json_messages(&mut buffer);
        assert_eq!(messages, vec![r#"{"a":"\\"}"#]);
        assert!(serde_json::from_str::<serde_json::Value>(&messages[0]).is_ok());
        assert!(buffer.is_empty());
    }

    #[test]
    fn empty_and_whitespace_buffers_yield_nothing() {
        let mut empty = String::new();
        assert!(extract_json_messages(&mut empty).is_empty());
        assert!(empty.is_empty());

        let mut whitespace = String::from("   \n\t ");
        assert!(extract_json_messages(&mut whitespace).is_empty());
        assert!(whitespace.is_empty());
    }

    #[test]
    fn skips_garbage_before_and_between_nested_objects() {
        let mut buffer = String::from(r#"noise{"a":1} junk {"b":{"c":2}}"#);
        let messages = extract_json_messages(&mut buffer);
        assert_eq!(messages, vec![r#"{"a":1}"#, r#"{"b":{"c":2}}"#]);
        assert!(buffer.is_empty());
    }

    #[tokio::test]
    async fn read_events_reassembles_chunked_stream_into_parsed_events() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let writer = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            // One event split across two writes, then a second event.
            socket
                .write_all(br#"{"Event":"MatchCreated"}{"Event":"Match"#)
                .await
                .unwrap();
            tokio::time::sleep(Duration::from_millis(20)).await;
            socket.write_all(br#"Initialized"}"#).await.unwrap();
            tokio::time::sleep(Duration::from_millis(20)).await;
        });

        let (event_tx, mut event_rx) = mpsc::channel::<RlEvent>(16);
        let status = Arc::new(RwLock::new(ConnectionStatus {
            connected: true,
            address: "test".into(),
            last_error: None,
            reconnect_attempts: 0,
            game_running: true,
        }));

        let stream = TcpStream::connect(addr).await.unwrap();
        read_events(stream, &event_tx, &status).await.unwrap();
        writer.await.unwrap();

        let first = event_rx.recv().await.unwrap();
        let second = event_rx.recv().await.unwrap();
        assert!(matches!(first, RlEvent::MatchCreated));
        assert!(matches!(second, RlEvent::MatchInitialized));

        let snapshot = status.read().await;
        assert!(!snapshot.connected);
        assert_eq!(snapshot.last_error.as_deref(), Some("Stream ended"));
    }
}
