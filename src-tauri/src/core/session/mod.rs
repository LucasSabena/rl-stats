use crate::core::mmr::{playlist_label_to_key, update_local_mmr_estimate};
use crate::core::models::{
    LiveMatchState, LivePlayer, Player, PlayerStats, RlEvent, SessionSummary,
};
use crate::core::settings::{get_settings, set_settings, AppSettings};
use crate::core::storage::{
    compute_head_to_head_conn, finish_match_conn, get_conn, get_or_create_player_conn,
    insert_match_conn, insert_match_event_conn, insert_match_player_conn, insert_session_conn,
    rebuild_daily_rollups_for_identity, upsert_daily_rollup_conn, DbPool, FinishMatchUpdate,
    MatchMmrSnapshot, MatchPlayerRow,
};
use crate::error::AppResult;
use chrono::{Local, Utc};
use std::collections::HashMap;
use tracing::{debug, info, warn};

/// State machine for match lifecycle tracking.
#[derive(Clone, Debug, PartialEq)]
pub enum MatchPhase {
    Waiting,
    Active,
    Finished,
}

/// Manages the current match session in memory.
pub struct SessionManager {
    phase: MatchPhase,
    match_id: Option<i64>,
    match_guid: Option<String>,
    start_time: Option<chrono::DateTime<chrono::Utc>>,
    arena: Option<String>,
    is_online: bool,
    is_overtime: bool,
    time_remaining: i32,
    score_blue: i32,
    score_orange: i32,
    players: HashMap<String, LivePlayer>,
    events: Vec<(String, String, chrono::DateTime<chrono::Utc>, Option<i32>)>, // (event_type, json, occurred_at, game clock)
    ball_speed: f64,
    match_type: Option<String>,
    winner_team_num: Option<i32>,
    max_player_count: usize,
    last_touch_team: Option<i32>,
    mmr_snapshot: Option<MatchMmrSnapshot>,
    // Kickoff goal tracking
    kickoff_threshold_seconds: i32,
    /// Game clock reading when the current round started.
    ///
    /// `None` until a round-start marker is seen. This used to default to `0`,
    /// which made the non-overtime window `time_remaining >= 0 - threshold`,
    /// i.e. always true — so every goal in the match was recorded as a kickoff
    /// goal. Real streams frequently carry no `RoundStarted` at all, so the
    /// default was the common case rather than an edge case.
    round_start_game_time: Option<i32>,
    round_start_wall_time: Option<chrono::DateTime<chrono::Utc>>,
    kickoff_goals_by_player: HashMap<String, i32>,
}

impl SessionManager {
    pub fn new(kickoff_threshold_seconds: i32) -> Self {
        Self {
            phase: MatchPhase::Waiting,
            match_id: None,
            match_guid: None,
            start_time: None,
            arena: None,
            is_online: false,
            is_overtime: false,
            time_remaining: 0,
            score_blue: 0,
            score_orange: 0,
            players: HashMap::new(),
            events: Vec::new(),
            ball_speed: 0.0,
            match_type: Some("ranked".into()),
            winner_team_num: None,
            max_player_count: 0,
            last_touch_team: None,
            mmr_snapshot: None,
            kickoff_threshold_seconds,
            round_start_game_time: None,
            round_start_wall_time: None,
            kickoff_goals_by_player: HashMap::new(),
        }
    }

    pub fn phase(&self) -> &MatchPhase {
        &self.phase
    }

    pub fn players(&self) -> &HashMap<String, LivePlayer> {
        &self.players
    }

    pub fn set_match_type(&mut self, mt: String) {
        self.match_type = Some(mt);
    }

    /// Store the MMR snapshot so it can be persisted with the finished match.
    pub fn set_mmr_snapshot(&mut self, snapshot: MatchMmrSnapshot) {
        self.mmr_snapshot = Some(snapshot);
    }

    /// Update the kickoff-goal window live when the setting changes.
    ///
    /// The threshold used to be read once at startup, so changing it in
    /// Settings had no effect until the app restarted.
    pub fn set_kickoff_threshold_seconds(&mut self, threshold: i32) {
        self.kickoff_threshold_seconds = threshold.max(1);
    }

    /// Map a goal's scorer onto a key that exists in `self.players`.
    ///
    /// Kickoff goals are stored per player and read back by the session's
    /// player key at persist time. The scorer id comes from a different
    /// parser path (`PrimaryId`/`Id`) than the player map key
    /// (`PrimaryId`/`id`, falling back to the object index or the name), so an
    /// exact match is not guaranteed — and a mismatch means the count is
    /// written under a key nobody ever reads, leaving kickoff goals at zero.
    fn resolve_scorer_key(&self, scorer: &crate::core::models::StatfeedTarget) -> Option<String> {
        if !scorer.id.is_empty() {
            if self.players.contains_key(&scorer.id) {
                return Some(scorer.id.clone());
            }
            if let Some(key) = self
                .players
                .keys()
                .find(|k| k.eq_ignore_ascii_case(&scorer.id))
            {
                return Some(key.clone());
            }
        }

        // Fall back to the display name, which the parser also uses as a key
        // when no id is present.
        if !scorer.name.is_empty() {
            if let Some((key, _)) = self
                .players
                .iter()
                .find(|(_, p)| p.name.eq_ignore_ascii_case(&scorer.name))
            {
                return Some(key.clone());
            }
        }

        None
    }

    /// Anchor the start of a round for kickoff-goal detection.
    fn mark_round_start(&mut self) {
        self.round_start_game_time = Some(self.time_remaining);
        self.round_start_wall_time = Some(Utc::now());
    }

    /// Was the goal being processed scored straight off a kickoff?
    ///
    /// Returns false when no round start has been observed yet, so an
    /// unknown anchor can never mark every goal as a kickoff goal.
    fn is_kickoff_goal(&self) -> bool {
        if self.is_overtime {
            // In overtime the game clock sits at 0 and never moves, so the
            // only usable signal is wall-clock time since the round started.
            return self
                .round_start_wall_time
                .map(|start| {
                    let elapsed = (Utc::now() - start).num_seconds();
                    (0..=i64::from(self.kickoff_threshold_seconds)).contains(&elapsed)
                })
                .unwrap_or(false);
        }

        // Regulation: the clock counts down, so a goal is a kickoff goal while
        // time_remaining is still within `threshold` of the round start.
        self.round_start_game_time
            .map(|start| self.time_remaining >= start - self.kickoff_threshold_seconds)
            .unwrap_or(false)
    }

    pub fn live_state(&self) -> LiveMatchState {
        let player_count = self.players.len();
        LiveMatchState {
            match_guid: self.match_guid.clone(),
            arena: self.arena.clone(),
            is_online: self.is_online,
            is_overtime: self.is_overtime,
            time_remaining: self.time_remaining,
            score_blue: self.score_blue,
            score_orange: self.score_orange,
            players: self.players.values().cloned().collect(),
            ball_speed: self.ball_speed,
            player_count,
            match_type: self.match_type.clone(),
            last_touch_team: self.last_touch_team,
        }
    }

    /// Process an incoming RL event and update session state.
    pub fn handle_event(&mut self, event: RlEvent) {
        match &event {
            RlEvent::MatchCreated | RlEvent::MatchInitialized => {
                info!("Match created/initialized");
                self.reset();
                self.phase = MatchPhase::Active;
                self.start_time = Some(Utc::now());
            }
            RlEvent::UpdateState {
                match_guid,
                game,
                players,
            } => {
                if self.phase == MatchPhase::Waiting {
                    self.phase = MatchPhase::Active;
                    self.start_time = Some(Utc::now());
                }
                if self.phase == MatchPhase::Active {
                    if let Some(guid) = match_guid {
                        self.match_guid = Some(guid.clone());
                        self.is_online = true;
                    }
                    self.arena.clone_from(&game.arena);
                    self.is_overtime = game.is_overtime;
                    self.time_remaining = game.time;
                    // Anchor the opening kickoff. Streams don't reliably emit a
                    // round-start marker before the first goal, so without this
                    // the opening kickoff could never be detected.
                    if self.round_start_game_time.is_none() && game.time > 0 {
                        self.mark_round_start();
                    }
                    // A score change means a round finished and a new kickoff
                    // followed. Some streams never emit GoalReplayEnd or
                    // RoundStarted between goals, leaving the anchor pointing
                    // at the opening kickoff — which silently stops counting
                    // kickoff goals after the first one. Re-anchor whenever the
                    // score moves so every kickoff after a goal is evaluated
                    // against a fresh anchor.
                    //
                    // Overtime is the exception: the game clock sits at 0, so
                    // the wall-clock anchor from GoalReplayEnd (fired right
                    // before the restart) is far more accurate than anything
                    // stamped mid-replay. Re-anchoring here would drag the
                    // anchor back to the goal moment — replay (~5s) + countdown
                    // (~3s) already exceed the threshold, so no overtime
                    // kickoff goal could ever count.
                    if let Some(teams) = &game.teams {
                        if !teams.is_empty() {
                            let blue = teams[0].score;
                            let orange = teams.get(1).map(|t| t.score).unwrap_or(0);
                            let score_changed =
                                blue != self.score_blue || orange != self.score_orange;
                            if score_changed
                                && self.round_start_game_time.is_some()
                                && !self.is_overtime
                            {
                                self.mark_round_start();
                            }
                            self.score_blue = blue;
                            self.score_orange = orange;
                        }
                    }
                    self.ball_speed = game.ball.as_ref().map(|ball| ball.speed).unwrap_or(0.0);
                    if let Some(teams) = &game.teams {
                        if !teams.is_empty() {
                            self.score_blue = teams[0].score;
                        }
                        if teams.len() > 1 {
                            self.score_orange = teams[1].score;
                        }
                    }
                    self.max_player_count = self.max_player_count.max(players.len());
                    // Merge players from the snapshot into the session map.
                    // We update existing players with their latest stats AND keep any
                    // player who appeared in a previous snapshot but is no longer present
                    // (e.g. teammate who left before MatchEnded). Without this, departed
                    // players are lost and the match looks like it had fewer participants.
                    for (key, player) in players.iter() {
                        self.players.insert(key.clone(), player.clone());
                    }
                    info!(
                        player_count = players.len(),
                        time = game.time,
                        arena = ?game.arena,
                        blue = self.score_blue,
                        orange = self.score_orange,
                        "UpdateState"
                    );
                }
            }
            RlEvent::ClockUpdatedSeconds { time } => {
                self.time_remaining = *time;
            }
            RlEvent::RoundStarted | RlEvent::CountdownBegin | RlEvent::GoalReplayEnd
                if self.phase == MatchPhase::Active =>
            {
                let event_name = match &event {
                    RlEvent::RoundStarted => "RoundStarted",
                    RlEvent::GoalReplayEnd => "GoalReplayEnd",
                    _ => "CountdownBegin",
                };
                info!("{} event", event_name);
                self.mark_round_start();
                // GoalReplayEnd is only used as a kickoff anchor; it is not
                // part of the persisted match timeline.
                if !matches!(&event, RlEvent::GoalReplayEnd) {
                    let json =
                        serde_json::json!({"time_remaining": self.time_remaining}).to_string();
                    self.events.push((
                        event_name.into(),
                        json,
                        Utc::now(),
                        Some(self.time_remaining),
                    ));
                }
            }
            RlEvent::GoalScored { data } if self.phase == MatchPhase::Active => {
                info!(scorer = %data.scorer.name, "Goal scored");
                // Persist the game-clock reading alongside the goal: it is the
                // evidence the kickoff backfill uses to recount history, and
                // the dedicated column carries it for cheap queries.
                let mut value = serde_json::to_value(data).unwrap_or(serde_json::json!({}));
                if let Some(obj) = value.as_object_mut() {
                    obj.insert(
                        "gameTimeRemaining".into(),
                        serde_json::json!(self.time_remaining),
                    );
                    obj.insert("isOvertime".into(), serde_json::json!(self.is_overtime));
                }
                let json = serde_json::to_string(&value).unwrap_or_default();
                let goal_clock = self.time_remaining;
                self.events
                    .push(("GoalScored".into(), json, Utc::now(), Some(goal_clock)));

                // Capture the score before the kickoff anchor is re-armed, so
                // the kickoff-goal window closes and the next kickoff starts
                // fresh.
                let is_kickoff_goal = self.is_kickoff_goal();

                if is_kickoff_goal {
                    match self.resolve_scorer_key(&data.scorer) {
                        Some(key) => {
                            *self.kickoff_goals_by_player.entry(key.clone()).or_insert(0) += 1;
                            info!(
                                scorer = %data.scorer.name,
                                key = %key,
                                "Kickoff goal detected"
                            );
                        }
                        None => {
                            // Persisting under an unmatched key silently drops
                            // the goal at save time, which is how kickoff goals
                            // ended up permanently at zero.
                            warn!(
                                scorer = %data.scorer.name,
                                scorer_id = %data.scorer.id,
                                "Kickoff goal scorer did not match any player in the session"
                            );
                        }
                    }
                }

                // Re-anchor after every regulation goal so goals scored off the
                // kickoff that follows this one are detected even when the
                // stream never emits GoalReplayEnd / RoundStarted /
                // CountdownBegin. In overtime the anchor must stay on
                // GoalReplayEnd (see above): re-anchoring at the goal moment
                // would push every overtime kickoff goal outside the window.
                if !self.is_overtime {
                    self.mark_round_start();
                }
            }
            RlEvent::StatfeedEvent { data } if self.phase == MatchPhase::Active => {
                debug!(event = %data.event_name, target = %data.main_target.name, "Statfeed event");
                let json = serde_json::to_string(&data).unwrap_or_default();
                self.events
                    .push(("StatfeedEvent".into(), json, Utc::now(), None));
            }
            RlEvent::MatchEnded { winner_team_num } if self.phase == MatchPhase::Active => {
                info!(?winner_team_num, "Match ended");
                self.winner_team_num = *winner_team_num;
                self.phase = MatchPhase::Finished;
            }
            RlEvent::MatchPaused => {
                info!("Match paused");
            }
            RlEvent::MatchUnpaused => {
                info!("Match unpaused");
            }
            RlEvent::MatchDestroyed | RlEvent::PodiumStart => {
                if self.phase == MatchPhase::Active && self.has_meaningful_match_data() {
                    info!("Match destroyed before formal end; finalizing with last known state");
                    self.phase = MatchPhase::Finished;
                }

                if self.phase == MatchPhase::Finished {
                    if matches!(&event, RlEvent::PodiumStart) {
                        info!("Podium start");
                        let json = serde_json::json!({"type": "PodiumStart"}).to_string();
                        self.events
                            .push(("PodiumStart".into(), json, Utc::now(), None));
                    }
                    info!("Match destroyed / podium start");
                }
            }
            RlEvent::CrossbarHit { data } if self.phase == MatchPhase::Active => {
                info!(player = %data.player.name, "Crossbar hit");
                let json = serde_json::to_string(&data).unwrap_or_default();
                self.events
                    .push(("CrossbarHit".into(), json, Utc::now(), None));
            }
            _ => {}
        }
    }

    /// Persist the finished match to storage and generate summary.
    pub fn persist_finished_match(&mut self, pool: &DbPool) -> AppResult<PersistResult> {
        if self.phase != MatchPhase::Finished {
            return Err(crate::error::AppError::StorageError(
                "Match not finished".into(),
            ));
        }

        let guid = self
            .match_guid
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let start_time = self.start_time.unwrap_or_else(Utc::now);
        let end_time = Utc::now();
        let duration = (end_time - start_time).num_seconds() as i32;
        let arena = self.arena.clone().unwrap_or_else(|| "Unknown".into());

        let winner = self.winner_team_num.or({
            if self.score_blue > self.score_orange {
                Some(0)
            } else if self.score_orange > self.score_blue {
                Some(1)
            } else {
                None
            }
        });
        let is_training = self.max_player_count <= 1;
        let effective_match_type = if is_training {
            Some("training")
        } else {
            self.match_type.as_deref()
        };
        let playlist = if is_training {
            None
        } else {
            infer_playlist(self.players.values())
        };

        let conn = get_conn(pool)?;
        conn.execute("BEGIN IMMEDIATE", [])
            .map_err(|e| crate::error::AppError::StorageError(format!("BEGIN failed: {e}")))?;

        let settings = get_settings(pool).unwrap_or_else(|_| AppSettings::default());
        let local_identity = resolve_local_player_identity(self.players.values(), &settings);

        let h2h_map: HashMap<String, crate::core::models::HeadToHeadRecord> =
            if let Some((local_pid, _)) = &local_identity {
                let opponent_ids: Vec<String> = self
                    .players
                    .keys()
                    .filter(|id| *id != local_pid)
                    .cloned()
                    .collect();
                compute_head_to_head_conn(&conn, local_pid, &opponent_ids).unwrap_or_default()
            } else {
                HashMap::new()
            };

        let persist_result = (|| -> AppResult<(i64, Vec<Player>)> {
            let match_id = insert_match_conn(
                &conn,
                &guid,
                start_time,
                Some(&arena),
                self.is_online,
                effective_match_type,
                playlist.as_deref(),
            )?;

            let mut players_vec = Vec::new();
            for (primary_id, live) in &self.players {
                let mmr = self
                    .mmr_snapshot
                    .as_ref()
                    .and_then(|snap| snap.mmr_by_primary_id.get(primary_id))
                    .copied()
                    .flatten();
                let kickoff_goals = *self.kickoff_goals_by_player.get(primary_id).unwrap_or(&0);
                let player_stats = PlayerStats {
                    score: live.score,
                    goals: live.goals,
                    shots: live.shots,
                    assists: live.assists,
                    saves: live.saves,
                    touches: live.touches,
                    car_touches: live.car_touches,
                    demos: live.demos,
                    speed: live.speed,
                    boost: live.boost,
                    mmr,
                    kickoff_goals,
                    head_to_head: None,
                };

                let player_id = get_or_create_player_conn(&conn, primary_id, &live.name)?;
                let h2h_json = h2h_map
                    .get(primary_id)
                    .map(|r| serde_json::to_string(r).unwrap_or_default());

                insert_match_player_conn(
                    &conn,
                    match_id,
                    MatchPlayerRow {
                        player_id,
                        team_num: live.team,
                        stats: player_stats.clone(),
                        head_to_head_json: h2h_json,
                    },
                )?;

                players_vec.push(Player {
                    id: player_id,
                    primary_id: primary_id.clone(),
                    name: live.name.clone(),
                    team_num: live.team,
                    stats: player_stats,
                });
            }

            finish_match_conn(
                &conn,
                match_id,
                FinishMatchUpdate {
                    end_time,
                    score_blue: self.score_blue,
                    score_orange: self.score_orange,
                    winner,
                    is_overtime: self.is_overtime,
                    duration_seconds: duration,
                },
            )?;

            for (event_type, event_data, occurred_at, game_clock) in &self.events {
                insert_match_event_conn(
                    &conn,
                    match_id,
                    event_type,
                    event_data,
                    *occurred_at,
                    *game_clock,
                )?;
            }

            Ok((match_id, players_vec))
        })();

        let (match_id, players_vec) = match persist_result {
            Ok(result) => result,
            Err(error) => {
                let _ = conn.execute("ROLLBACK", []);
                return Err(error);
            }
        };
        self.match_id = Some(match_id);

        let mut settings = get_settings(pool).unwrap_or_else(|_| AppSettings::default());
        let local_identity = resolve_local_player_identity(self.players.values(), &settings);

        let my_team = local_identity.as_ref().map(|(_, team_num)| *team_num);

        let is_win = matches!((winner, my_team), (Some(winner_team), Some(my_team)) if winner_team == my_team);
        let is_loss = matches!((winner, my_team), (Some(winner_team), Some(my_team)) if winner_team != my_team);

        let my_goals: i32 = players_vec
            .iter()
            .filter(|p| Some(p.team_num) == my_team)
            .map(|p| p.stats.goals)
            .sum();
        let their_goals: i32 = players_vec
            .iter()
            .filter(|p| my_team.is_some() && Some(p.team_num) != my_team)
            .map(|p| p.stats.goals)
            .sum();
        let total_shots: i32 = players_vec
            .iter()
            .filter(|p| Some(p.team_num) == my_team)
            .map(|p| p.stats.shots)
            .sum();
        let total_saves: i32 = players_vec
            .iter()
            .filter(|p| Some(p.team_num) == my_team)
            .map(|p| p.stats.saves)
            .sum();
        let total_demos: i32 = players_vec
            .iter()
            .filter(|p| Some(p.team_num) == my_team)
            .map(|p| p.stats.demos)
            .sum();
        let total_assists: i32 = players_vec
            .iter()
            .filter(|p| Some(p.team_num) == my_team)
            .map(|p| p.stats.assists)
            .sum();
        let my_score: i32 = players_vec
            .iter()
            .filter(|p| Some(p.team_num) == my_team)
            .map(|p| p.stats.score)
            .sum();

        let my_kickoff_goals: i32 = players_vec
            .iter()
            .filter(|p| Some(p.team_num) == my_team)
            .map(|p| p.stats.kickoff_goals)
            .sum();
        let their_kickoff_goals: i32 = players_vec
            .iter()
            .filter(|p| my_team.is_some() && Some(p.team_num) != my_team)
            .map(|p| p.stats.kickoff_goals)
            .sum();

        let local_pre_match_mmr = local_identity.as_ref().and_then(|(local_primary_id, _)| {
            players_vec
                .iter()
                .find(|player| player.primary_id == *local_primary_id)
                .and_then(|player| player.stats.mmr)
        });

        let summary = SessionSummary {
            match_guid: guid.clone(),
            duration_seconds: duration,
            score_blue: self.score_blue,
            score_orange: self.score_orange,
            winner,
            local_primary_id: local_identity
                .as_ref()
                .map(|(primary_id, _)| primary_id.clone()),
            local_team_num: my_team,
            players: players_vec,
            match_type: self.match_type.clone(),
            kickoff_goals_scored: my_kickoff_goals,
            kickoff_goals_conceded: their_kickoff_goals,
        };

        if let Err(error) = insert_session_conn(&conn, match_id, &summary) {
            let _ = conn.execute("ROLLBACK", []);
            return Err(error);
        }

        // Update daily rollup — skip for training matches.
        // The bucket date is local time: rollups grouped by UTC date split
        // evening sessions across two days.
        if !is_training {
            let date = start_time
                .with_timezone(&Local)
                .format("%Y-%m-%d")
                .to_string();

            let rollup = crate::core::models::DailyRollup {
                date,
                matches_played: 1,
                wins: if is_win { 1 } else { 0 },
                losses: if is_loss { 1 } else { 0 },
                goals_scored: my_goals,
                goals_conceded: their_goals,
                total_shots,
                total_saves,
                avg_duration_seconds: duration,
                total_demos,
                total_assists,
                avg_score: my_score,
                kickoff_goals_scored: my_kickoff_goals,
                kickoff_goals_conceded: their_kickoff_goals,
            };
            if let Err(error) = upsert_daily_rollup_conn(&conn, &rollup) {
                let _ = conn.execute("ROLLBACK", []);
                return Err(error);
            }
        }

        conn.execute("COMMIT", [])
            .map_err(|e| crate::error::AppError::StorageError(format!("COMMIT failed: {e}")))?;

        if self.is_online {
            if let (Some((local_primary_id, _)), Some(playlist_label), Some(is_win)) = (
                local_identity.as_ref(),
                playlist.as_deref(),
                winner
                    .zip(my_team)
                    .map(|(winner_team, my_team)| winner_team == my_team),
            ) {
                if let Some(playlist_key) = playlist_label_to_key(playlist_label) {
                    if let Err(error) = update_local_mmr_estimate(
                        pool,
                        local_primary_id,
                        playlist_key,
                        local_pre_match_mmr,
                        is_win,
                    ) {
                        warn!(error = %error, "Failed to update local MMR estimate");
                    }
                }
            }
        }

        let detected_identity = local_identity.as_ref().map(|(pid, _)| {
            let player_name = self
                .players
                .iter()
                .find(|(id, _)| *id == pid)
                .map(|(_, lp)| lp.name.clone())
                .unwrap_or_default();
            (pid.clone(), player_name)
        });

        if let Some((local_primary_id, _)) = &local_identity {
            let should_save =
                settings.local_primary_id.as_deref() != Some(local_primary_id.as_str());
            if should_save {
                settings.local_primary_id = Some(local_primary_id.clone());
                if let Err(e) = set_settings(pool, &settings) {
                    warn!(error = %e, "Failed to persist local primary id");
                } else if let Err(e) = rebuild_daily_rollups_for_identity(
                    pool,
                    settings.local_primary_id.as_deref(),
                    &identity_candidate_names(&settings),
                ) {
                    warn!(error = %e, "Failed to rebuild daily rollups after learning local primary id");
                }
            }
        }

        info!(match_id, "Match persisted successfully");
        Ok(PersistResult {
            match_id,
            is_training,
            summary,
            detected_primary_id: detected_identity.as_ref().map(|(pid, _)| pid.clone()),
            detected_player_name: detected_identity.as_ref().map(|(_, name)| name.clone()),
        })
    }

    fn reset(&mut self) {
        self.phase = MatchPhase::Waiting;
        self.match_id = None;
        self.match_guid = None;
        self.start_time = None;
        self.arena = None;
        self.is_online = false;
        self.is_overtime = false;
        self.time_remaining = 0;
        self.score_blue = 0;
        self.score_orange = 0;
        self.players.clear();
        self.events.clear();
        self.ball_speed = 0.0;
        self.winner_team_num = None;
        self.max_player_count = 0;
        self.last_touch_team = None;
        self.mmr_snapshot = None;
        self.round_start_game_time = None;
        self.round_start_wall_time = None;
        self.kickoff_goals_by_player.clear();
    }

    fn has_meaningful_match_data(&self) -> bool {
        !self.players.is_empty()
            || !self.events.is_empty()
            || self.score_blue != 0
            || self.score_orange != 0
    }
}

pub struct PersistResult {
    pub match_id: i64,
    pub is_training: bool,
    pub summary: SessionSummary,
    pub detected_primary_id: Option<String>,
    pub detected_player_name: Option<String>,
}

fn infer_playlist<'a>(players: impl Iterator<Item = &'a LivePlayer>) -> Option<String> {
    let (blue_count, orange_count) = players.fold((0usize, 0usize), |(blue, orange), player| {
        match player.team {
            0 => (blue + 1, orange),
            1 => (blue, orange + 1),
            _ => (blue, orange),
        }
    });

    let total = blue_count + orange_count;
    let team_size = blue_count.max(orange_count);
    let playlist = match total {
        0 | 1 => return None, // solo = training, not a real playlist
        2 => "Duel",
        _ => match team_size {
            1 => "Duel",
            2 => "Doubles",
            3 => "Standard",
            4 => "Chaos",
            _ => "Other",
        },
    };

    Some(playlist.to_string())
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new(7)
    }
}

pub fn resolve_local_player_identity<'a>(
    players: impl Iterator<Item = &'a LivePlayer>,
    settings: &AppSettings,
) -> Option<(String, i32)> {
    let players = players.collect::<Vec<_>>();

    if let Some(local_primary_id) = settings.local_primary_id.as_deref() {
        if let Some(player) = players.iter().find(|player| player.id == local_primary_id) {
            return Some((player.id.clone(), player.team));
        }
    }

    // When the running install's platform is known (Steam vs Epic), prefer the
    // in-match player whose PrimaryId belongs to that platform before falling
    // back to name matching. This prevents a name match from resolving to the
    // wrong platform account when the same name exists on both.
    if let Some(platform) = settings.active_platform.as_deref() {
        let prefix = match platform {
            "steam" => "Steam|",
            "epic" => "Epic|",
            _ => "",
        };
        if !prefix.is_empty() {
            if let Some(player) = players.iter().find(|player| player.id.starts_with(prefix)) {
                return Some((player.id.clone(), player.team));
            }
        }
    }

    for candidate_name in [
        &settings.player_name,
        settings.tracker_username.as_deref().unwrap_or(""),
    ] {
        let candidate_name = candidate_name.trim();
        if candidate_name.is_empty() {
            continue;
        }

        if let Some(player) = players
            .iter()
            .find(|player| player.name.trim().eq_ignore_ascii_case(candidate_name))
        {
            return Some((player.id.clone(), player.team));
        }
    }

    None
}

pub fn identity_candidate_names(settings: &AppSettings) -> Vec<String> {
    let mut names = Vec::new();

    if !settings.player_name.trim().is_empty() {
        names.push(settings.player_name.trim().to_string());
    }

    if let Some(username) = &settings.tracker_username {
        let username = username.trim();
        if !username.is_empty() && !names.iter().any(|name| name.eq_ignore_ascii_case(username)) {
            names.push(username.to_string());
        }
    }

    names
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::models::{GameState, GoalScoredData, StatfeedTarget};

    const THRESHOLD: i32 = 7;

    fn scorer(id: &str) -> GoalScoredData {
        GoalScoredData {
            scorer: StatfeedTarget {
                id: id.to_string(),
                name: id.to_string(),
                team_num: 0,
            },
            assister: None,
        }
    }

    fn live_player(id: &str, name: &str) -> LivePlayer {
        LivePlayer {
            id: id.to_string(),
            name: name.to_string(),
            team: 0,
            score: 0,
            goals: 0,
            shots: 0,
            assists: 0,
            saves: 0,
            touches: 0,
            car_touches: 0,
            demos: 0,
            speed: 0.0,
            boost: 0,
            kickoff_goals: 0,
        }
    }

    fn update_state_with(time: i32, players: HashMap<String, LivePlayer>) -> RlEvent {
        RlEvent::UpdateState {
            match_guid: Some("guid-1".into()),
            game: GameState {
                teams: None,
                time,
                is_overtime: false,
                ball: None,
                arena: Some("stadium_p".into()),
                target: None,
            },
            players,
        }
    }

    /// A live session with the two scorers used across these tests already
    /// present. Kickoff goals are attributed to a player in the session, so a
    /// roster is required for a goal to be recorded at all.
    fn started_session() -> SessionManager {
        let mut session = SessionManager::new(THRESHOLD);
        session.handle_event(RlEvent::MatchCreated);

        let mut players = HashMap::new();
        players.insert("p1".to_string(), live_player("p1", "Alpha"));
        players.insert("p2".to_string(), live_player("p2", "Beta"));
        session.handle_event(update_state_with(300, players));
        session
    }

    fn kickoff_goals(session: &SessionManager, id: &str) -> i32 {
        *session.kickoff_goals_by_player.get(id).unwrap_or(&0)
    }

    #[test]
    fn goal_right_off_the_opening_kickoff_counts() {
        let mut session = started_session();
        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 296 });
        session.handle_event(RlEvent::GoalScored { data: scorer("p1") });

        assert_eq!(kickoff_goals(&session, "p1"), 1);
    }

    #[test]
    fn goal_in_open_play_does_not_count() {
        let mut session = started_session();
        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 200 });
        session.handle_event(RlEvent::GoalScored { data: scorer("p1") });

        assert_eq!(
            kickoff_goals(&session, "p1"),
            0,
            "a goal 100s into the round is not a kickoff goal"
        );
    }

    /// Regression: `round_start_game_time` used to default to 0, making the
    /// window `time_remaining >= -threshold` — true for every goal. Real
    /// streams often carry no round-start marker, so this was the norm.
    #[test]
    fn goals_are_not_all_kickoff_goals_without_a_round_marker() {
        let mut session = SessionManager::new(THRESHOLD);
        session.handle_event(RlEvent::MatchCreated);
        // No UpdateState and no RoundStarted: the anchor is unknown.
        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 180 });
        session.handle_event(RlEvent::GoalScored { data: scorer("p1") });

        assert_eq!(
            kickoff_goals(&session, "p1"),
            0,
            "an unknown round start must not mark every goal as a kickoff goal"
        );
    }

    /// Real streams emit GoalReplayEnd before each restart but frequently no
    /// RoundStarted, so it has to work as a kickoff anchor.
    #[test]
    fn goal_replay_end_anchors_the_next_kickoff() {
        let mut session = started_session();

        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 240 });
        session.handle_event(RlEvent::GoalScored { data: scorer("p1") });
        assert_eq!(kickoff_goals(&session, "p1"), 0);

        // Kickoff after the replay, then an immediate goal.
        session.handle_event(RlEvent::GoalReplayEnd);
        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 236 });
        session.handle_event(RlEvent::GoalScored { data: scorer("p2") });

        assert_eq!(kickoff_goals(&session, "p2"), 1);
    }

    #[test]
    fn round_started_resets_the_anchor() {
        let mut session = started_session();
        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 150 });
        session.handle_event(RlEvent::RoundStarted);
        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 145 });
        session.handle_event(RlEvent::GoalScored { data: scorer("p1") });

        assert_eq!(kickoff_goals(&session, "p1"), 1);
    }

    #[test]
    fn goal_exactly_on_the_threshold_still_counts() {
        let mut session = started_session();
        session.handle_event(RlEvent::ClockUpdatedSeconds {
            time: 300 - THRESHOLD,
        });
        session.handle_event(RlEvent::GoalScored { data: scorer("p1") });

        assert_eq!(kickoff_goals(&session, "p1"), 1);

        // One second past the window.
        session.handle_event(RlEvent::GoalReplayEnd);
        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 280 });
        session.handle_event(RlEvent::RoundStarted);
        session.handle_event(RlEvent::ClockUpdatedSeconds {
            time: 280 - THRESHOLD - 1,
        });
        session.handle_event(RlEvent::GoalScored { data: scorer("p2") });

        assert_eq!(kickoff_goals(&session, "p2"), 0);
    }

    /// Regression: kickoff goals were stored under the raw scorer id, but read
    /// back at persist time using the session's player-map key. When those
    /// differed the count was written somewhere nobody reads, so kickoff goals
    /// sat permanently at zero.
    #[test]
    fn kickoff_goal_is_attributed_to_the_session_player_key() {
        let mut session = SessionManager::new(THRESHOLD);
        session.handle_event(RlEvent::MatchCreated);

        let mut players = HashMap::new();
        players.insert(
            "Player1_guid".to_string(),
            live_player("Player1_guid", "Alpha"),
        );
        session.handle_event(update_state_with(300, players));

        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 297 });
        session.handle_event(RlEvent::GoalScored {
            data: scorer("Player1_guid"),
        });

        assert_eq!(kickoff_goals(&session, "Player1_guid"), 1);
    }

    #[test]
    fn kickoff_goal_matches_the_player_key_case_insensitively() {
        let mut session = SessionManager::new(THRESHOLD);
        session.handle_event(RlEvent::MatchCreated);

        let mut players = HashMap::new();
        players.insert("ABC123".to_string(), live_player("ABC123", "Alpha"));
        session.handle_event(update_state_with(300, players));

        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 297 });
        session.handle_event(RlEvent::GoalScored {
            data: scorer("abc123"),
        });

        assert_eq!(kickoff_goals(&session, "ABC123"), 1);
    }

    /// Some streams key players by object index and carry no PrimaryId, so the
    /// only thing tying a goal to a player is the display name.
    #[test]
    fn kickoff_goal_falls_back_to_the_player_name() {
        let mut session = SessionManager::new(THRESHOLD);
        session.handle_event(RlEvent::MatchCreated);

        let mut players = HashMap::new();
        players.insert("0".to_string(), live_player("", "Alpha"));
        session.handle_event(update_state_with(300, players));

        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 297 });
        let mut data = scorer("");
        data.scorer.name = "Alpha".into();
        session.handle_event(RlEvent::GoalScored { data });

        assert_eq!(kickoff_goals(&session, "0"), 1);
    }

    #[test]
    fn unmatched_scorer_is_dropped_rather_than_stored_under_a_dead_key() {
        let mut session = SessionManager::new(THRESHOLD);
        session.handle_event(RlEvent::MatchCreated);

        let mut players = HashMap::new();
        players.insert("known".to_string(), live_player("known", "Alpha"));
        session.handle_event(update_state_with(300, players));

        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 297 });
        session.handle_event(RlEvent::GoalScored {
            data: scorer("someone-else"),
        });

        assert_eq!(kickoff_goals(&session, "someone-else"), 0);
        assert_eq!(kickoff_goals(&session, "known"), 0);
    }

    #[test]
    fn reset_clears_the_anchor_between_matches() {
        let mut session = started_session();
        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 296 });
        session.handle_event(RlEvent::GoalScored { data: scorer("p1") });
        assert_eq!(kickoff_goals(&session, "p1"), 1);

        session.handle_event(RlEvent::MatchCreated);
        assert!(session.round_start_game_time.is_none());
        assert_eq!(kickoff_goals(&session, "p1"), 0);
    }

    /// Regression: streams that never emit GoalReplayEnd / RoundStarted /
    /// CountdownBegin between goals left the anchor pointing at the opening
    /// kickoff, so every kickoff goal after the first was missed. Goals now
    /// re-anchor the round, so the goal right after the restart still counts.
    #[test]
    fn kickoff_goal_after_previous_goal_counts_without_round_markers() {
        let mut session = started_session();

        // First goal at 296 (kickoff goal).
        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 296 });
        session.handle_event(RlEvent::GoalScored { data: scorer("p1") });
        assert_eq!(kickoff_goals(&session, "p1"), 1);

        // Restart happens but the stream sends only a clock update (no
        // GoalReplayEnd / RoundStarted / CountdownBegin). Goal right after
        // the restart must count as a kickoff goal.
        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 292 });
        session.handle_event(RlEvent::GoalScored { data: scorer("p2") });
        assert_eq!(
            kickoff_goals(&session, "p2"),
            1,
            "kickoff goal after a restart without round markers must count"
        );
    }

    fn overtime_state(time: i32, is_overtime: bool) -> RlEvent {
        RlEvent::UpdateState {
            match_guid: Some("guid-ot".into()),
            game: GameState {
                teams: None,
                time,
                is_overtime,
                ball: None,
                arena: Some("stadium_p".into()),
                target: None,
            },
            players: {
                let mut players = HashMap::new();
                players.insert("p1".to_string(), live_player("p1", "Alpha"));
                players.insert("p2".to_string(), live_player("p2", "Beta"));
                players
            },
        }
    }

    /// Overtime kickoff goals must count when GoalReplayEnd anchors the
    /// restart — the game clock sits at 0, so the wall-clock anchor is the
    /// only signal. Previously the goal-time re-anchor pushed the anchor back
    /// past replay + countdown, so no overtime kickoff goal ever counted.
    #[test]
    fn overtime_kickoff_goal_counts_off_replay_end_anchor() {
        let mut session = started_session();
        session.handle_event(overtime_state(0, true));

        // Goal during overtime, then the replay ends and the restart goal
        // comes quickly.
        session.handle_event(RlEvent::GoalScored { data: scorer("p1") });
        session.handle_event(RlEvent::GoalReplayEnd);
        session.handle_event(RlEvent::GoalScored { data: scorer("p2") });

        assert_eq!(
            kickoff_goals(&session, "p2"),
            1,
            "overtime goal right after the replay must count as a kickoff goal"
        );
    }

    /// Without any replay anchor in overtime there is no evidence of a
    /// restart, so the goal must not count.
    #[test]
    fn overtime_goal_without_replay_anchor_does_not_count() {
        let mut session = started_session();
        session.handle_event(overtime_state(0, true));
        // Reset the wall anchor so only the goal-time path remains — which is
        // deliberately disabled in overtime.
        session.round_start_wall_time = None;
        session.handle_event(RlEvent::GoalScored { data: scorer("p1") });

        assert_eq!(kickoff_goals(&session, "p1"), 0);
    }

    /// The threshold can be updated live when the setting changes.
    #[test]
    fn kickoff_threshold_updates_live() {
        let mut session = started_session();
        session.set_kickoff_threshold_seconds(1);
        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 290 });
        session.handle_event(RlEvent::GoalScored { data: scorer("p1") });

        assert_eq!(
            kickoff_goals(&session, "p1"),
            0,
            "with a 1s threshold a goal 10s in must not count"
        );
    }

    /// GoalScored events persist the game-clock reading for the backfill.
    #[test]
    fn goal_events_carry_the_game_clock() {
        let mut session = started_session();
        session.handle_event(RlEvent::ClockUpdatedSeconds { time: 294 });
        session.handle_event(RlEvent::GoalScored { data: scorer("p1") });

        let (event_type, json, _, clock) = session
            .events
            .iter()
            .find(|(t, _, _, _)| t == "GoalScored")
            .expect("goal event must be recorded");
        assert_eq!(event_type, "GoalScored");
        assert_eq!(*clock, Some(294));
        let value: serde_json::Value = serde_json::from_str(json).expect("goal json must parse");
        assert_eq!(
            value.get("gameTimeRemaining").and_then(|v| v.as_i64()),
            Some(294)
        );
    }
}
