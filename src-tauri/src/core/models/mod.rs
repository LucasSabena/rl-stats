use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Represents a completed match stored in the database.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Match {
    pub id: i64,
    pub guid: String,
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub end_time: Option<chrono::DateTime<chrono::Utc>>,
    pub arena: Option<String>,
    pub score_blue: i32,
    pub score_orange: i32,
    pub winner: Option<i32>, // 0 = blue, 1 = orange, None = draw/unknown
    pub is_online: bool,
    pub is_overtime: bool,
    pub duration_seconds: i32,
    pub match_type: Option<String>,
    pub playlist: Option<String>,
}

/// Represents a player in a match.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Player {
    pub id: i64,
    pub primary_id: String,
    pub name: String,
    pub team_num: i32,
    pub stats: PlayerStats,
}

/// Accumulated statistics for a player during a match.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PlayerStats {
    pub score: i32,
    pub goals: i32,
    pub shots: i32,
    pub assists: i32,
    pub saves: i32,
    pub touches: i32,
    pub car_touches: i32,
    pub demos: i32,
    pub speed: f64,
    pub boost: i32,
    pub mmr: Option<i32>,
    pub kickoff_goals: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head_to_head: Option<HeadToHeadRecord>,
}

/// Live player data as received from UpdateState events.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LivePlayer {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub team: i32,
    pub score: i32,
    pub goals: i32,
    pub shots: i32,
    pub assists: i32,
    pub saves: i32,
    pub touches: i32,
    pub car_touches: i32,
    pub demos: i32,
    pub speed: f64,
    pub boost: i32,
    pub kickoff_goals: i32,
}

/// Ball state from the API.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallState {
    pub location: Option<Vec<f64>>,
    pub speed: f64,
}

/// Game state from UpdateState.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
    pub teams: Option<Vec<TeamInfo>>,
    pub time: i32,
    pub is_overtime: bool,
    pub ball: Option<BallState>,
    pub arena: Option<String>,
    pub target: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamInfo {
    pub score: i32,
}

/// Current live match state held in memory.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct LiveMatchState {
    pub match_guid: Option<String>,
    pub arena: Option<String>,
    pub is_online: bool,
    pub is_overtime: bool,
    pub time_remaining: i32,
    pub score_blue: i32,
    pub score_orange: i32,
    pub players: Vec<LivePlayer>,
    pub ball_speed: f64,
    pub player_count: usize,
    pub match_type: Option<String>,
    pub last_touch_team: Option<i32>,
}

/// Represents a statfeed event payload (e.g., "Shot on Goal", "Save").
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatfeedEventData {
    pub event_name: String,
    pub main_target: StatfeedTarget,
    pub secondary_target: Option<StatfeedTarget>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatfeedTarget {
    pub id: String,
    pub name: String,
    pub team_num: i32,
}

/// Represents a goal scored event.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalScoredData {
    pub scorer: StatfeedTarget,
    pub assister: Option<StatfeedTarget>,
}

/// All possible Rocket League Stats API events.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "event")]
pub enum RlEvent {
    #[serde(rename = "UpdateState")]
    UpdateState {
        match_guid: Option<String>,
        game: GameState,
        #[serde(default)]
        players: HashMap<String, LivePlayer>,
    },
    #[serde(rename = "BallHit")]
    BallHit,
    #[serde(rename = "GoalScored")]
    GoalScored { data: GoalScoredData },
    #[serde(rename = "StatfeedEvent")]
    StatfeedEvent { data: StatfeedEventData },
    #[serde(rename = "MatchCreated")]
    MatchCreated,
    #[serde(rename = "MatchInitialized")]
    MatchInitialized,
    #[serde(rename = "MatchEnded")]
    MatchEnded { winner_team_num: Option<i32> },
    #[serde(rename = "MatchPaused")]
    MatchPaused,
    #[serde(rename = "MatchUnpaused")]
    MatchUnpaused,
    #[serde(rename = "RoundStarted")]
    RoundStarted,
    #[serde(rename = "ClockUpdatedSeconds")]
    ClockUpdatedSeconds { time: i32 },
    #[serde(rename = "CountdownBegin")]
    CountdownBegin,
    #[serde(rename = "CrossbarHit")]
    CrossbarHit { data: CrossbarHitData },
    #[serde(rename = "GoalReplayStart")]
    GoalReplayStart,
    #[serde(rename = "GoalReplayEnd")]
    GoalReplayEnd,
    #[serde(rename = "GoalReplayWillEnd")]
    GoalReplayWillEnd,
    #[serde(rename = "MatchDestroyed")]
    MatchDestroyed,
    #[serde(rename = "PodiumStart")]
    PodiumStart,
    #[serde(rename = "ReplayCreated")]
    ReplayCreated,
    /// Catch-all for unknown or future events.
    #[serde(other)]
    Unknown,
}

/// Raw wrapper to inspect the event name before full parsing.
#[derive(Clone, Debug, Deserialize)]
pub struct RawRlEvent {
    pub event: String,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

/// Match event stored for replay/history.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MatchEvent {
    pub id: i64,
    pub match_id: i64,
    pub event_type: String,
    pub event_data: String,
    pub occurred_at: chrono::DateTime<chrono::Utc>,
}

/// Daily rollup for analytics.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DailyRollup {
    pub date: String,
    pub matches_played: i32,
    pub wins: i32,
    pub losses: i32,
    pub goals_scored: i32,
    pub goals_conceded: i32,
    pub total_shots: i32,
    pub total_saves: i32,
    pub avg_duration_seconds: i32,
    pub total_demos: i32,
    pub total_assists: i32,
    pub avg_score: i32,
    pub kickoff_goals_scored: i32,
    pub kickoff_goals_conceded: i32,
}

/// Data for CrossbarHit events.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossbarHitData {
    pub player: StatfeedTarget,
}

/// Session summary generated when a match ends.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionSummary {
    pub match_guid: String,
    pub duration_seconds: i32,
    pub score_blue: i32,
    pub score_orange: i32,
    pub winner: Option<i32>,
    #[serde(default)]
    pub local_primary_id: Option<String>,
    #[serde(default)]
    pub local_team_num: Option<i32>,
    pub players: Vec<Player>,
    pub match_type: Option<String>,
    pub kickoff_goals_scored: i32,
    pub kickoff_goals_conceded: i32,
}

/// Head-to-head record between the local player and another player.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct HeadToHeadRecord {
    pub wins_against: i32,
    pub losses_against: i32,
    pub wins_together: i32,
    pub losses_together: i32,
}

/// Connection status for the ingestor.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub connected: bool,
    pub address: String,
    pub last_error: Option<String>,
    pub reconnect_attempts: u32,
    pub game_running: bool,
}

/// Camera settings preset section.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraSettings {
    pub fov: i32,
    pub height: i32,
    pub angle: f64,
    pub distance: i32,
    pub stiffness: f64,
    pub swivel_speed: f64,
    pub transition_speed: f64,
    pub ball_camera: String,
    pub camera_shake: String,
}

/// Control settings preset section.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlSettings {
    pub powerslide: String,
    pub air_roll_left: String,
    pub air_roll_right: String,
    pub boost: String,
    pub jump: String,
    pub ball_cam: String,
    pub brake: String,
    pub throttle: String,
}

/// Deadzone settings preset section.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeadzoneSettings {
    pub deadzone_shape: String,
    pub deadzone: f64,
    pub dodge_deadzone: f64,
    pub aerial_sensitivity: f64,
    pub steering_sensitivity: f64,
}

/// Hardware settings preset section.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareSettings {
    pub controller: String,
    pub monitor: String,
    pub headset: String,
}

/// User-defined preset containing camera, control, deadzone and hardware settings.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreset {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub camera: Option<CameraSettings>,
    pub controls: Option<ControlSettings>,
    pub deadzone: Option<DeadzoneSettings>,
    pub hardware: Option<HardwareSettings>,
    pub created_at: String,
    pub updated_at: String,
}

/// Input for creating or updating a user preset (used by commands).
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPresetInput {
    pub id: Option<i64>,
    pub name: String,
    pub description: Option<String>,
    pub camera: Option<CameraSettings>,
    pub controls: Option<ControlSettings>,
    pub deadzone: Option<DeadzoneSettings>,
    pub hardware: Option<HardwareSettings>,
}
