//! Rocket League Stats API outbound commands.
//!
//! The API ingests commands over the same local socket it streams events on
//! (see the official docs: `ChangePOV`, `LoadReplay`, `SeekReplay`,
//! `SetGameSpeed`, `SetHUDVisibility`, `SetMatchPaused`). Tournaments and
//! casters use these to pause a match, control the observer camera, replay a
//! goal in slow motion or hide the in-game HUD for a clean overlay.
//!
//! Every builder validates its inputs so invalid values are rejected before
//! reaching the game (which would ignore them silently).

use serde_json::{json, Value};

const POV_PERSPECTIVES: &[&str] = &[
    "Fly",
    "SoftAttach",
    "HardAttach",
    "PlayerView",
    "AutoCam",
    "Camera_Director",
];

fn envelope(command: &str, data: Value) -> Value {
    json!({ "Command": command, "Data": data })
}

/// Serializes a command for the ingestor write path.
pub fn to_wire(command: &Value) -> String {
    command.to_string()
}

pub fn set_match_paused(paused: bool) -> Value {
    envelope("SetMatchPaused", json!({ "bPaused": paused }))
}

pub fn set_hud_visibility(visible: bool) -> Value {
    envelope("SetHUDVisibility", json!({ "bVisible": visible }))
}

/// `focus` is `"Ball"` or a spectator shortcut (`"1"`, `"2"`, …).
/// `perspective` is one of the documented camera modes.
pub fn change_pov(focus: Option<&str>, perspective: Option<&str>) -> Result<Value, String> {
    let focus = focus.map(str::trim).filter(|value| !value.is_empty());
    let perspective = perspective.map(str::trim).filter(|value| !value.is_empty());

    if focus.is_none() && perspective.is_none() {
        return Err("ChangePOV requires Focus or Perspective".into());
    }
    if let Some(focus) = focus {
        let valid = focus.eq_ignore_ascii_case("Ball")
            || (!focus.is_empty() && focus.chars().all(|ch| ch.is_ascii_digit()));
        if !valid {
            return Err(format!("Invalid ChangePOV focus: {focus}"));
        }
    }
    if let Some(perspective) = perspective {
        if !POV_PERSPECTIVES.contains(&perspective) {
            return Err(format!("Invalid ChangePOV perspective: {perspective}"));
        }
    }

    let mut data = serde_json::Map::new();
    if let Some(focus) = focus {
        data.insert(
            "Focus".into(),
            json!(if focus.eq_ignore_ascii_case("Ball") {
                "Ball".to_string()
            } else {
                focus.to_string()
            }),
        );
    }
    if let Some(perspective) = perspective {
        data.insert("Perspective".into(), json!(perspective));
    }
    Ok(envelope("ChangePOV", Value::Object(data)))
}

/// Loads a replay by file name or absolute path.
pub fn load_replay(file_name: Option<&str>, path: Option<&str>) -> Result<Value, String> {
    let file_name = file_name.map(str::trim).filter(|value| !value.is_empty());
    let path = path.map(str::trim).filter(|value| !value.is_empty());
    if file_name.is_none() && path.is_none() {
        return Err("LoadReplay requires FileName or Path".into());
    }
    let mut data = serde_json::Map::new();
    if let Some(file_name) = file_name {
        data.insert("FileName".into(), json!(file_name));
    }
    if let Some(path) = path {
        data.insert("Path".into(), json!(path));
    }
    Ok(envelope("LoadReplay", Value::Object(data)))
}

/// Jumps replay playback to a frame or a time in seconds.
pub fn seek_replay(frame: Option<i64>, time_seconds: Option<f64>) -> Result<Value, String> {
    if frame.is_none() && time_seconds.is_none() {
        return Err("SeekReplay requires Frame or TimeSeconds".into());
    }
    if let Some(frame) = frame {
        if frame < 0 {
            return Err("SeekReplay frame must be >= 0".into());
        }
    }
    if let Some(time) = time_seconds {
        if !time.is_finite() || time < 0.0 {
            return Err("SeekReplay time must be >= 0".into());
        }
    }
    let mut data = serde_json::Map::new();
    if let Some(frame) = frame {
        data.insert("Frame".into(), json!(frame));
    }
    if let Some(time) = time_seconds {
        data.insert("TimeSeconds".into(), json!(time));
    }
    Ok(envelope("SeekReplay", Value::Object(data)))
}

/// Sets replay playback speed (`1.0` = normal). Must be finite and `>= 0`.
pub fn set_game_speed(speed: f64) -> Result<Value, String> {
    if !speed.is_finite() || speed < 0.0 {
        return Err("SetGameSpeed must be a finite value >= 0".into());
    }
    Ok(envelope("SetGameSpeed", json!({ "Speed": speed })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pause_and_hud_commands_use_the_documented_envelope() {
        let pause = set_match_paused(true);
        assert_eq!(pause["Command"], "SetMatchPaused");
        assert_eq!(pause["Data"]["bPaused"], true);

        let hud = set_hud_visibility(false);
        assert_eq!(hud["Command"], "SetHUDVisibility");
        assert_eq!(hud["Data"]["bVisible"], false);

        assert!(to_wire(&pause).contains("SetMatchPaused"));
    }

    #[test]
    fn change_pov_validates_and_normalizes() {
        assert!(change_pov(None, None).is_err());
        assert!(change_pov(Some("someone"), None).is_err());
        assert!(change_pov(None, Some("Flycam")).is_err());

        let ball = change_pov(Some("ball"), Some("AutoCam")).unwrap();
        assert_eq!(ball["Data"]["Focus"], "Ball");
        assert_eq!(ball["Data"]["Perspective"], "AutoCam");

        let player = change_pov(Some("2"), None).unwrap();
        assert_eq!(player["Data"]["Focus"], "2");
        assert!(player["Data"].get("Perspective").is_none());
    }

    #[test]
    fn replay_commands_validate_arguments() {
        assert!(load_replay(None, None).is_err());
        assert!(seek_replay(None, None).is_err());
        assert!(seek_replay(Some(-1), None).is_err());
        assert!(seek_replay(None, Some(-2.5)).is_err());
        assert!(set_game_speed(-1.0).is_err());
        assert!(set_game_speed(f64::NAN).is_err());

        let load = load_replay(Some("Stadium_P_2026-06-05_18-42"), None).unwrap();
        assert_eq!(load["Data"]["FileName"], "Stadium_P_2026-06-05_18-42");
        let seek = seek_replay(None, Some(120.5)).unwrap();
        assert_eq!(seek["Data"]["TimeSeconds"], 120.5);
        let speed = set_game_speed(0.5).unwrap();
        assert_eq!(speed["Data"]["Speed"], 0.5);
    }
}
