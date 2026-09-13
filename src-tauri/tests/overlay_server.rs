//! Integration tests for the OBS overlay server.
//!
//! These exercise the real Axum server over TCP: the wire contract every
//! overlay depends on, the hardening headers, the Origin/token guard and the
//! v2 broadcast API (packs, scene, actions).

use rl_stats_lib::core::overlay::{AuthToken, OverlayServer};

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

fn server_with_admin(port: u16) -> OverlayServer {
    let mut server = OverlayServer::new(port);
    server.set_tokens(vec![
        AuthToken {
            token: "admin-test".into(),
            role: "admin".into(),
        },
        AuthToken {
            token: "viewer-test".into(),
            role: "viewer".into(),
        },
    ]);
    server
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
    let csp = headers
        .get("content-security-policy")
        .and_then(|value| value.to_str().ok())
        .expect("overlay responses must carry a CSP");
    assert!(
        csp.contains("frame-ancestors 'self'"),
        "the in-app preview must be allowed to frame overlays: {csp}"
    );
    assert_eq!(
        headers.get("x-content-type-options").map(|v| v.as_bytes()),
        Some(b"nosniff".as_slice())
    );
    assert!(
        !headers.contains_key("x-frame-options"),
        "X-Frame-Options DENY used to break the in-app preview"
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
    let mut server = server_with_admin(port);
    server.start().await.expect("server starts");

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
        .get(format!("{base}/api/state?token=admin-test"))
        .send()
        .await
        .expect("token request");
    assert_eq!(tokenized.status(), 200, "a valid token authorizes");

    server.stop();
}

#[tokio::test]
async fn v2_packs_requires_auth_and_returns_builtin_packs() {
    let port = free_port();
    let mut server = server_with_admin(port);
    server.start().await.expect("server starts");

    let client = reqwest::Client::new();
    let base = format!("http://127.0.0.1:{port}");
    wait_until_ready(&client, &format!("{base}/health")).await;

    let foreign = client
        .get(format!("{base}/api/v2/packs"))
        .header("Origin", "https://evil.example")
        .send()
        .await
        .expect("foreign request");
    assert_eq!(foreign.status(), 403);

    let allowed = client
        .get(format!("{base}/api/v2/packs?token=admin-test"))
        .send()
        .await
        .expect("token request");
    assert_eq!(allowed.status(), 200);
    let payload: serde_json::Value = allowed.json().await.expect("json");
    assert!(
        payload["packs"].as_array().unwrap().len() >= 6,
        "built-in packs must ship with the binary"
    );
    assert!(payload["fonts"].as_array().unwrap().len() >= 4);

    // The scene endpoint must never fail without a database: it falls back to
    // the built-in defaults.
    let scene: serde_json::Value = client
        .get(format!(
            "{base}/api/v2/scene?token=admin-test&state=waiting"
        ))
        .send()
        .await
        .expect("scene request")
        .json()
        .await
        .expect("scene json");
    assert_eq!(scene["state"], "waiting");
    assert!(!scene["layout"].as_object().unwrap().is_empty());

    server.stop();
}

#[tokio::test]
async fn v2_action_respects_roles_and_dispatches_to_the_hub() {
    let port = free_port();
    let mut server = server_with_admin(port);
    let mut actions = server.hub().subscribe_actions();
    server.start().await.expect("server starts");

    let client = reqwest::Client::new();
    let base = format!("http://127.0.0.1:{port}");
    wait_until_ready(&client, &format!("{base}/health")).await;

    // A viewer cannot dispatch operator actions.
    let forbidden = client
        .post(format!("{base}/api/v2/action?token=viewer-test"))
        .json(&serde_json::json!({ "action": "set_state", "data": { "state": "live" } }))
        .send()
        .await
        .expect("viewer action");
    assert_eq!(forbidden.status(), 403);

    // An admin can.
    let allowed = client
        .post(format!("{base}/api/v2/action?token=admin-test"))
        .json(&serde_json::json!({ "action": "set_state", "data": { "state": "live" } }))
        .send()
        .await
        .expect("admin action");
    assert_eq!(allowed.status(), 200);

    let dispatched = tokio::time::timeout(std::time::Duration::from_secs(2), actions.recv())
        .await
        .expect("action dispatch timed out")
        .expect("action received");
    assert_eq!(dispatched.action, "set_state");
    assert_eq!(dispatched.str_field("state"), Some("live"));

    server.stop();
}

#[tokio::test]
async fn dock_is_served_with_the_same_hardening() {
    let port = free_port();
    let mut server = OverlayServer::new(port);
    server.start().await.expect("server starts");

    let client = reqwest::Client::new();
    let base = format!("http://127.0.0.1:{port}");
    wait_until_ready(&client, &format!("{base}/health")).await;

    let response = client
        .get(format!("{base}/dock"))
        .send()
        .await
        .expect("dock fetch");
    assert_eq!(response.status(), 200);
    assert!(response.headers().contains_key("content-security-policy"));
    let body = response.text().await.expect("dock body");
    assert!(
        body.contains("RL Stats"),
        "dock must be the operator console"
    );

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
        include_str!("../overlays/live.html"),
        include_str!("../overlays/chat.html"),
        include_str!("../overlays/dock.html"),
    ];
    for asset in assets {
        assert!(
            !asset.contains(".innerHTML"),
            "overlay assets must build DOM nodes instead of innerHTML"
        );
    }
}
