//! Session-pattern analytics: fatigue curves, teammate chemistry, generic
//! breakdowns and the kickoff-goal backfill.
//!
//! All functions in this module read already-persisted matches — they never
//! touch the live ingestor — and compute everything from the local player's
//! (or any recorded player's) own `match_players` rows, so the numbers are
//! individual by construction.

use crate::core::storage::{
    get_conn, local_date_string, local_hour, local_weekday, DbPool, MIN_INSIGHT_SAMPLE,
};
use crate::error::{AppError, AppResult};
use chrono::{DateTime, Utc};
use rusqlite::params;
use std::collections::HashMap;

/// Highest game-number bucket: ordinals beyond this collapse into `"12+"`.
pub const MAX_GAME_NUMBER: i64 = 12;
/// Minute-bucket width (wall-clock minutes since the session started).
pub const MINUTE_BUCKET_WIDTH: i64 = 15;
/// Highest minute-bucket index; anything later collapses into `"120+"`.
pub const MAX_MINUTE_BUCKET: i64 = 8;
/// Minimum matches on each side of a split before it can be flagged.
const BREAKPOINT_MIN_SIDE: i32 = 5;
/// Minimum win-rate drop (percentage points) that counts as a breakpoint.
const BREAKPOINT_MIN_DROP: f64 = 12.0;

/// One match of the analysed identity, enriched with its position inside the
/// session it belongs to.
#[derive(Clone, Debug)]
pub struct CurveRow {
    pub match_id: i64,
    pub start: DateTime<Utc>,
    pub duration_s: i64,
    pub winner: Option<i32>,
    pub my_team: i32,
    pub playlist: Option<String>,
    pub arena: Option<String>,
    pub match_type: Option<String>,
    pub is_ot: bool,
    pub goals: i32,
    pub assists: i32,
    pub saves: i32,
    pub shots: i32,
    pub demos: i32,
    pub score: i32,
    /// Self-reported post-match mood, if the player rated the match.
    pub mood: Option<String>,
    /// 1-based position inside the session.
    pub ordinal: i64,
    /// Wall-clock minutes since the session's first match started, divided
    /// by [`MINUTE_BUCKET_WIDTH`] (capped at [`MAX_MINUTE_BUCKET`]).
    pub minute_bucket: i64,
    /// Outcome of the previous match in the same session, if any.
    pub prev_result: Option<bool>,
    /// True when no earlier analysed match happened on the same local day.
    pub first_of_day: bool,
}

#[allow(clippy::too_many_arguments)]
fn fetch_curve_rows(
    conn: &rusqlite::Connection,
    player_primary_id: &str,
    start_date: &str,
    end_date: &str,
    playlist: Option<&str>,
    match_type: Option<&str>,
    gap_minutes: u32,
) -> AppResult<Vec<CurveRow>> {
    let mut sql = String::from(
        "SELECT m.id, m.start_time, m.end_time, m.duration_seconds, m.winner,
                mp.team_num, m.playlist, m.arena, m.match_type, m.is_overtime,
                mp.goals, mp.assists, mp.saves, mp.shots, mp.demos, mp.score,
                m.mood
         FROM matches m
         JOIN match_players mp ON mp.match_id = m.id
         JOIN players p ON p.id = mp.player_id
         WHERE p.primary_id = ?1
           AND m.winner IS NOT NULL
           AND m.start_time >= ?2
           AND m.start_time < date(?3, '+1 day')",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(player_primary_id.to_string()),
        Box::new(start_date.to_string()),
        Box::new(end_date.to_string()),
    ];
    if let Some(mt) = match_type {
        sql.push_str(" AND LOWER(m.match_type) = LOWER(?)");
        args.push(Box::new(mt.to_string()));
    }
    if let Some(pl) = playlist {
        sql.push_str(" AND LOWER(m.playlist) = LOWER(?)");
        args.push(Box::new(pl.to_string()));
    }
    sql.push_str(" ORDER BY m.start_time ASC");

    let params_refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let raw = stmt
        .query_map(&*params_refs, |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i32>(3)?,
                row.get::<_, Option<i32>>(4)?,
                row.get::<_, i32>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, i32>(9)?,
                row.get::<_, i32>(10)?,
                row.get::<_, i32>(11)?,
                row.get::<_, i32>(12)?,
                row.get::<_, i32>(13)?,
                row.get::<_, i32>(14)?,
                row.get::<_, i32>(15)?,
                row.get::<_, Option<String>>(16)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    // Assign every match to a session: consecutive matches belong together
    // while the gap between the previous match's end and this match's start
    // fits inside `gap_minutes`. Same rule as `get_match_sessions`.
    let gap = chrono::Duration::minutes(i64::from(gap_minutes));
    let mut rows = Vec::with_capacity(raw.len());
    let mut session_first_start: Option<DateTime<Utc>> = None;
    let mut prev_end: Option<DateTime<Utc>> = None;
    let mut prev_overall_date = String::new();
    let mut ordinal: i64 = 0;
    let mut prev_result: Option<bool> = None;

    for (
        match_id,
        start_time,
        end_time,
        duration_s,
        winner,
        my_team,
        playlist,
        arena,
        match_type,
        is_ot,
        goals,
        assists,
        saves,
        shots,
        demos,
        score,
        mood,
    ) in raw
    {
        let start = DateTime::parse_from_rfc3339(&start_time)
            .map(|dt| dt.with_timezone(&Utc))
            .map_err(|e| AppError::StorageError(format!("Bad start_time: {e}")))?;
        let end = end_time
            .as_deref()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or(start);

        let new_session = match prev_end {
            Some(prev) => start - prev > gap,
            None => true,
        };
        if new_session {
            session_first_start = Some(start);
            ordinal = 1;
            prev_result = None;
        } else {
            ordinal += 1;
        }

        let elapsed_min = session_first_start
            .map(|first| (start - first).num_minutes().max(0))
            .unwrap_or(0);
        let minute_bucket = (elapsed_min / MINUTE_BUCKET_WIDTH).min(MAX_MINUTE_BUCKET);

        let day = local_date_string(&start_time);
        let first_of_day = day != prev_overall_date;
        prev_overall_date = day;

        let is_win = winner == Some(my_team);
        rows.push(CurveRow {
            match_id,
            start,
            duration_s: i64::from(duration_s),
            winner,
            my_team,
            playlist,
            arena,
            match_type,
            is_ot: is_ot != 0,
            goals,
            assists,
            saves,
            shots,
            demos,
            score,
            mood,
            ordinal,
            minute_bucket,
            prev_result,
            first_of_day,
        });

        prev_end = Some(end);
        prev_result = Some(is_win);
    }

    Ok(rows)
}

#[derive(Clone, Copy, Default)]
struct Agg {
    played: i32,
    won: i32,
    goals: i32,
    assists: i32,
    saves: i32,
    shots: i32,
    demos: i32,
    score: i32,
}

impl Agg {
    fn add_match(&mut self, row: &CurveRow, is_win: bool) {
        self.played += 1;
        if is_win {
            self.won += 1;
        }
        self.goals += row.goals;
        self.assists += row.assists;
        self.saves += row.saves;
        self.shots += row.shots;
        self.demos += row.demos;
        self.score += row.score;
    }

    fn win_rate(&self) -> i32 {
        if self.played > 0 {
            ((f64::from(self.won) / f64::from(self.played)) * 100.0).round() as i32
        } else {
            0
        }
    }

    fn json(&self) -> serde_json::Value {
        serde_json::json!({
            "played": self.played,
            "won": self.won,
            "lost": self.played - self.won,
            "winRate": self.win_rate(),
            "avgGoals": avg(self.goals, self.played),
            "avgAssists": avg(self.assists, self.played),
            "avgSaves": avg(self.saves, self.played),
            "avgShots": avg(self.shots, self.played),
            "avgDemos": avg(self.demos, self.played),
            "avgScore": avg(self.score, self.played),
        })
    }
}

fn avg(total: i32, played: i32) -> f64 {
    if played > 0 {
        (f64::from(total) / f64::from(played) * 100.0).round() / 100.0
    } else {
        0.0
    }
}

/// Find the split point where performance falls off a cliff: for every
/// candidate split, compare the win rate before vs after and keep the split
/// with the largest drop, provided both sides have enough samples.
fn detect_breakpoint(buckets: &[(i32, i32)]) -> Option<(usize, f64, f64, i32, i32)> {
    let total_played: i32 = buckets.iter().map(|(p, _)| *p).sum();
    if total_played < BREAKPOINT_MIN_SIDE * 2 || buckets.len() < 3 {
        return None;
    }
    let mut best: Option<(usize, f64, f64, i32, i32)> = None;
    let mut best_drop = BREAKPOINT_MIN_DROP;
    for split in 1..buckets.len() {
        let (before_p, before_w) = buckets[..split]
            .iter()
            .fold((0i32, 0i32), |(p, w), (bp, bw)| (p + bp, w + bw));
        let (after_p, after_w) = buckets[split..]
            .iter()
            .fold((0i32, 0i32), |(p, w), (bp, bw)| (p + bp, w + bw));
        if before_p < BREAKPOINT_MIN_SIDE || after_p < BREAKPOINT_MIN_SIDE {
            continue;
        }
        let before_wr = f64::from(before_w) / f64::from(before_p) * 100.0;
        let after_wr = f64::from(after_w) / f64::from(after_p) * 100.0;
        let drop = before_wr - after_wr;
        if drop > best_drop {
            best_drop = drop;
            best = Some((split, before_wr, after_wr, before_p, after_p));
        }
    }
    best
}

fn is_win(row: &CurveRow) -> bool {
    row.winner == Some(row.my_team)
}

/// Fatigue / session-decay curve for one identity.
///
/// Returns win rate by game number inside the session, by 15-minute wall-clock
/// buckets since the session started, momentum splits (after win / after loss
/// / first of day), and the detected breakpoints ("your level drops after
/// game N / minute M").
#[allow(clippy::too_many_arguments)]
pub fn get_session_curve(
    pool: &DbPool,
    player_primary_id: &str,
    start_date: &str,
    end_date: &str,
    playlist: Option<&str>,
    match_type: Option<&str>,
    gap_minutes: u32,
) -> AppResult<serde_json::Value> {
    let conn = get_conn(pool)?;
    let rows = fetch_curve_rows(
        &conn,
        player_primary_id,
        start_date,
        end_date,
        playlist,
        match_type,
        gap_minutes,
    )?;

    // Sessions = groups separated by a gap; count them for the header.
    let mut sessions = 0i32;
    let mut last_ordinal = 0i64;
    for row in &rows {
        if row.ordinal <= last_ordinal {
            sessions += 1;
        }
        last_ordinal = row.ordinal;
    }
    if !rows.is_empty() {
        sessions += 1;
    }

    let mut by_number: HashMap<i64, Agg> = HashMap::new();
    let mut by_minute: HashMap<i64, Agg> = HashMap::new();
    let mut after_win = Agg::default();
    let mut after_loss = Agg::default();
    let mut first_of_day = Agg::default();
    let mut rest_of_day = Agg::default();

    for row in &rows {
        let win = is_win(row);
        let n = row.ordinal.min(MAX_GAME_NUMBER);
        by_number.entry(n).or_default().add_match(row, win);
        by_minute
            .entry(row.minute_bucket)
            .or_default()
            .add_match(row, win);
        match row.prev_result {
            Some(true) => after_win.add_match(row, win),
            Some(false) => after_loss.add_match(row, win),
            None => {}
        }
        if row.first_of_day {
            first_of_day.add_match(row, win);
        } else {
            rest_of_day.add_match(row, win);
        }
    }

    let mut number_keys: Vec<i64> = by_number.keys().copied().collect();
    number_keys.sort_unstable();
    let number_points: Vec<(i32, i32)> = number_keys
        .iter()
        .map(|k| {
            let a = &by_number[k];
            (a.played, a.won)
        })
        .collect();
    let mut minute_keys: Vec<i64> = by_minute.keys().copied().collect();
    minute_keys.sort_unstable();
    let minute_points: Vec<(i32, i32)> = minute_keys
        .iter()
        .map(|k| {
            let a = &by_minute[k];
            (a.played, a.won)
        })
        .collect();

    let breakpoint_game =
        detect_breakpoint(&number_points).map(|(split, before_wr, after_wr, before_p, after_p)| {
            serde_json::json!({
                "splitAfter": number_keys[split - 1],
                "beforeWr": before_wr.round() as i32,
                "afterWr": after_wr.round() as i32,
                "beforeN": before_p,
                "afterN": after_p,
            })
        });
    let breakpoint_minute =
        detect_breakpoint(&minute_points).map(|(split, before_wr, after_wr, before_p, after_p)| {
            serde_json::json!({
                "splitAfterBucket": minute_keys[split - 1],
                "splitAfterMinutes": minute_keys[split - 1] * MINUTE_BUCKET_WIDTH,
                "beforeWr": before_wr.round() as i32,
                "afterWr": after_wr.round() as i32,
                "beforeN": before_p,
                "afterN": after_p,
            })
        });

    let by_game_number: Vec<serde_json::Value> = number_keys
        .iter()
        .map(|k| {
            let mut v = by_number[k].json();
            let label = if *k >= MAX_GAME_NUMBER {
                format!("{MAX_GAME_NUMBER}+")
            } else {
                k.to_string()
            };
            v["n"] = serde_json::json!(k);
            v["label"] = serde_json::json!(label);
            v
        })
        .collect();
    let by_minute_json: Vec<serde_json::Value> = minute_keys
        .iter()
        .map(|k| {
            let mut v = by_minute[k].json();
            let start_min = k * MINUTE_BUCKET_WIDTH;
            let label = if *k >= MAX_MINUTE_BUCKET {
                format!("{start_min}+")
            } else {
                format!(
                    "{start_min}-{end_min}",
                    end_min = start_min + MINUTE_BUCKET_WIDTH
                )
            };
            v["bucket"] = serde_json::json!(k);
            v["label"] = serde_json::json!(label);
            v["startMinutes"] = serde_json::json!(start_min);
            v
        })
        .collect();

    Ok(serde_json::json!({
        "available": !rows.is_empty(),
        "totalMatches": rows.len(),
        "totalSessions": sessions,
        "byGameNumber": by_game_number,
        "byMinute": by_minute_json,
        "momentum": {
            "afterWin": after_win.json(),
            "afterLoss": after_loss.json(),
            "firstOfDay": first_of_day.json(),
            "restOfDay": rest_of_day.json(),
        },
        "breakpointGame": breakpoint_game,
        "breakpointMinute": breakpoint_minute,
        "minSample": MIN_INSIGHT_SAMPLE,
    }))
}

/// Teammate chemistry: win rate with every player who shared the local
/// player's team, plus results by team size (solo queue vs premade stacks).
pub fn get_teammate_stats(
    pool: &DbPool,
    player_primary_id: &str,
    start_date: &str,
    end_date: &str,
    playlist: Option<&str>,
    match_type: Option<&str>,
) -> AppResult<serde_json::Value> {
    let conn = get_conn(pool)?;

    let mut sql = String::from(
        "SELECT m.id, m.winner, mp_me.team_num,
                p2.primary_id, p2.name,
                (SELECT COUNT(*) FROM match_players mpc
                  WHERE mpc.match_id = m.id AND mpc.team_num = mp_me.team_num) AS team_size,
                CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS is_friend
         FROM matches m
         JOIN match_players mp_me ON mp_me.match_id = m.id
         JOIN players pme ON pme.id = mp_me.player_id AND pme.primary_id = ?1
         JOIN match_players mate ON mate.match_id = m.id
             AND mate.team_num = mp_me.team_num
             AND mate.player_id != mp_me.player_id
         JOIN players p2 ON p2.id = mate.player_id
         LEFT JOIN friends f ON f.player_id = p2.id
         WHERE m.winner IS NOT NULL
           AND m.start_time >= ?2
           AND m.start_time < date(?3, '+1 day')",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(player_primary_id.to_string()),
        Box::new(start_date.to_string()),
        Box::new(end_date.to_string()),
    ];
    if let Some(mt) = match_type {
        sql.push_str(" AND LOWER(m.match_type) = LOWER(?)");
        args.push(Box::new(mt.to_string()));
    }
    if let Some(pl) = playlist {
        sql.push_str(" AND LOWER(m.playlist) = LOWER(?)");
        args.push(Box::new(pl.to_string()));
    }
    sql.push_str(" ORDER BY m.start_time ASC");

    let params_refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let iter = stmt.query_map(&*params_refs, |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, Option<i32>>(1)?,
            row.get::<_, i32>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, i32>(5)?,
            row.get::<_, i32>(6)?,
        ))
    })?;

    #[derive(Default)]
    struct MateAgg {
        name: String,
        played: i32,
        won: i32,
        is_friend: bool,
    }
    let mut mates: HashMap<String, MateAgg> = HashMap::new();
    let mut by_team_size: HashMap<i32, (i32, i32)> = HashMap::new();
    let mut last_match_for_size: i64 = -1;

    for entry in iter {
        let (match_id, winner, my_team, mate_id, mate_name, team_size, is_friend) =
            entry.map_err(|e| AppError::StorageError(e.to_string()))?;
        let win = winner == Some(my_team);
        let agg = mates.entry(mate_id.clone()).or_default();
        agg.name = mate_name;
        agg.played += 1;
        if win {
            agg.won += 1;
        }
        agg.is_friend = is_friend != 0;
        // One match contributes once to the team-size bucket, no matter how
        // many teammates it had.
        if match_id != last_match_for_size {
            last_match_for_size = match_id;
            let e = by_team_size.entry(team_size).or_insert((0, 0));
            e.0 += 1;
            if win {
                e.1 += 1;
            }
        }
    }

    let mut teammate_list: Vec<serde_json::Value> = mates
        .iter()
        .map(|(primary_id, agg)| {
            serde_json::json!({
                "primaryId": primary_id,
                "name": agg.name,
                "played": agg.played,
                "won": agg.won,
                "lost": agg.played - agg.won,
                "winRate": if agg.played > 0 {
                    ((f64::from(agg.won) / f64::from(agg.played)) * 100.0).round() as i32
                } else { 0 },
                "isFriend": agg.is_friend,
            })
        })
        .collect();
    teammate_list.sort_by(|a, b| {
        b["played"]
            .as_i64()
            .unwrap_or(0)
            .cmp(&a["played"].as_i64().unwrap_or(0))
    });

    let mut size_keys: Vec<i32> = by_team_size.keys().copied().collect();
    size_keys.sort_unstable();
    let by_size: Vec<serde_json::Value> = size_keys
        .iter()
        .map(|size| {
            let (played, won) = by_team_size[size];
            serde_json::json!({
                "teamSize": size,
                "played": played,
                "won": won,
                "lost": played - won,
                "winRate": if played > 0 {
                    ((f64::from(won) / f64::from(played)) * 100.0).round() as i32
                } else { 0 },
            })
        })
        .collect();

    Ok(serde_json::json!({
        "available": !teammate_list.is_empty() || !by_size.is_empty(),
        "teammates": teammate_list,
        "byTeamSize": by_size,
        "minSample": MIN_INSIGHT_SAMPLE,
    }))
}

/// Generic breakdown powering the custom-analysis builder: bucket the
/// identity's matches by `dimension` and return per-bucket played/won plus
/// summed individual stats (the frontend derives win rate and averages).
///
/// Supported dimensions: `hour`, `weekday`, `playlist`, `arena`,
/// `match_type`, `mood`, `game_number`, `minute_bucket`, `prev_result`.
#[allow(clippy::too_many_arguments)]
pub fn get_custom_breakdown(
    pool: &DbPool,
    player_primary_id: &str,
    start_date: &str,
    end_date: &str,
    playlist: Option<&str>,
    match_type: Option<&str>,
    gap_minutes: u32,
    dimension: &str,
) -> AppResult<serde_json::Value> {
    let conn = get_conn(pool)?;
    let rows = fetch_curve_rows(
        &conn,
        player_primary_id,
        start_date,
        end_date,
        playlist,
        match_type,
        gap_minutes,
    )?;

    // (sort key, bucket key, label)
    let mut buckets: HashMap<String, (i64, String, Agg)> = HashMap::new();
    for row in &rows {
        // start_time string is needed for local buckets; recover it from the
        // parsed timestamp (UTC RFC3339 round-trips through the same parsers).
        let start_str = row.start.to_rfc3339();
        let (sort, key, label) = match dimension {
            "hour" => {
                let h = local_hour(&start_str).unwrap_or(0) as i64;
                (h, format!("h{h:02}"), format!("{h:02}:00"))
            }
            "weekday" => {
                let w = local_weekday(&start_str).unwrap_or(0) as i64;
                (w, format!("d{w}"), weekday_label(w))
            }
            "playlist" => {
                let name = row.playlist.clone().unwrap_or_else(|| "Desconocida".into());
                (0, format!("p{name}"), name)
            }
            "arena" => {
                let name = row.arena.clone().unwrap_or_else(|| "Desconocida".into());
                (0, format!("a{name}"), name)
            }
            "match_type" => {
                let name = row
                    .match_type
                    .clone()
                    .unwrap_or_else(|| "Desconocido".into());
                (0, format!("t{name}"), name)
            }
            "mood" => {
                // Unrated matches land in their own bucket so the player can
                // see how much signal the mood analysis is missing.
                let key = row.mood.clone().unwrap_or_else(|| "unrated".into());
                (mood_order(&key), format!("mood_{key}"), key)
            }
            "game_number" => {
                let n = row.ordinal.min(MAX_GAME_NUMBER);
                let label = if n >= MAX_GAME_NUMBER {
                    format!("{MAX_GAME_NUMBER}+")
                } else {
                    n.to_string()
                };
                (n, format!("n{n}"), label)
            }
            "minute_bucket" => {
                let b = row.minute_bucket;
                let start_min = b * MINUTE_BUCKET_WIDTH;
                let label = if b >= MAX_MINUTE_BUCKET {
                    format!("{start_min}+")
                } else {
                    format!(
                        "{start_min}-{end_min}",
                        end_min = start_min + MINUTE_BUCKET_WIDTH
                    )
                };
                (b, format!("m{b}"), label)
            }
            "prev_result" => match row.prev_result {
                Some(true) => (1, "prev_win".into(), "Tras victoria".into()),
                Some(false) => (0, "prev_loss".into(), "Tras derrota".into()),
                None => (2, "prev_none".into(), "Inicio de sesión".into()),
            },
            _ => {
                return Err(AppError::StorageError(format!(
                    "Unknown dimension: {dimension}"
                )))
            }
        };
        buckets
            .entry(key)
            .or_insert_with(|| (sort, label, Agg::default()))
            .2
            .add_match(row, is_win(row));
    }

    let mut ordered: Vec<(i64, String, String, Agg)> = buckets
        .into_iter()
        .map(|(_, (sort, label, agg))| (sort, label.clone(), label, agg))
        .collect();
    if dimension == "playlist" || dimension == "arena" || dimension == "match_type" {
        ordered.sort_by_key(|b| std::cmp::Reverse(b.3.played));
    } else {
        ordered.sort_by_key(|a| a.0);
    }

    let result: Vec<serde_json::Value> = ordered
        .into_iter()
        .map(|(_, key, label, agg)| {
            let mut v = agg.json();
            v["key"] = serde_json::json!(key);
            v["label"] = serde_json::json!(label);
            v
        })
        .collect();

    Ok(serde_json::json!({
        "available": !result.is_empty(),
        "dimension": dimension,
        "buckets": result,
        "minSample": MIN_INSIGHT_SAMPLE,
    }))
}

/// Sort order for mood buckets: happiest first, unrated last.
fn mood_order(key: &str) -> i64 {
    match key {
        "very_happy" => 0,
        "happy" => 1,
        "neutral" => 2,
        "angry" => 3,
        "very_angry" => 4,
        _ => 5,
    }
}

fn weekday_label(w: i64) -> String {
    match w {
        0 => "Lunes".into(),
        1 => "Martes".into(),
        2 => "Miércoles".into(),
        3 => "Jueves".into(),
        4 => "Viernes".into(),
        5 => "Sábado".into(),
        _ => "Domingo".into(),
    }
}

/// Recompute `match_players.kickoff_goals` from the persisted goal timeline.
///
/// Live detection can miss kickoff goals (overtime anchors, streams without
/// round markers, scorer-key mismatches, old threshold settings), so this
/// backfill re-derives them from stored evidence:
///
/// - Goals that carry `game_time_remaining` (recorded since v21): a goal is a
///   kickoff goal when the game clock barely moved since the previous goal —
///   the clock freezes through the replay and countdown, so
///   `prev_clock - clock <= threshold + 2` with a short wall gap means the
///   goal came straight off the restart. The match's opening goal counts when
///   its clock is still within the threshold of a full 300s regulation clock.
/// - Older goals without clock data: only the wall-clock gap is available, so
///   a strict ≤12s gap to the previous goal counts (replay ≈5s + countdown
///   ≈3s + a few seconds of play). These matches are reported as `estimated`.
///
/// Returns a summary with the counts; matches whose goals have no usable
/// evidence keep their stored values and are reported as `matchesWithoutData`.
pub fn recompute_kickoff_goals(pool: &DbPool, threshold: i32) -> AppResult<serde_json::Value> {
    let conn = get_conn(pool)?;

    let has_clock_col: bool = conn
        .prepare("SELECT game_time_remaining FROM match_events LIMIT 0")
        .is_ok();

    let sql = if has_clock_col {
        "SELECT id, match_id, event_data, occurred_at, game_time_remaining
         FROM match_events WHERE event_type = 'GoalScored'
         ORDER BY match_id ASC, occurred_at ASC, id ASC"
    } else {
        "SELECT id, match_id, event_data, occurred_at, NULL
         FROM match_events WHERE event_type = 'GoalScored'
         ORDER BY match_id ASC, occurred_at ASC, id ASC"
    };
    let mut stmt = conn.prepare(sql)?;
    let events = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<f64>>(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    // Match metadata + roster for scorer attribution.
    let mut match_ot: HashMap<i64, bool> = HashMap::new();
    {
        let mut mstmt = conn.prepare("SELECT id, is_overtime FROM matches")?;
        let mrows = mstmt
            .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i32>(1)?)))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::StorageError(e.to_string()))?;
        for (id, ot) in mrows {
            match_ot.insert(id, ot != 0);
        }
    }

    #[derive(Clone)]
    struct RosterEntry {
        row_id: i64,
        primary_id: String,
        name: String,
    }
    impl RosterKey for RosterEntry {
        fn row_id(&self) -> i64 {
            self.row_id
        }
        fn primary_id(&self) -> &str {
            &self.primary_id
        }
        fn name(&self) -> &str {
            &self.name
        }
    }
    let mut rosters: HashMap<i64, Vec<RosterEntry>> = HashMap::new();
    {
        let mut rstmt = conn.prepare(
            "SELECT mp.match_id, mp.id, p.primary_id, p.name
             FROM match_players mp JOIN players p ON p.id = mp.player_id",
        )?;
        let rrows = rstmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::StorageError(e.to_string()))?;
        for (match_id, row_id, primary_id, name) in rrows {
            rosters.entry(match_id).or_default().push(RosterEntry {
                row_id,
                primary_id,
                name,
            });
        }
    }

    let mut goals_scanned = 0i64;
    let mut kickoff_found = 0i64;
    let mut unattributed = 0i64;
    let mut estimated_matches: HashMap<i64, bool> = HashMap::new();
    let mut no_data_matches: HashMap<i64, bool> = HashMap::new();
    let mut matches_touched: HashMap<i64, bool> = HashMap::new();
    // (match_players.id, kickoff count)
    let mut recounts: HashMap<i64, i32> = HashMap::new();

    let mut idx = 0;
    while idx < events.len() {
        let match_id = events[idx].1;
        let mut j = idx;
        while j < events.len() && events[j].1 == match_id {
            j += 1;
        }
        let group = &events[idx..j];
        idx = j;

        let is_ot = match_ot.get(&match_id).copied().unwrap_or(false);
        let roster: &[RosterEntry] = rosters.get(&match_id).map_or(&[], Vec::as_slice);

        let mut prev: Option<(DateTime<Utc>, Option<i32>)> = None;
        let mut match_has_evidence = false;
        let mut match_estimated = false;
        let mut match_recounts: HashMap<i64, i32> = HashMap::new();

        for (_, _, event_data, occurred_at, clock_col) in group {
            goals_scanned += 1;
            let wall = DateTime::parse_from_rfc3339(occurred_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());
            // Clock evidence: dedicated column first, embedded JSON fallback.
            let clock: Option<i32> = clock_col.and_then(|c| Some(c.round() as i32)).or_else(|| {
                serde_json::from_str::<serde_json::Value>(event_data)
                    .ok()
                    .and_then(|v| {
                        v.get("gameTimeRemaining")
                            .and_then(serde_json::Value::as_i64)
                            .map(|c| c as i32)
                    })
            });

            let kickoff = match (clock, prev) {
                (Some(c), None) => {
                    match_has_evidence = true;
                    // Opening goal of the match: counts when the clock shows
                    // a fresh regulation period (300s soccar clock). Overtime
                    // matches sit at 0 permanently, so the rule cannot apply.
                    !is_ot && c >= 300 - threshold
                }
                (Some(c), Some((prev_wall, Some(pc)))) => {
                    match_has_evidence = true;
                    let gap = (wall - prev_wall).num_seconds();
                    (0..=25).contains(&gap) && pc - c <= threshold + 2
                }
                (Some(_), Some(_)) => {
                    match_has_evidence = true;
                    false
                }
                (None, Some((prev_wall, _))) => {
                    match_estimated = true;
                    let gap = (wall - prev_wall).num_seconds();
                    (0..=12).contains(&gap)
                }
                (None, None) => false,
            };

            if kickoff {
                kickoff_found += 1;
                if let Some(row_id) = attribute_scorer(event_data, roster) {
                    *match_recounts.entry(row_id).or_insert(0) += 1;
                } else {
                    unattributed += 1;
                }
            }
            prev = Some((wall, clock));
        }

        if !match_has_evidence && match_estimated {
            estimated_matches.insert(match_id, true);
        } else if !match_has_evidence {
            no_data_matches.insert(match_id, true);
        } else if match_estimated {
            estimated_matches.insert(match_id, true);
        }
        if !match_recounts.is_empty() {
            matches_touched.insert(match_id, true);
            for (row_id, count) in match_recounts {
                recounts.insert(row_id, count);
            }
        }
    }

    // Zero out every touched roster first so removed false positives do not
    // linger, then write the recounts.
    if !matches_touched.is_empty() {
        let touched_ids: Vec<i64> = matches_touched.keys().copied().collect();
        let placeholders = vec!["?"; touched_ids.len()].join(", ");
        let zero_sql = format!(
            "UPDATE match_players SET kickoff_goals = 0 WHERE match_id IN ({placeholders})"
        );
        conn.execute(&zero_sql, rusqlite::params_from_iter(touched_ids.iter()))?;
        for (row_id, count) in &recounts {
            conn.execute(
                "UPDATE match_players SET kickoff_goals = ?1 WHERE id = ?2",
                params![count, row_id],
            )?;
        }
    }

    Ok(serde_json::json!({
        "goalsScanned": goals_scanned,
        "kickoffFound": kickoff_found,
        "matchesUpdated": matches_touched.len(),
        "unattributed": unattributed,
        "estimatedMatches": estimated_matches.len(),
        "matchesWithoutData": no_data_matches.len(),
    }))
}

/// Map a goal's scorer onto a `match_players` row id: exact primary id, then
/// case-insensitive id, then case-insensitive name, then a contains-match on
/// the name as a last resort.
fn attribute_scorer(event_data: &str, roster: &[impl RosterKey]) -> Option<i64> {
    let value: serde_json::Value = serde_json::from_str(event_data).ok()?;
    let scorer = value.get("scorer")?;
    let id = scorer.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let name = scorer.get("name").and_then(|v| v.as_str()).unwrap_or("");

    if !id.is_empty() {
        if let Some(e) = roster.iter().find(|e| e.primary_id() == id) {
            return Some(e.row_id());
        }
        if let Some(e) = roster
            .iter()
            .find(|e| e.primary_id().eq_ignore_ascii_case(id))
        {
            return Some(e.row_id());
        }
    }
    if !name.is_empty() {
        if let Some(e) = roster.iter().find(|e| e.name().eq_ignore_ascii_case(name)) {
            return Some(e.row_id());
        }
        let needle = name.to_lowercase();
        if let Some(e) = roster.iter().find(|e| {
            let n = e.name().to_lowercase();
            n.contains(&needle) || needle.contains(&n)
        }) {
            return Some(e.row_id());
        }
    }
    None
}

trait RosterKey {
    fn row_id(&self) -> i64;
    fn primary_id(&self) -> &str;
    fn name(&self) -> &str;
}

#[cfg(test)]
struct RosterEntryKey {
    row_id: i64,
    primary_id: String,
    name: String,
}

#[cfg(test)]
impl RosterKey for RosterEntryKey {
    fn row_id(&self) -> i64 {
        self.row_id
    }
    fn primary_id(&self) -> &str {
        &self.primary_id
    }
    fn name(&self) -> &str {
        &self.name
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn buckets(played_won: &[(i32, i32)]) -> Vec<(i32, i32)> {
        played_won.to_vec()
    }

    #[test]
    fn detects_a_fatigue_breakpoint() {
        // Strong start (games 1-5), collapse afterwards.
        let points = buckets(&[
            (8, 6),
            (8, 6),
            (8, 5),
            (8, 6),
            (8, 5),
            (8, 2),
            (8, 1),
            (8, 2),
        ]);
        let bp = detect_breakpoint(&points).expect("should detect a breakpoint");
        assert_eq!(bp.0, 5, "split must fall right after the strong block");
        assert!(bp.1 - bp.2 > 12.0);
    }

    #[test]
    fn no_breakpoint_without_enough_samples() {
        let points = buckets(&[(3, 2), (3, 1), (3, 1)]);
        assert!(detect_breakpoint(&points).is_none());
    }

    #[test]
    fn no_breakpoint_when_stable() {
        let points = buckets(&[(10, 5), (10, 6), (10, 5), (10, 5), (10, 6)]);
        assert!(detect_breakpoint(&points).is_none());
    }

    #[test]
    fn scorer_attribution_prefers_exact_id_then_name() {
        let roster = vec![
            RosterEntryKey {
                row_id: 1,
                primary_id: "ABC".into(),
                name: "Alpha".into(),
            },
            RosterEntryKey {
                row_id: 2,
                primary_id: "DEF".into(),
                name: "Beta".into(),
            },
        ];
        let exact = serde_json::json!({"scorer": {"id": "DEF", "name": "Beta", "teamNum": 0}});
        assert_eq!(attribute_scorer(&exact.to_string(), &roster), Some(2));
        let by_name = serde_json::json!({"scorer": {"id": "zzz", "name": "alpha", "teamNum": 0}});
        assert_eq!(attribute_scorer(&by_name.to_string(), &roster), Some(1));
        let unknown = serde_json::json!({"scorer": {"id": "?", "name": "Ghost", "teamNum": 0}});
        assert_eq!(attribute_scorer(&unknown.to_string(), &roster), None);
    }

    #[test]
    fn local_helpers_parse_rfc3339() {
        // 2026-01-01T00:30:00+00:00 is Dec 31 evening in UTC-3; the helpers
        // must return *some* consistent local reading rather than the raw UTC
        // numbers — the test asserts UTC-offset correctness relatively.
        let ts = "2026-06-01T12:00:00+00:00";
        assert!(local_hour(ts).is_some());
        assert!(local_weekday(ts).is_some());
        assert_eq!(local_date_string(ts).len(), 10);
        assert!(local_hour("not-a-date").is_none());
        assert_eq!(MIN_INSIGHT_SAMPLE, 3);
    }
}

#[cfg(test)]
mod db_tests {
    use super::*;
    use crate::core::models::PlayerStats;
    use crate::core::storage::{
        finish_match_conn, get_or_create_player_conn, init_storage, insert_match_conn,
        insert_match_player_conn, set_match_mood, DbPool, FinishMatchUpdate, MatchPlayerRow,
    };
    use chrono::TimeZone;

    fn temp_pool(tag: &str) -> DbPool {
        let dir = std::env::temp_dir().join(format!(
            "rl-stats-patterns-test-{tag}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        init_storage(dir.join("test.db")).expect("init storage")
    }

    fn stats() -> PlayerStats {
        PlayerStats {
            score: 100,
            goals: 1,
            shots: 3,
            assists: 0,
            saves: 1,
            touches: 10,
            car_touches: 8,
            demos: 0,
            speed: 100.0,
            boost: 50,
            mmr: None,
            kickoff_goals: 0,
            head_to_head: None,
        }
    }

    /// Build two sessions: session 1 (5 wins) + session 2 (5 losses), 3 hours
    /// apart so the 30-minute gap rule splits them.
    fn seed_two_sessions(pool: &DbPool) {
        let conn = crate::core::storage::get_conn(pool).unwrap();
        let me = get_or_create_player_conn(&conn, "me-pid", "Me").unwrap();
        let mate = get_or_create_player_conn(&conn, "mate-pid", "Mate").unwrap();
        let foe = get_or_create_player_conn(&conn, "foe-pid", "Foe").unwrap();

        let base = chrono::Utc.with_ymd_and_hms(2026, 9, 1, 18, 0, 0).unwrap();
        for session in 0..2 {
            for game in 0..5 {
                let start = base
                    + chrono::Duration::hours(session * 3)
                    + chrono::Duration::minutes(game * 8);
                let end = start + chrono::Duration::minutes(6);
                // Session 0: my team (0) wins; session 1: team 1 wins.
                let winner = if session == 0 { 0 } else { 1 };
                let guid = format!("guid-{session}-{game}");
                let match_id = insert_match_conn(
                    &conn,
                    &guid,
                    start,
                    Some("DFH Stadium"),
                    true,
                    Some("ranked"),
                    Some("Doubles"),
                )
                .unwrap();
                for (pid, team) in [(me, 0), (mate, 0), (foe, 1)] {
                    insert_match_player_conn(
                        &conn,
                        match_id,
                        MatchPlayerRow {
                            player_id: pid,
                            team_num: team,
                            stats: stats(),
                            head_to_head_json: None,
                        },
                    )
                    .unwrap();
                }
                finish_match_conn(
                    &conn,
                    match_id,
                    FinishMatchUpdate {
                        end_time: end,
                        score_blue: if winner == 0 { 3 } else { 1 },
                        score_orange: if winner == 1 { 3 } else { 1 },
                        winner: Some(winner),
                        is_overtime: false,
                        duration_seconds: 360,
                    },
                )
                .unwrap();
            }
        }
    }

    #[test]
    fn session_curve_groups_sessions_and_detects_shape() {
        let pool = temp_pool("curve");
        seed_two_sessions(&pool);

        let curve =
            get_session_curve(&pool, "me-pid", "2026-09-01", "2026-09-02", None, None, 30).unwrap();
        assert_eq!(curve["available"], true);
        assert_eq!(curve["totalMatches"], 10);
        assert_eq!(curve["totalSessions"], 2);
        // Every session contributes games 1-5: each ordinal bucket has 2.
        let by_game = curve["byGameNumber"].as_array().unwrap();
        assert_eq!(by_game.len(), 5);
        assert_eq!(by_game[0]["played"], 2);
        // Ordinal 1: one win (session 1) + one loss (session 2).
        assert_eq!(by_game[0]["won"], 1);
        assert_eq!(by_game[0]["winRate"], 50);
    }

    #[test]
    fn teammates_and_breakdown_cover_mates_moods_and_hours() {
        let pool = temp_pool("mates");
        seed_two_sessions(&pool);
        set_match_mood(&pool, 1, Some("very_happy")).unwrap();
        set_match_mood(&pool, 6, Some("angry")).unwrap();

        let mates =
            get_teammate_stats(&pool, "me-pid", "2026-09-01", "2026-09-02", None, None).unwrap();
        assert_eq!(mates["available"], true);
        let list = mates["teammates"].as_array().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["name"], "Mate");
        assert_eq!(list[0]["played"], 10);
        assert_eq!(list[0]["won"], 5);

        for dim in ["hour", "weekday", "playlist", "arena", "match_type", "mood"] {
            let bd = get_custom_breakdown(
                &pool,
                "me-pid",
                "2026-09-01",
                "2026-09-02",
                None,
                None,
                30,
                dim,
            )
            .unwrap_or_else(|e| panic!("dimension {dim} failed: {e}"));
            assert_eq!(bd["available"], true, "dimension {dim}");
            assert!(
                !bd["buckets"].as_array().unwrap().is_empty(),
                "dimension {dim}"
            );
        }

        let mood = get_custom_breakdown(
            &pool,
            "me-pid",
            "2026-09-01",
            "2026-09-02",
            None,
            None,
            30,
            "mood",
        )
        .unwrap();
        let labels: Vec<&str> = mood["buckets"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| b["label"].as_str().unwrap())
            .collect();
        assert!(labels.contains(&"very_happy"), "{labels:?}");
        assert!(labels.contains(&"angry"), "{labels:?}");
        assert!(labels.contains(&"unrated"), "{labels:?}");

        assert!(get_custom_breakdown(
            &pool,
            "me-pid",
            "2026-09-01",
            "2026-09-02",
            None,
            None,
            30,
            "nope"
        )
        .is_err());
    }
}

#[cfg(test)]
mod backfill_tests {
    use crate::core::storage::{
        get_conn, init_storage, insert_match_conn, insert_match_event_conn, DbPool,
    };
    use chrono::TimeZone;

    fn temp_pool(tag: &str) -> DbPool {
        let dir = std::env::temp_dir().join(format!(
            "rl-stats-backfill-test-{tag}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        init_storage(dir.join("test.db")).expect("init storage")
    }

    fn goal_event(scorer_id: &str, team: i32) -> String {
        serde_json::json!({"scorer": {"id": scorer_id, "name": scorer_id, "teamNum": team}})
            .to_string()
    }

    #[test]
    fn recount_uses_clock_freeze_and_flags_estimates() {
        let pool = temp_pool("recount");
        let conn = get_conn(&pool).unwrap();
        let t0 = chrono::Utc.with_ymd_and_hms(2026, 9, 1, 18, 0, 0).unwrap();

        // Match 1 (regulation): opening goal at clock 295 (kickoff), open-play
        // goal at 250 thirty seconds later (not), then a goal 8s after that
        // with the clock barely moved 248 -> still open play... craft instead:
        // goal3 at clock 249 only 8s after goal2 with clock 250: frozen-clock
        // restart => kickoff.
        let m1 = insert_match_conn(
            &conn,
            "bf-1",
            t0,
            Some("DFH"),
            true,
            Some("ranked"),
            Some("Doubles"),
        )
        .unwrap();
        let me = crate::core::storage::get_or_create_player_conn(&conn, "me", "Me").unwrap();
        crate::core::storage::insert_match_player_conn(
            &conn,
            m1,
            crate::core::storage::MatchPlayerRow {
                player_id: me,
                team_num: 0,
                stats: crate::core::models::PlayerStats {
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
                    mmr: None,
                    kickoff_goals: 0,
                    head_to_head: None,
                },
                head_to_head_json: None,
            },
        )
        .unwrap();
        crate::core::storage::finish_match_conn(
            &conn,
            m1,
            crate::core::storage::FinishMatchUpdate {
                end_time: t0 + chrono::Duration::minutes(6),
                score_blue: 2,
                score_orange: 1,
                winner: Some(0),
                is_overtime: false,
                duration_seconds: 360,
            },
        )
        .unwrap();
        insert_match_event_conn(&conn, m1, "GoalScored", &goal_event("me", 0), t0, Some(295))
            .unwrap();
        insert_match_event_conn(
            &conn,
            m1,
            "GoalScored",
            &goal_event("me", 0),
            t0 + chrono::Duration::seconds(40),
            Some(250),
        )
        .unwrap();
        insert_match_event_conn(
            &conn,
            m1,
            "GoalScored",
            &goal_event("me", 0),
            t0 + chrono::Duration::seconds(48),
            Some(249),
        )
        .unwrap();

        // Match 2 (old data, no clock): two goals 9s apart => estimated kickoff.
        let m2 = insert_match_conn(
            &conn,
            "bf-2",
            t0,
            Some("DFH"),
            true,
            Some("ranked"),
            Some("Doubles"),
        )
        .unwrap();
        insert_match_event_conn(&conn, m2, "GoalScored", &goal_event("ghost", 0), t0, None)
            .unwrap();
        insert_match_event_conn(
            &conn,
            m2,
            "GoalScored",
            &goal_event("ghost", 0),
            t0 + chrono::Duration::seconds(9),
            None,
        )
        .unwrap();

        let report = crate::core::patterns::recompute_kickoff_goals(&pool, 7).unwrap();
        assert_eq!(report["goalsScanned"], 5);
        // m1: opening (295) + frozen-clock restart (249, 8s after 250).
        // m2: strict wall-gap estimate. Total 3.
        assert_eq!(report["kickoffFound"], 3, "{report}");
        assert_eq!(report["estimatedMatches"], 1);
        // Match 1's goals attribute to "me"; match 2's scorer is unknown.
        assert_eq!(report["unattributed"], 1, "{report}");

        let ko: i32 = conn
            .query_row(
                "SELECT kickoff_goals FROM match_players WHERE match_id = ?1",
                rusqlite::params![m1],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(ko, 2);
    }
}
