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
    local_primary_ids: &[String],
    start_date: &str,
    end_date: &str,
    playlist: Option<&str>,
    match_type: Option<&str>,
) -> AppResult<StreakData> {
    let conn = get_conn(pool)?;

    let id_placeholders = vec!["?"; local_primary_ids.len().max(1)].join(", ");
    let mut sql = format!(
        "SELECT m.id, p.primary_id, m.winner, mp.team_num
         FROM matches m
         JOIN match_players mp ON m.id = mp.match_id
         JOIN players p ON mp.player_id = p.id
         WHERE p.primary_id IN ({id_placeholders})
           AND m.winner IS NOT NULL
           AND m.status != 'cancelled'
           AND m.start_time >= ?
           AND m.start_time < ?",
    );
    let (day_start, day_end) =
        crate::core::storage::local_day_range_utc_bounds(Some(start_date), Some(end_date));
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    for pid in local_primary_ids {
        args.push(Box::new(pid.clone()));
    }
    if local_primary_ids.is_empty() {
        args.push(Box::new(String::new()));
    }
    args.push(Box::new(day_start));
    args.push(Box::new(day_end));

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

    let raw: Vec<(i64, String, (Option<i32>, i32))> = stmt
        .query_map(&*params_refs, |row| {
            Ok((row.get(0)?, row.get(1)?, (row.get(2)?, row.get(3)?)))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    // Linked identities appearing in one match count the match once.
    let results = crate::core::storage::dedup_local_rows(raw, local_primary_ids);

    let (best_streak, current_streak) = compute_streaks(&results);
    Ok(StreakData {
        best_streak,
        current_streak,
    })
}

pub fn calculate_streaks_for_sessions(
    pool: &DbPool,
    local_primary_ids: &[String],
) -> AppResult<StreakData> {
    let conn = get_conn(pool)?;
    let id_placeholders = vec!["?"; local_primary_ids.len().max(1)].join(", ");
    let sql = format!(
        "SELECT m.id, p.primary_id, m.winner, mp.team_num
         FROM matches m
         JOIN match_players mp ON m.id = mp.match_id
         JOIN players p ON mp.player_id = p.id
         WHERE p.primary_id IN ({id_placeholders})
           AND m.winner IS NOT NULL
           AND m.status != 'cancelled'
           AND LOWER(COALESCE(m.match_type, '')) != 'training'
         ORDER BY m.start_time ASC",
    );
    let mut stmt = conn.prepare(&sql)?;

    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    for pid in local_primary_ids {
        args.push(Box::new(pid.clone()));
    }
    if local_primary_ids.is_empty() {
        args.push(Box::new(String::new()));
    }
    let arg_refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
    let raw: Vec<(i64, String, (Option<i32>, i32))> = stmt
        .query_map(&*arg_refs, |row| {
            Ok((row.get(0)?, row.get(1)?, (row.get(2)?, row.get(3)?)))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let results = crate::core::storage::dedup_local_rows(raw, local_primary_ids);

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
