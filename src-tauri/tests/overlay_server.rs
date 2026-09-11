//! Integration tests for the OBS overlay server.
//!
//! These exercise the real Axum server over TCP: the wire contract every
//! overlay depends on, the hardening headers, and the Origin/token guard.

use rl_stats_lib::core::overlay::OverlayServer;

fn free_port() -> u16 {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind ephemeral port");
    listener.local_addr().expect("local addr").port()
}

async fn wait_until_ready(client: &reqwest::Client, url: &str) {
    for _ in 0..40 {
        if client.get(url).send().await.is_ok() {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    panic!("overlay server did not become ready at {url}");
}

#[tokio::test]
async fn serves_overlay_assets_with_security_headers() {
    let port = free_port();
    let mut server = OverlayServer::new(port);
    server.start().await.expect("server starts");

    let client = reqwest::Client::new();
    let base = format!("http://127.0.0.1:{port}");
    wait_until_ready(&client, &format!("{base}/overlays/scoreboard.html")).await;

    let response = client
        .get(format!("{base}/overlays/scoreboard.html"))
        .send()
        .await
        .expect("overlay fetch");
    assert_eq!(response.status(), 200);

    let headers = response.headers();
    assert!(
        headers.contains_key("content-security-policy"),
        "overlay responses must carry a CSP"
    );
    assert_eq!(
        headers.get("x-content-type-options").map(|v| v.as_bytes()),
        Some(b"nosniff".as_slice())
    );
    assert_eq!(
        headers.get("x-frame-options").map(|v| v.as_bytes()),
        Some(b"DENY".as_slice())
    );

    let body = response.text().await.expect("overlay body");
    assert!(
        !body.contains("fonts.googleapis.com"),
        "overlays must not load remote fonts"
    );
    assert!(
        body.contains("/sdk/rl-overlay.js"),
        "overlays must use the bundled SDK"
    );

    server.stop();
}

#[tokio::test]
async fn state_endpoint_rejects_foreign_origin_and_accepts_token() {
    let port = free_port();
    let mut server = OverlayServer::new(port);
    server.start().await.expect("server starts");
    let token = server.token().to_string();

    let client = reqwest::Client::new();
    let base = format!("http://127.0.0.1:{port}");
    wait_until_ready(&client, &format!("{base}/overlays/index.html")).await;

    let foreign = client
        .get(format!("{base}/api/state"))
        .header("Origin", "https://evil.example")
        .send()
        .await
        .expect("foreign request");
    assert_eq!(foreign.status(), 403, "foreign origins must be rejected");

    let bare = client
        .get(format!("{base}/api/state"))
        .send()
        .await
        .expect("bare request");
    assert_eq!(bare.status(), 200, "non-browser clients are allowed");

    let tokenized = client
        .get(format!("{base}/api/state?token={token}"))
        .send()
        .await
        .expect("token request");
    assert_eq!(tokenized.status(), 200, "a valid token authorizes");

    server.stop();
}

#[tokio::test]
async fn overlay_assets_do_not_inject_player_names_as_html() {
    // The bundled assets must never assign untrusted data through innerHTML.
    // Player names are attacker-controlled (anyone can set a gamertag).
    let assets = [
        include_str!("../overlays/scoreboard.html"),
        include_str!("../overlays/player-stats.html"),
        include_str!("../overlays/event-feed.html"),
        include_str!("../overlays/all-in-one.html"),
        include_str!("../overlays/enhanced.html"),
        include_str!("../overlays/alerts.html"),
    ];
    for asset in assets {
        assert!(
            !asset.contains(".innerHTML"),
            "overlay assets must build DOM nodes instead of innerHTML"
        );
    }
}
