use crate::core::models::{
    CrossbarHitData, GameState, GoalScoredData, LivePlayer, RlEvent, StatfeedEventData,
};
use crate::error::AppResult;
use serde_json::Value;
use std::collections::HashMap;
use tracing::{debug, warn};

/// Parse a raw newline-delimited JSON string into a typed `RlEvent`.
/// Unknown events are captured as `RlEvent::Unknown` for forward compatibility.
/// Basic data ranges are validated (e.g., boost 0-100, non-negative counts).
pub fn parse_event(line: &str) -> AppResult<RlEvent> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Err(crate::error::AppError::ParseError(
            "Empty event line".into(),
        ));
    }

    let value: Value = serde_json::from_str(trimmed)?;

    let raw_event = value
        .get("Event")
        .or_else(|| value.get("event"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown");
    let event_name = raw_event.strip_prefix("game:").unwrap_or(raw_event);
    // CRITICAL: The real Rocket League Stats API sends Data as a JSON-encoded
    // STRING, not a nested object (e.g., "Data":"{\"Players\":[...]}").
    // We must re-parse it. Fall back to the whole value if no Data key exists,
    // and handle both object and string formats.
    let raw_data = value
        .get("Data")
        .or_else(|| value.get("data"))
        .cloned()
        .unwrap_or_else(|| value.clone());
    let data = if let Some(s) = raw_data.as_str() {
        serde_json::from_str::<Value>(s).unwrap_or_else(|_| Value::Object(Default::default()))
    } else {
        raw_data
    };

    debug!(raw_event = %raw_event, event = %event_name, "Parsing RL event");

    let data_for_parse = &data;

    match event_name {
        // PascalCase (old/wrapper format from existing tests)
        "UpdateState" | "update_state" => {
            let match_guid = data
                .get("MatchGuid")
                .or_else(|| data.get("matchGuid"))
                .and_then(|v| v.as_str())
                .map(ToOwned::to_owned);
            let game = parse_game_state(data_for_parse);
            let players = parse_players(data_for_parse);

            Ok(RlEvent::UpdateState {
                match_guid,
                game,
                players,
            })
        }
        "BallHit" | "ball_hit" => Ok(RlEvent::BallHit),
        "GoalScored" | "goal_scored" => {
            let gs_data = parse_goal_scored(data_for_parse);
            Ok(RlEvent::GoalScored { data: gs_data })
        }
        "StatfeedEvent" | "statfeed_event" => {
            let sf_data = parse_statfeed_event(data_for_parse);
            Ok(RlEvent::StatfeedEvent { data: sf_data })
        }
        "MatchCreated" | "match_created" => Ok(RlEvent::MatchCreated),
        "MatchInitialized" | "match_initialized" => Ok(RlEvent::MatchInitialized),
        "MatchEnded" | "match_ended" => {
            let winner_team_num = data
                .get("WinnerTeamNum")
                .or_else(|| data.get("winnerTeamNum"))
                .and_then(|v| v.as_i64())
                .map(|v| v as i32);
            Ok(RlEvent::MatchEnded { winner_team_num })
        }
        "MatchPaused" | "match_paused" => Ok(RlEvent::MatchPaused),
        "MatchUnpaused" | "match_unpaused" => Ok(RlEvent::MatchUnpaused),
        "RoundStarted" | "round_started" => Ok(RlEvent::RoundStarted),
        "ClockUpdatedSeconds" | "clock_updated_seconds" => {
            let time = data
                .get("TimeSeconds")
                .or_else(|| data.get("time"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            Ok(RlEvent::ClockUpdatedSeconds { time })
        }
        "CountdownBegin" | "countdown_begin" => Ok(RlEvent::CountdownBegin),
        "CrossbarHit" | "crossbar_hit" => {
            let ch_data = data
                .get("Player")
                .or_else(|| data.get("player"))
                .map(|value| parse_target(Some(value)))
                .unwrap_or_default();
            Ok(RlEvent::CrossbarHit {
                data: CrossbarHitData { player: ch_data },
            })
        }
        "GoalReplayStart" | "goal_replay_start" => Ok(RlEvent::GoalReplayStart),
        "GoalReplayEnd" | "goal_replay_end" => Ok(RlEvent::GoalReplayEnd),
        "GoalReplayWillEnd" | "goal_replay_will_end" => Ok(RlEvent::GoalReplayWillEnd),
        "MatchDestroyed" | "match_destroyed" => Ok(RlEvent::MatchDestroyed),
        "PodiumStart" | "podium_start" => Ok(RlEvent::PodiumStart),
        "ReplayCreated" | "replay_created" => Ok(RlEvent::ReplayCreated),
        "ReplayWillEnd" | "replay_will_end" => Ok(RlEvent::GoalReplayWillEnd),
        other => {
            warn!(event = %other, "Unknown RL event received");
            Ok(RlEvent::Unknown)
        }
    }
}

fn parse_game_state(data: &Value) -> GameState {
    let game = data
        .get("Game")
        .or_else(|| data.get("game"))
        .cloned()
        .unwrap_or_else(|| Value::Object(serde_json::Map::new()));

    let teams = game
        .get("Teams")
        .or_else(|| game.get("teams"))
        .and_then(|v| v.as_array())
        .map(|teams| {
            teams
                .iter()
                .map(|team| crate::core::models::TeamInfo {
                    score: team
                        .get("Score")
                        .or_else(|| team.get("score"))
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0) as i32,
                })
                .collect()
        });

    let ball =
        game.get("Ball")
            .or_else(|| game.get("ball"))
            .map(|ball| crate::core::models::BallState {
                location: ball.get("Location").and_then(parse_location),
                speed: ball
                    .get("Speed")
                    .or_else(|| ball.get("speed"))
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0),
            });

    GameState {
        teams,
        time: game
            .get("TimeSeconds")
            .or_else(|| game.get("time"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
        is_overtime: game
            .get("bOvertime")
            .or_else(|| game.get("isOvertime"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        ball,
        arena: game
            .get("Arena")
            .or_else(|| game.get("arena"))
            .and_then(|v| v.as_str())
            .map(ToOwned::to_owned),
        target: game
            .get("Target")
            .or_else(|| game.get("target"))
            .and_then(|v| v.get("Name"))
            .and_then(|v| v.as_str())
            .map(ToOwned::to_owned),
        playlist_id: game
            .get("PlaylistId")
            .or_else(|| game.get("playlistId"))
            .and_then(|v| v.as_i64())
            .and_then(|v| i32::try_from(v).ok()),
    }
}

fn parse_players(data: &Value) -> HashMap<String, LivePlayer> {
    // Try to extract players, handling both array and object formats.
    let players_value = data.get("Players").or_else(|| data.get("players"));

    // Format A: Array of player objects (old/wrapper format)
    if let Some(players_array) = players_value.and_then(|v| v.as_array()) {
        return players_array
            .iter()
            .map(|player| {
                let id = extract_player_id(player);
                let parsed = extract_single_player(player);
                let key = if id.is_empty() {
                    parsed.name.clone()
                } else {
                    id
                };
                (key, parsed)
            })
            .collect();
    }

    // Format B: Object keyed by player-index strings (real RL API format)
    // e.g., {"0": {...}, "1": {...}, "2": {...}}
    if let Some(players_obj) = players_value.and_then(|v| v.as_object()) {
        return players_obj
            .iter()
            .map(|(object_key, player)| {
                let id = extract_player_id(player);
                let parsed = extract_single_player(player);
                // Use object key as fallback id if no PrimaryId/id field
                let key = if id.is_empty() {
                    object_key.clone()
                } else {
                    id
                };
                (key, parsed)
            })
            .collect();
    }

    HashMap::new()
}

fn extract_player_id(player: &Value) -> String {
    player
        .get("PrimaryId")
        .or_else(|| player.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

fn extract_single_player(player: &Value) -> LivePlayer {
    let id = extract_player_id(player);
    let mut parsed = LivePlayer {
        id: id.clone(),
        name: player
            .get("Name")
            .or_else(|| player.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string(),
        team: player
            .get("TeamNum")
            .or_else(|| player.get("team"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
        score: player
            .get("Score")
            .or_else(|| player.get("score"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
        goals: player
            .get("Goals")
            .or_else(|| player.get("goals"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
        shots: player
            .get("Shots")
            .or_else(|| player.get("shots"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
        assists: player
            .get("Assists")
            .or_else(|| player.get("assists"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
        saves: player
            .get("Saves")
            .or_else(|| player.get("saves"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
        touches: player
            .get("Touches")
            .or_else(|| player.get("touches"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
        car_touches: player
            .get("CarTouches")
            .or_else(|| player.get("carTouches"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
        demos: player
            .get("Demos")
            .or_else(|| player.get("demos"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
        speed: player
            .get("Speed")
            .or_else(|| player.get("speed"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0),
        boost: player
            .get("Boost")
            .or_else(|| player.get("boost"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
        kickoff_goals: 0,
    };
    sanitize_player(&mut parsed);
    parsed
}

fn parse_goal_scored(data: &Value) -> GoalScoredData {
    GoalScoredData {
        scorer: parse_target(data.get("Scorer").or_else(|| data.get("scorer"))),
        assister: data
            .get("Assister")
            .or_else(|| data.get("assister"))
            .map(|value| parse_target(Some(value))),
    }
}

fn parse_statfeed_event(data: &Value) -> StatfeedEventData {
    StatfeedEventData {
        event_name: data
            .get("EventName")
            .or_else(|| data.get("eventName"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string(),
        main_target: parse_target(data.get("MainTarget")),
        secondary_target: data
            .get("SecondaryTarget")
            .map(|value| parse_target(Some(value))),
    }
}

fn parse_target(value: Option<&Value>) -> crate::core::models::StatfeedTarget {
    crate::core::models::StatfeedTarget {
        id: value
            .and_then(|v| v.get("PrimaryId").or_else(|| v.get("Id")))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        name: value
            .and_then(|v| v.get("Name"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string(),
        team_num: value
            .and_then(|v| v.get("TeamNum"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32,
    }
}

fn parse_location(value: &Value) -> Option<Vec<f64>> {
    if let Some(location) = value.as_object() {
        return Some(vec![
            location.get("X").and_then(|v| v.as_f64()).unwrap_or(0.0),
            location.get("Y").and_then(|v| v.as_f64()).unwrap_or(0.0),
            location.get("Z").and_then(|v| v.as_f64()).unwrap_or(0.0),
        ]);
    }
    value
        .as_array()
        .map(|values| values.iter().filter_map(|v| v.as_f64()).collect())
}

/// Clamp player values to valid ranges and ensure non-negative counts.
fn sanitize_player(player: &mut LivePlayer) {
    player.boost = player.boost.clamp(0, 100);
    player.score = player.score.max(0);
    player.goals = player.goals.max(0);
    player.shots = player.shots.max(0);
    player.assists = player.assists.max(0);
    player.saves = player.saves.max(0);
    player.touches = player.touches.max(0);
    player.car_touches = player.car_touches.max(0);
    player.demos = player.demos.max(0);
    player.speed = player.speed.max(0.0);
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---------------------------------------------------------------------------
    // Event type recognition tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_parse_match_created() {
        let json = r#"{"event":"MatchCreated"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::MatchCreated));
    }

    #[test]
    fn test_parse_match_initialized() {
        let json = r#"{"event":"MatchInitialized"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::MatchInitialized));
    }

    #[test]
    fn test_parse_match_ended() {
        let json = r#"{"event":"MatchEnded"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::MatchEnded { .. }));
    }

    #[test]
    fn test_parse_match_destroyed() {
        let json = r#"{"event":"MatchDestroyed"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::MatchDestroyed));
    }

    #[test]
    fn test_parse_match_paused() {
        let json = r#"{"event":"MatchPaused"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::MatchPaused));
    }

    #[test]
    fn test_parse_match_unpaused() {
        let json = r#"{"event":"MatchUnpaused"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::MatchUnpaused));
    }

    #[test]
    fn test_parse_round_started() {
        let json = r#"{"event":"RoundStarted"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::RoundStarted));
    }

    #[test]
    fn test_parse_countdown_begin() {
        let json = r#"{"event":"CountdownBegin"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::CountdownBegin));
    }

    #[test]
    fn test_parse_ball_hit() {
        let json = r#"{"event":"BallHit"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::BallHit));
    }

    #[test]
    fn test_parse_crossbar_hit() {
        let json = r#"{"event":"CrossbarHit"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::CrossbarHit { .. }));
    }

    #[test]
    fn test_parse_crossbar_hit_with_player() {
        let json = r#"{"event":"CrossbarHit","data":{"Player":{"PrimaryId":"P1","Name":"AlphaStar","TeamNum":0}}}"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::CrossbarHit { data } = ev {
            assert_eq!(data.player.name, "AlphaStar");
            assert_eq!(data.player.team_num, 0);
        } else {
            panic!("Expected CrossbarHit");
        }
    }

    #[test]
    fn test_parse_goal_replay_start() {
        let json = r#"{"event":"GoalReplayStart"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::GoalReplayStart));
    }

    #[test]
    fn test_parse_goal_replay_end() {
        let json = r#"{"event":"GoalReplayEnd"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::GoalReplayEnd));
    }

    #[test]
    fn test_parse_goal_replay_will_end() {
        let json = r#"{"event":"GoalReplayWillEnd"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::GoalReplayWillEnd));
    }

    #[test]
    fn test_parse_podium_start() {
        let json = r#"{"event":"PodiumStart"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::PodiumStart));
    }

    #[test]
    fn test_parse_replay_created() {
        let json = r#"{"event":"ReplayCreated"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::ReplayCreated));
    }

    #[test]
    fn test_parse_unknown_event() {
        let json = r#"{"event":"FutureEvent","data":{"foo":"bar"}}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::Unknown));
    }

    #[test]
    fn test_parse_unknown_no_event_field() {
        // No "event" or "Event" key → "Unknown"
        let json = r#"{"data":{"something":true}}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::Unknown));
    }

    // ---------------------------------------------------------------------------
    // ClockUpdatedSeconds tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_parse_clock_updated_seconds() {
        let json = r#"{"event":"ClockUpdatedSeconds","data":{"TimeSeconds":295}}"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::ClockUpdatedSeconds { time } = ev {
            assert_eq!(time, 295);
        } else {
            panic!("Expected ClockUpdatedSeconds, got {:?}", ev);
        }
    }

    #[test]
    fn test_parse_clock_updated_seconds_lowercase() {
        let json = r#"{"event":"ClockUpdatedSeconds","data":{"time":42}}"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::ClockUpdatedSeconds { time } = ev {
            assert_eq!(time, 42);
        } else {
            panic!("Expected ClockUpdatedSeconds");
        }
    }

    #[test]
    fn test_parse_clock_updated_seconds_missing_time() {
        let json = r#"{"event":"ClockUpdatedSeconds","data":{}}"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::ClockUpdatedSeconds { time } = ev {
            assert_eq!(time, 0);
        } else {
            panic!("Expected ClockUpdatedSeconds with default time = 0");
        }
    }

    // ---------------------------------------------------------------------------
    // GoalScored tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_parse_goal_scored_with_assist() {
        let json = r#"{
            "event":"GoalScored",
            "data":{
                "Scorer":{"PrimaryId":"P1","Name":"AlphaStar","TeamNum":0},
                "Assister":{"PrimaryId":"P2","Name":"BetaKnight","TeamNum":0}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::GoalScored { data } = ev {
            assert_eq!(data.scorer.name, "AlphaStar");
            assert_eq!(data.scorer.id, "P1");
            assert_eq!(data.scorer.team_num, 0);
            let assister = data.assister.expect("expected assister");
            assert_eq!(assister.name, "BetaKnight");
            assert_eq!(assister.id, "P2");
            assert_eq!(assister.team_num, 0);
        } else {
            panic!("Expected GoalScored");
        }
    }

    #[test]
    fn test_parse_goal_scored_no_assist() {
        let json = r#"{
            "event":"GoalScored",
            "data":{
                "Scorer":{"PrimaryId":"P3","Name":"DeltaRush","TeamNum":1}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::GoalScored { data } = ev {
            assert_eq!(data.scorer.name, "DeltaRush");
            assert_eq!(data.scorer.team_num, 1);
            assert!(data.assister.is_none());
        } else {
            panic!("Expected GoalScored");
        }
    }

    // ---------------------------------------------------------------------------
    // StatfeedEvent tests (each known stat type)
    // ---------------------------------------------------------------------------

    #[test]
    fn test_parse_statfeed_goal() {
        let json = r#"{
            "event":"StatfeedEvent",
            "data":{
                "EventName":"Goal",
                "MainTarget":{"PrimaryId":"P1","Name":"AlphaStar","TeamNum":0},
                "SecondaryTarget":{"PrimaryId":"P2","Name":"BetaKnight","TeamNum":0}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::StatfeedEvent { data } = ev {
            assert_eq!(data.event_name, "Goal");
            assert_eq!(data.main_target.name, "AlphaStar");
            assert!(data.secondary_target.is_some());
        } else {
            panic!("Expected StatfeedEvent");
        }
    }

    #[test]
    fn test_parse_statfeed_assist() {
        let json = r#"{
            "event":"StatfeedEvent",
            "data":{
                "EventName":"Assist",
                "MainTarget":{"PrimaryId":"P2","Name":"BetaKnight","TeamNum":0}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::StatfeedEvent { data } = ev {
            assert_eq!(data.event_name, "Assist");
            assert_eq!(data.main_target.name, "BetaKnight");
            assert!(data.secondary_target.is_none());
        } else {
            panic!("Expected StatfeedEvent");
        }
    }

    #[test]
    fn test_parse_statfeed_save() {
        let json = r#"{
            "event":"StatfeedEvent",
            "data":{
                "EventName":"Save",
                "MainTarget":{"PrimaryId":"P3","Name":"GammaWing","TeamNum":0}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::StatfeedEvent { data } = ev {
            assert_eq!(data.event_name, "Save");
            assert_eq!(data.main_target.name, "GammaWing");
        } else {
            panic!("Expected StatfeedEvent");
        }
    }

    #[test]
    fn test_parse_statfeed_shot() {
        let json = r#"{
            "event":"StatfeedEvent",
            "data":{
                "EventName":"Shot",
                "MainTarget":{"PrimaryId":"P4","Name":"DeltaRush","TeamNum":1}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::StatfeedEvent { data } = ev {
            assert_eq!(data.event_name, "Shot");
            assert_eq!(data.main_target.name, "DeltaRush");
        } else {
            panic!("Expected StatfeedEvent");
        }
    }

    #[test]
    fn test_parse_statfeed_demolish() {
        let json = r#"{
            "event":"StatfeedEvent",
            "data":{
                "EventName":"Demolish",
                "MainTarget":{"PrimaryId":"P5","Name":"EpsilonDrift","TeamNum":1},
                "SecondaryTarget":{"PrimaryId":"P1","Name":"AlphaStar","TeamNum":0}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::StatfeedEvent { data } = ev {
            assert_eq!(data.event_name, "Demolish");
            assert_eq!(data.main_target.name, "EpsilonDrift");
            assert!(data.secondary_target.is_some());
        } else {
            panic!("Expected StatfeedEvent");
        }
    }

    #[test]
    fn test_parse_statfeed_unknown_event_name() {
        let json = r#"{
            "event":"StatfeedEvent",
            "data":{
                "MainTarget":{"PrimaryId":"P1","Name":"AlphaStar","TeamNum":0}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::StatfeedEvent { data } = ev {
            assert_eq!(data.event_name, "Unknown");
            assert_eq!(data.main_target.name, "AlphaStar");
        } else {
            panic!("Expected StatfeedEvent");
        }
    }

    // ---------------------------------------------------------------------------
    // UpdateState tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_parse_update_state() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "Game":{
                    "TimeSeconds":300,
                    "bOvertime":false,
                    "Arena":"Stadium",
                    "Ball":{"Location":{"X":0.0,"Y":0.0,"Z":92.75},"Speed":1500.0},
                    "Teams":[{"Score":0},{"Score":0}]
                },
                "Players":[
                    {"PrimaryId":"P1","Name":"Test","TeamNum":0,"Score":100,"Goals":1,"Shots":3,"Assists":0,"Saves":1,"Touches":10,"CarTouches":2,"Demos":0,"Speed":1500.0,"Boost":85}
                ]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState {
            match_guid,
            game,
            players,
        } = ev
        {
            assert!(match_guid.is_none());
            assert_eq!(game.time, 300);
            assert!(!game.is_overtime);
            assert_eq!(game.arena.as_deref(), Some("Stadium"));
            assert_eq!(game.teams.as_ref().unwrap().len(), 2);
            let p = players.get("P1").unwrap();
            assert_eq!(p.name, "Test");
            assert_eq!(p.boost, 85);
            assert_eq!(p.goals, 1);
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_parse_update_state_parses_playlist_id() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "Game":{"TimeSeconds":300,"PlaylistId":27,"Teams":[{"Score":0},{"Score":0}]},
                "Players":[]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { game, .. } = ev {
            assert_eq!(game.playlist_id, Some(27));
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_parse_update_state_with_match_guid() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "MatchGuid":"550e8400-e29b-41d4-a716-446655440000",
                "Game":{"TimeSeconds":200},
                "Players":[
                    {"PrimaryId":"P1","Name":"Test","TeamNum":0,"Score":50,"Goals":0,"Shots":0,"Assists":0,"Saves":0,"Touches":0,"CarTouches":0,"Demos":0,"Speed":0.0,"Boost":33}
                ]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { match_guid, .. } = ev {
            assert_eq!(
                match_guid.as_deref(),
                Some("550e8400-e29b-41d4-a716-446655440000")
            );
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_parse_update_state_null_players() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "MatchGuid":"550e8400-e29b-41d4-a716-446655440000",
                "Game":{"TimeSeconds":300,"Teams":[{"Score":0},{"Score":0}]}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { players, .. } = ev {
            assert!(players.is_empty());
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_parse_update_state_empty_game() {
        let json = r#"{"event":"UpdateState","data":{}}"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { game, players, .. } = ev {
            assert_eq!(game.time, 0);
            assert!(!game.is_overtime);
            assert!(game.arena.is_none());
            assert!(players.is_empty());
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_parse_update_state_camelcase_keys() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "matchGuid":"abc-123",
                "game":{
                    "time":180,
                    "isOvertime":true,
                    "arena":"DFHStadium",
                    "ball":{"speed":2200.0},
                    "teams":[{"score":2},{"score":3}]
                },
                "players":[
                    {"id":"P1","name":"Camel","team":1,"score":200,"goals":0,"shots":1,"assists":0,"saves":0,"touches":3,"carTouches":1,"demos":0,"speed":1800.0,"boost":55}
                ]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState {
            match_guid,
            game,
            players,
        } = ev
        {
            assert_eq!(match_guid.as_deref(), Some("abc-123"));
            assert_eq!(game.time, 180);
            assert!(game.is_overtime);
            assert_eq!(game.arena.as_deref(), Some("DFHStadium"));
            let p = players.get("P1").unwrap();
            assert_eq!(p.name, "Camel");
            assert_eq!(p.team, 1);
        } else {
            panic!("Expected UpdateState");
        }
    }

    // ---------------------------------------------------------------------------
    // Sanitisation / range tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_sanitize_boost_clamped_to_100() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "Game":{"TimeSeconds":300},
                "Players":[
                    {"PrimaryId":"P1","Name":"Bad","TeamNum":0,"Score":0,"Goals":0,"Shots":0,"Assists":0,"Saves":0,"Touches":0,"CarTouches":0,"Demos":0,"Speed":0.0,"Boost":999}
                ]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { players, .. } = ev {
            let p = players.get("P1").unwrap();
            assert_eq!(p.boost, 100);
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_sanitize_boost_boundary_min() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "Game":{"TimeSeconds":300},
                "Players":[
                    {"PrimaryId":"P1","Name":"Min","TeamNum":0,"Score":0,"Goals":0,"Shots":0,"Assists":0,"Saves":0,"Touches":0,"CarTouches":0,"Demos":0,"Speed":0.0,"Boost":0}
                ]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { players, .. } = ev {
            let p = players.get("P1").unwrap();
            assert_eq!(p.boost, 0);
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_sanitize_boost_boundary_max() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "Game":{"TimeSeconds":300},
                "Players":[
                    {"PrimaryId":"P1","Name":"Max","TeamNum":0,"Score":0,"Goals":0,"Shots":0,"Assists":0,"Saves":0,"Touches":0,"CarTouches":0,"Demos":0,"Speed":0.0,"Boost":100}
                ]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { players, .. } = ev {
            let p = players.get("P1").unwrap();
            assert_eq!(p.boost, 100);
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_sanitize_negative_stats_to_zero() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "Game":{"TimeSeconds":300},
                "Players":[
                    {"PrimaryId":"P1","Name":"Bad","TeamNum":0,"Score":-5,"Goals":-1,"Shots":-2,"Assists":-1,"Saves":-1,"Touches":-3,"CarTouches":-1,"Demos":-1,"Speed":-100.0,"Boost":-10}
                ]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { players, .. } = ev {
            let p = players.get("P1").unwrap();
            assert_eq!(p.boost, 0, "negative boost should be clamped to 0");
            assert_eq!(p.score, 0);
            assert_eq!(p.goals, 0);
            assert_eq!(p.shots, 0);
            assert_eq!(p.assists, 0);
            assert_eq!(p.saves, 0);
            assert_eq!(p.touches, 0);
            assert_eq!(p.car_touches, 0);
            assert_eq!(p.demos, 0);
            assert_eq!(p.speed, 0.0);
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_sanitize_boost_and_negative() {
        // Combined test: boost > 100 + negative stats
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "Game":{"TimeSeconds":300},
                "Players":[
                    {"PrimaryId":"P1","Name":"Bad","TeamNum":0,"Score":-5,"Goals":-1,"Shots":2,"Assists":0,"Saves":0,"Touches":5,"CarTouches":1,"Demos":0,"Speed":-100.0,"Boost":999}
                ]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { players, .. } = ev {
            let p = players.get("P1").unwrap();
            assert_eq!(p.boost, 100);
            assert_eq!(p.score, 0);
            assert_eq!(p.goals, 0);
            assert_eq!(p.speed, 0.0);
        } else {
            panic!("Expected UpdateState");
        }
    }

    // ---------------------------------------------------------------------------
    // Malformed / error-handling tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_parse_malformed_json_returns_err() {
        let line = "not json at all";
        let result = parse_event(line);
        assert!(result.is_err(), "malformed lines must return Err");
    }

    #[test]
    fn test_parse_truncated_json_returns_err() {
        let line = r#"{"event":"UpdateState","data":{"Game"#;
        let result = parse_event(line);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_empty_string_returns_err() {
        let line = "";
        let result = parse_event(line);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_whitespace_only_returns_err() {
        let line = "   \t  \n  ";
        let result = parse_event(line);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_empty_json_object() {
        let json = r#"{}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::Unknown));
    }

    #[test]
    fn test_parse_missing_required_camelcase_fields() {
        // Player missing many fields — parser uses camelCase fallback and defaults
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "game":{"time":300},
                "players":[
                    {"id":"P1","name":"Minimal","team":0}
                ]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { players, .. } = ev {
            let p = players.get("P1").expect("player must exist");
            assert_eq!(p.name, "Minimal");
            assert_eq!(p.score, 0);
            assert_eq!(p.goals, 0);
            assert_eq!(p.shots, 0);
            assert_eq!(p.boost, 0);
            assert_eq!(p.speed, 0.0);
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_parse_player_no_id_uses_name() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "game":{"time":300},
                "players":[
                    {"name":"NoID","team":0,"score":50,"goals":0,"shots":0,"assists":0,"saves":0,"touches":0,"carTouches":0,"demos":0,"speed":0.0,"boost":33}
                ]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { players, .. } = ev {
            // Fallback key is the player's name when id is empty
            let p = players
                .get("NoID")
                .expect("player with name-only key must exist");
            assert_eq!(p.id, "");
            assert_eq!(p.name, "NoID");
        } else {
            panic!("Expected UpdateState");
        }
    }

    // ---------------------------------------------------------------------------
    // GameState / ball / arena boundary tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_parse_game_state_overtime() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "Game":{"TimeSeconds":0,"bOvertime":true,"Arena":"DFHStadium","Teams":[{"Score":2},{"Score":3}]},
                "Players":[]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { game, .. } = ev {
            assert_eq!(game.time, 0);
            assert!(game.is_overtime);
            assert_eq!(game.arena.as_deref(), Some("DFHStadium"));
            let teams = game.teams.unwrap();
            assert_eq!(teams[0].score, 2);
            assert_eq!(teams[1].score, 3);
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_parse_ball_location_xyz() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "Game":{
                    "TimeSeconds":100,
                    "Ball":{"Location":{"X":100.0,"Y":200.0,"Z":300.0},"Speed":1500.0}
                },
                "Players":[]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { game, .. } = ev {
            let ball = game.ball.unwrap();
            let loc = ball.location.unwrap();
            assert_eq!(loc.len(), 3);
            assert!((loc[0] - 100.0).abs() < f64::EPSILON);
            assert!((loc[1] - 200.0).abs() < f64::EPSILON);
            assert!((loc[2] - 300.0).abs() < f64::EPSILON);
            assert!((ball.speed - 1500.0).abs() < f64::EPSILON);
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_parse_ball_location_array() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "Game":{
                    "TimeSeconds":100,
                    "Ball":{"Location":[10.0,20.0,30.0],"Speed":800.0}
                },
                "Players":[]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { game, .. } = ev {
            let ball = game.ball.unwrap();
            let loc = ball.location.unwrap();
            assert_eq!(loc.len(), 3);
            assert!((loc[0] - 10.0).abs() < f64::EPSILON);
            assert!((loc[2] - 30.0).abs() < f64::EPSILON);
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_parse_target_name() {
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "Game":{"TimeSeconds":200,"Target":{"Name":"OrangeGoal"}},
                "Players":[]
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { game, .. } = ev {
            assert_eq!(game.target.as_deref(), Some("OrangeGoal"));
        } else {
            panic!("Expected UpdateState");
        }
    }

    // ---------------------------------------------------------------------------
    // Event name casing tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_parse_lowercase_event_field() {
        let json = r#"{"event":"MatchCreated"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::MatchCreated));
    }

    #[test]
    fn test_parse_pascal_case_event_field() {
        let json = r#"{"Event":"MatchEnded"}"#;
        let ev = parse_event(json).unwrap();
        assert!(matches!(ev, RlEvent::MatchEnded { .. }));
    }

    // ---------------------------------------------------------------------------
    // Additional tests from the test plan
    // ---------------------------------------------------------------------------

    #[test]
    fn test_parse_update_state_with_empty_players_object() {
        // Players as an empty object {} — parser should handle gracefully
        // (parse_players uses .as_array() which will be None for objects,
        // falling through to .unwrap_or_default() => empty HashMap)
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "game":{"time":300},
                "players":{}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { players, .. } = ev {
            assert!(
                players.is_empty(),
                "empty players object should result in empty map"
            );
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_parse_update_state_players_as_object_keyed_by_id() {
        // The spec format: players is an object keyed by player index, not an array.
        // The parser now handles both formats — object format is the real API standard.
        let json = r#"{
            "event":"UpdateState",
            "data":{
                "game":{"time":300},
                "players":{"0":{"name":"Alpha","team":0,"score":100,"goals":1,"shots":2,"assists":0,"saves":1,"touches":5,"demos":0,"speed":1500,"boost":67}}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::UpdateState { players, .. } = ev {
            // Object-format players are now properly extracted
            assert!(
                !players.is_empty(),
                "object-format players should be extracted"
            );
            let p = players.get("0").expect("player keyed by '0' should exist");
            assert_eq!(p.name, "Alpha");
            assert_eq!(p.score, 100);
            assert_eq!(p.boost, 67);
        } else {
            panic!("Expected UpdateState");
        }
    }

    #[test]
    fn test_parse_game_prefix_update_state() {
        // "game:update_state" event name — stripped to "update_state" and matched
        let json = r#"{"event":"game:update_state","game":{"time":300},"players":{}}"#;
        let ev = parse_event(json).unwrap();
        // After stripping "game:" prefix, "update_state" matches UpdateState
        assert!(matches!(ev, RlEvent::UpdateState { .. }));
    }

    #[test]
    fn test_parse_statfeed_event_main_target_only() {
        // Only main_target, no secondary_target at all (key absent)
        let json = r#"{
            "event":"StatfeedEvent",
            "data":{
                "EventName":"Shot",
                "MainTarget":{"PrimaryId":"P1","Name":"Shooter","TeamNum":0}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::StatfeedEvent { data } = ev {
            assert_eq!(data.event_name, "Shot");
            assert_eq!(data.main_target.name, "Shooter");
            assert!(data.secondary_target.is_none());
        } else {
            panic!("Expected StatfeedEvent");
        }
    }

    #[test]
    fn test_parse_statfeed_event_with_both_targets() {
        let json = r#"{
            "event":"StatfeedEvent",
            "data":{
                "EventName":"Goal",
                "MainTarget":{"PrimaryId":"P1","Name":"Scorer","TeamNum":0},
                "SecondaryTarget":{"PrimaryId":"P2","Name":"Assister","TeamNum":0}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::StatfeedEvent { data } = ev {
            assert_eq!(data.event_name, "Goal");
            assert_eq!(data.main_target.name, "Scorer");
            let sec = data.secondary_target.expect("secondary_target must exist");
            assert_eq!(sec.name, "Assister");
        } else {
            panic!("Expected StatfeedEvent");
        }
    }

    // Duplicates of test_parse_empty_json_object_returns_unknown and
    // test_parse_empty_string_returns_err already exist above — skip.

    #[test]
    fn test_parse_invalid_json_with_braces_returns_err() {
        let json = "not valid json {{{";
        let result = parse_event(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_statfeed_demolish_with_secondary() {
        let json = r#"{
            "event":"StatfeedEvent",
            "data":{
                "EventName":"Demolish",
                "MainTarget":{"PrimaryId":"P1","Name":"Demoer","TeamNum":1},
                "SecondaryTarget":{"PrimaryId":"P2","Name":"Victim","TeamNum":0}
            }
        }"#;
        let ev = parse_event(json).unwrap();
        if let RlEvent::StatfeedEvent { data } = ev {
            assert_eq!(data.event_name, "Demolish");
            assert_eq!(data.main_target.name, "Demoer");
            assert!(data.secondary_target.is_some());
            assert_eq!(data.secondary_target.unwrap().name, "Victim");
        } else {
            panic!("Expected StatfeedEvent");
        }
    }

    // GoalScored with/without assister tests already exist above
    // (test_parse_goal_scored_with_assist, test_parse_goal_scored_no_assist)
}
