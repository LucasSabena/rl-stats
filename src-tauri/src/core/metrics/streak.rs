use crate::core::storage::{get_conn, DbPool};
use crate::error::AppResult;
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct StreakData {
    pub best_streak: u32,
    pub current_streak: u32,
}

pub fn calculate_streaks(
    pool: &DbPool,
    local_primary_id: &str,
    start_date: &str,
    end_date: &str,
    playlist: Option<&str>,
    match_type: Option<&str>,
) -> AppResult<StreakData> {
    let conn = get_conn(pool)?;

    let mut sql = String::from(
        "SELECT m.winner, mp.team_num
         FROM matches m
         JOIN match_players mp ON m.id = mp.match_id
         JOIN players p ON mp.player_id = p.id
         WHERE p.primary_id = ?1
           AND m.winner IS NOT NULL
           AND date(m.start_time, 'localtime') >= ?2
           AND date(m.start_time, 'localtime') <= ?3",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    args.push(Box::new(local_primary_id.to_string()));
    args.push(Box::new(start_date.to_string()));
    args.push(Box::new(end_date.to_string()));

    if let Some(mt) = match_type {
        sql.push_str(" AND LOWER(m.match_type) = LOWER(?)");
        args.push(Box::new(mt.to_string()));
    } else {
        // Streaks are a match metric: training stints must not extend them.
        sql.push_str(" AND LOWER(COALESCE(m.match_type, '')) != 'training'");
    }

    if let Some(pl) = playlist {
        sql.push_str(" AND LOWER(m.playlist) = LOWER(?)");
        args.push(Box::new(pl.to_string()));
    }

    sql.push_str(" ORDER BY m.start_time ASC");

    let params_refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;

    let results: Vec<(Option<i32>, i32)> = stmt
        .query_map(&*params_refs, |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;

    let (best_streak, current_streak) = compute_streaks(&results);
    Ok(StreakData {
        best_streak,
        current_streak,
    })
}

pub fn calculate_streaks_for_sessions(
    pool: &DbPool,
    local_primary_id: &str,
) -> AppResult<StreakData> {
    let conn = get_conn(pool)?;
    let mut stmt = conn.prepare(
        "SELECT m.winner, mp.team_num
         FROM matches m
         JOIN match_players mp ON m.id = mp.match_id
         JOIN players p ON mp.player_id = p.id
         WHERE p.primary_id = ?1
           AND m.winner IS NOT NULL
           AND LOWER(COALESCE(m.match_type, '')) != 'training'
         ORDER BY m.start_time ASC",
    )?;

    let results: Vec<(Option<i32>, i32)> = stmt
        .query_map(rusqlite::params![local_primary_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let (best_streak, current_streak) = compute_streaks(&results);
    Ok(StreakData {
        best_streak,
        current_streak,
    })
}

fn compute_streaks(results: &[(Option<i32>, i32)]) -> (u32, u32) {
    let wins: Vec<bool> = results
        .iter()
        .filter_map(|(winner, team)| winner.map(|w| w == *team))
        .collect();

    let mut best_streak = 0u32;
    let mut current_run = 0u32;

    for &is_win in &wins {
        if is_win {
            current_run += 1;
            best_streak = best_streak.max(current_run);
        } else {
            current_run = 0;
        }
    }

    let mut current_streak = 0u32;
    for &is_win in wins.iter().rev() {
        if is_win {
            current_streak += 1;
        } else {
            break;
        }
    }

    (best_streak, current_streak)
}
