use crate::core::tracker_api::{
    ExtraPlaylists, OverviewStats, PlaylistStats, RankDivision, RankInfo, RankTier,
    RankedPlaylists, TrackerProfile, TrackerStats,
};
use crate::error::{AppError, AppResult};

pub fn parse_profile_html(
    html: &str,
    platform: &str,
    _identifier: &str,
) -> AppResult<TrackerProfile> {
    let username = extract_username(html, platform)?;
    let avatar_url = extract_avatar(html);
    let overview = extract_career_stats(html);
    let (ranked, extra, unranked) = extract_skill_tables(html);
    let total_matches_played = calculate_total_matches(&ranked, &extra, &unranked);
    let season_rank = extract_season_reward_rank(html);

    let mut ow = overview;
    ow.season_rank = season_rank;

    Ok(TrackerProfile {
        platform: platform.to_string(),
        username,
        avatar_url,
        country_code: None,
        linked_accounts: Vec::new(),
        stats: TrackerStats {
            overview: ow,
            ranked,
            extra,
            unranked,
            total_matches_played,
        },
    })
}

fn extract_username(html: &str, platform: &str) -> AppResult<String> {
    let platform_icon = match platform {
        "Steam" => "Steam.svg",
        "Epic" => "Epic.svg",
        "PS4" | "PSN" => "PS4.svg",
        "Xbox" => "Xbox.svg",
        _ => {
            return Err(AppError::ParseError(
                "Plataforma no soportada para RLStats.".into(),
            ))
        }
    };

    let start = html.find(platform_icon).ok_or_else(|| {
        AppError::ParseError("No se encontro el icono de plataforma en RLStats.".into())
    })?;

    let after_icon = &html[start..];
    let h1_end = after_icon.find("</h1>").unwrap_or(after_icon.len());

    let segment = &after_icon[..h1_end];
    let close_tag = segment.rfind('>').unwrap_or(0);

    let raw = segment[close_tag + 1..].trim();
    let span_pos = raw.find("<span").unwrap_or(raw.len());
    let name = raw[..span_pos].trim();

    if name.is_empty() || name.starts_with('<') {
        return Err(AppError::ParseError(
            "No se pudo extraer el nombre de usuario de RLStats.".into(),
        ));
    }

    Ok(name.to_string())
}

fn extract_avatar(html: &str) -> Option<String> {
    let marker = "user-img\" src=\"";
    let start = html.find(marker)?;
    let after = &html[start + marker.len()..];
    let end = after.find('"')?;
    Some(after[..end].to_string())
}

fn empty_overview() -> OverviewStats {
    OverviewStats {
        assists: None,
        goals: None,
        goal_shot_ratio: None,
        mvps: None,
        saves: None,
        shots: None,
        wins: None,
        season_rank: None,
    }
}

fn empty_ranked() -> RankedPlaylists {
    RankedPlaylists {
        duel: None,
        double: None,
        standard: None,
    }
}

fn empty_extra() -> ExtraPlaylists {
    ExtraPlaylists {
        dropshot: None,
        hoops: None,
        rumble: None,
        snowday: None,
    }
}

fn extract_career_stats(html: &str) -> OverviewStats {
    let table_start = match html.find("<table>") {
        Some(pos) => pos,
        None => return empty_overview(),
    };

    let table_end = html[table_start..]
        .find("</table>")
        .map(|p| table_start + p)
        .unwrap_or(html.len());

    let table = &html[table_start..table_end];

    let mut wins = None;
    let mut mvps = None;
    let mut goals = None;
    let mut assists = None;
    let mut saves = None;
    let mut shots = None;

    let cells = extract_td_texts(table);
    for cell in &cells {
        if let Some(num) = parse_number_from_label(cell, "Wins") {
            wins = Some(num);
        } else if let Some(num) = parse_number_from_label(cell, "MVPs") {
            mvps = Some(num);
        } else if let Some(num) = parse_number_from_label(cell, "Goals") {
            goals = Some(num);
        } else if let Some(num) = parse_number_from_label(cell, "Assists") {
            assists = Some(num);
        } else if let Some(num) = parse_number_from_label(cell, "Saves") {
            saves = Some(num);
        } else if let Some(num) = parse_number_from_label(cell, "Shots") {
            shots = Some(num);
        }
    }

    let goals_val = goals;
    let shots_val = shots;
    let goal_shot_ratio = match (goals_val, shots_val) {
        (Some(g), Some(s)) if s > 0 => Some(g as f64 / s as f64),
        _ => None,
    };

    OverviewStats {
        assists,
        goals: goals_val,
        goal_shot_ratio,
        mvps,
        saves,
        shots: shots_val,
        wins,
        season_rank: None,
    }
}

fn parse_number_from_label(cell: &str, label: &str) -> Option<i64> {
    if !cell.contains(label) {
        return None;
    }
    cell.split_whitespace()
        .next()
        .and_then(|s| s.parse::<i64>().ok())
}

fn extract_td_texts(html_fragment: &str) -> Vec<String> {
    let mut texts = Vec::new();
    let mut remaining = html_fragment;

    while let Some(td_start) = remaining.find("<td") {
        let after_tag_start = &remaining[td_start..];
        let content_start = match after_tag_start.find('>') {
            Some(p) => td_start + p + 1,
            None => break,
        };

        let content_end = remaining[content_start..]
            .find("</td>")
            .map(|p| content_start + p)
            .unwrap_or(remaining.len());

        let text = &remaining[content_start..content_end];
        if !text.trim().is_empty() {
            texts.push(text.trim().to_string());
        }

        remaining = &remaining[content_end + 5..];
    }

    texts
}

fn extract_skill_tables(html: &str) -> (RankedPlaylists, ExtraPlaylists, Option<PlaylistStats>) {
    let section_start = match html.find("id=\"skills\"") {
        Some(pos) => pos,
        None => return (empty_ranked(), empty_extra(), None),
    };

    let history_start = html[section_start..]
        .find("id=\"history\"")
        .map(|p| section_start + p)
        .unwrap_or(html.len());

    let section = &html[section_start..history_start];

    let tables = extract_tables(section);
    let mut ranked = empty_ranked();
    let mut extra = empty_extra();
    let mut unranked: Option<PlaylistStats> = None;

    for table_html in &tables {
        if table_html.contains("unranked-block") || table_html.contains("Casual") {
            unranked = parse_casual_table(table_html);
        } else {
            let playlists = parse_skill_table(table_html);
            for (key, stats) in playlists {
                match key.as_str() {
                    "duel" => ranked.duel = Some(stats),
                    "doubles" => ranked.double = Some(stats),
                    "standard" => ranked.standard = Some(stats),
                    "dropshot" => extra.dropshot = Some(stats),
                    "hoops" => extra.hoops = Some(stats),
                    "rumble" => extra.rumble = Some(stats),
                    "snowday" => extra.snowday = Some(stats),
                    _ => {}
                }
            }
        }
    }

    (ranked, extra, unranked)
}

fn extract_tables(html: &str) -> Vec<String> {
    let mut tables = Vec::new();
    let mut remaining = html;

    while let Some(start) = remaining.find("<table") {
        let after = &remaining[start..];
        let end = after
            .find("</table>")
            .map(|p| start + p + 8)
            .unwrap_or(remaining.len());

        tables.push(remaining[start..end].to_string());
        remaining = &remaining[end..];
    }

    tables
}

fn parse_skill_table(table_html: &str) -> Vec<(String, PlaylistStats)> {
    let rows = extract_rows(table_html);
    if rows.len() < 7 {
        return Vec::new();
    }

    let headers = extract_row_td_or_th(&rows[0]);
    let rank_names = extract_row_td_or_th(&rows[1]);
    let divisions = extract_row_td_or_th(&rows[2]);
    let mmrs = extract_row_td_or_th(&rows[3]);
    let matches_played = extract_row_td_or_th(rows.get(5).unwrap_or(&String::new()));
    let win_streaks = extract_row_td_or_th(rows.get(6).unwrap_or(&String::new()));

    let mut results = Vec::new();

    for (i, header) in headers.iter().enumerate() {
        let key = normalize_rlstats_header(header);
        if key.is_empty() {
            continue;
        }

        let rank_name = rank_names.get(i).map(|s| s.as_str()).unwrap_or("");
        let division = divisions.get(i).map(|s| s.as_str()).unwrap_or("");
        let mmr = mmrs.get(i).and_then(|s| s.parse::<i64>().ok());
        let mp = matches_played.get(i).and_then(|s| extract_int_from_text(s));
        let ws = win_streaks.get(i).and_then(|s| extract_int_from_text(s));

        let rank_info = if rank_name == "Unranked" || rank_name.is_empty() {
            None
        } else {
            Some(RankInfo {
                tier: RankTier {
                    index: rank_tier_index(rank_name),
                    name: rank_name.to_string(),
                },
                division: RankDivision {
                    index: division_index(division),
                    name: division.to_string(),
                },
                image_url: None,
            })
        };

        results.push((
            key,
            PlaylistStats {
                rank: rank_info,
                mmr,
                matches_played: mp,
                win_streak: ws,
                lose_streak: None,
            },
        ));
    }

    results
}

fn parse_casual_table(table_html: &str) -> Option<PlaylistStats> {
    if !table_html.contains("Casual") {
        return None;
    }

    let mmr = table_html.split("Rating").nth(1).and_then(|part| {
        part.split('<')
            .next()
            .and_then(|s| s.trim().parse::<i64>().ok())
    });

    Some(PlaylistStats {
        rank: None,
        mmr,
        matches_played: None,
        win_streak: None,
        lose_streak: None,
    })
}

fn extract_rows(table_html: &str) -> Vec<String> {
    let mut rows = Vec::new();
    let mut remaining = table_html;

    while let Some(tr_start) = remaining.find("<tr") {
        let after = &remaining[tr_start..];
        let tr_end = after
            .find("</tr>")
            .map(|p| tr_start + p + 5)
            .unwrap_or(remaining.len());

        rows.push(remaining[tr_start..tr_end].to_string());
        remaining = &remaining[tr_end..];
    }

    rows
}

fn extract_row_td_or_th(row_html: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut remaining = row_html;

    // Find the next real cell tag. Searching for `<t` matched the row's own
    // `<tr>` (leaking `<td>` into the first value) and `<th` would match
    // `<thead>`, so match the exact tag starts and remember which closer
    // belongs to this cell — using `</td>` for a `<th>` picked up the *next*
    // cell's closer.
    fn next_cell_tag(from: &str) -> Option<(usize, &'static str)> {
        let td = from.find("<td");
        let th = [from.find("<th "), from.find("<th>")]
            .into_iter()
            .flatten()
            .min();
        match (td, th) {
            (Some(td), Some(th)) => Some(if td < th {
                (td, "</td>")
            } else {
                (th, "</th>")
            }),
            (Some(td), None) => Some((td, "</td>")),
            (None, Some(th)) => Some((th, "</th>")),
            (None, None) => None,
        }
    }

    while let Some((tag_start, closer)) = next_cell_tag(remaining) {
        let after = &remaining[tag_start..];
        let content_start = match after.find('>') {
            Some(p) => tag_start + p + 1,
            None => break,
        };

        let close = match remaining[content_start..].find(closer) {
            Some(p) => content_start + p,
            None => break,
        };

        values.push(remaining[content_start..close].trim().to_string());
        remaining = &remaining[close + closer.len()..];
    }

    values
}

fn extract_int_from_text(s: &str) -> Option<i64> {
    s.split_whitespace()
        .last()
        .and_then(|w| w.parse::<i64>().ok())
}

fn normalize_rlstats_header(header: &str) -> String {
    let h = header.trim().to_lowercase();
    if h.contains("duel") || h.contains("1v1") {
        "duel".into()
    } else if h.contains("doubles") || h.contains("2v2") {
        "doubles".into()
    } else if h.contains("standard") || h.contains("3v3") {
        "standard".into()
    } else if h.contains("tournament") {
        "tournament".into()
    } else if h.contains("heatseeker") {
        "heatseeker".into()
    } else if h.contains("hoops") {
        "hoops".into()
    } else if h.contains("rumble") {
        "rumble".into()
    } else if h.contains("dropshot") {
        "dropshot".into()
    } else if h.contains("snow") {
        "snowday".into()
    } else if h.contains("quad") || h.contains("4v4") {
        "quads".into()
    } else {
        String::new()
    }
}

fn rank_tier_index(name: &str) -> i32 {
    let tiers = [
        "unranked",
        "bronze i",
        "bronze ii",
        "bronze iii",
        "silver i",
        "silver ii",
        "silver iii",
        "gold i",
        "gold ii",
        "gold iii",
        "platinum i",
        "platinum ii",
        "platinum iii",
        "diamond i",
        "diamond ii",
        "diamond iii",
        "champion i",
        "champion ii",
        "champion iii",
        "grand champion i",
        "grand champion ii",
        "grand champion iii",
        "supersonic legend",
    ];
    tiers
        .iter()
        .position(|t| name.to_lowercase() == *t)
        .map(|i| i as i32)
        .unwrap_or(0)
}

fn division_index(name: &str) -> i32 {
    match name.to_lowercase().as_str() {
        "division i" | "i" => 1,
        "division ii" | "ii" => 2,
        "division iii" | "iii" => 3,
        "division iv" | "iv" => 4,
        _ => 1,
    }
}

fn extract_season_reward_rank(html: &str) -> Option<RankInfo> {
    let marker = "Season Reward Level";
    let start = html.find(marker)?;

    let before = &html[..start];
    let h2_start = before.rfind("<h2")?;
    let h2_content_start = html[h2_start..].find('>').map(|p| h2_start + p + 1)?;
    let h2_end = html[h2_content_start..]
        .find("</h2>")
        .map(|p| h2_content_start + p)?;
    let rank_name = html[h2_content_start..h2_end].trim().to_string();

    if rank_name.is_empty() || rank_name == "Unranked" {
        return None;
    }

    Some(RankInfo {
        tier: RankTier {
            index: rank_tier_index(&rank_name),
            name: rank_name,
        },
        division: RankDivision {
            index: 1,
            name: "Division I".to_string(),
        },
        image_url: None,
    })
}

fn calculate_total_matches(
    ranked: &RankedPlaylists,
    extra: &ExtraPlaylists,
    unranked: &Option<PlaylistStats>,
) -> Option<i64> {
    let mut total: i64 = 0;
    let mut has_any = false;

    for stats in [
        ranked.duel.as_ref(),
        ranked.double.as_ref(),
        ranked.standard.as_ref(),
        extra.dropshot.as_ref(),
        extra.hoops.as_ref(),
        extra.rumble.as_ref(),
        extra.snowday.as_ref(),
        unranked.as_ref(),
    ]
    .into_iter()
    .flatten()
    {
        if let Some(mp) = stats.matches_played {
            total += mp;
            has_any = true;
        }
    }

    if has_any {
        Some(total)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_html() -> String {
        r#"
        <html><body>
          <img src="/assets/img/Steam.svg" alt="Steam">
          <img class="user-img" src="https://cdn.example/avatar.png">
          <h1><span class="platform">Steam</span>PlayerOne</h1>
          <table>
            <tr><td>120 Wins</td><td>45 MVPs</td><td>300 Goals</td></tr>
            <tr><td>210 Assists</td><td>400 Saves</td><td>900 Shots</td></tr>
          </table>
          <div id="skills">
            <table>
              <tr><th></th><th>1v1</th><th>2v2</th><th>3v3</th></tr>
              <tr><td></td><td>Gold III</td><td>Platinum I</td><td>Diamond II</td></tr>
              <tr><td></td><td>Division III</td><td>Division I</td><td>Division IV</td></tr>
              <tr><td></td><td>1050</td><td>1200</td><td>1400</td></tr>
              <tr><td></td><td>-</td><td>-</td><td>-</td></tr>
              <tr><td></td><td>Matches 100</td><td>Matches 200</td><td>Matches 300</td></tr>
              <tr><td></td><td>Win Streak 3</td><td>Win Streak 0</td><td>Win Streak 1</td></tr>
            </table>
            <table>
              <tr><th></th><th>Dropshot</th><th>Hoops</th><th>Rumble</th><th>Snow Day</th></tr>
              <tr><td></td><td>Platinum II</td><td>Gold I</td><td>Silver III</td><td>Bronze II</td></tr>
              <tr><td></td><td>Division II</td><td>Division I</td><td>Division IV</td><td>Division III</td></tr>
              <tr><td></td><td>1100</td><td>900</td><td>800</td><td>700</td></tr>
              <tr><td></td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
              <tr><td></td><td>Matches 50</td><td>Matches 40</td><td>Matches 30</td><td>Matches 20</td></tr>
              <tr><td></td><td>Win Streak 2</td><td>Win Streak 1</td><td>Win Streak 0</td><td>Win Streak 0</td></tr>
            </table>
            <table>
              <tr><td></td><td>Casual</td></tr>
              <tr><td></td><td>Rating 1234</td></tr>
            </table>
          </div>
          <h2>Diamond III</h2>
          <div>Season Reward Level: 8</div>
          <div id="history"></div>
        </body></html>
        "#
        .to_string()
    }

    #[test]
    fn extracts_identity_avatar_and_career_stats() {
        let profile = parse_profile_html(&sample_html(), "Steam", "PlayerOne").unwrap();

        assert_eq!(profile.platform, "Steam");
        assert_eq!(profile.username, "PlayerOne");
        assert_eq!(
            profile.avatar_url.as_deref(),
            Some("https://cdn.example/avatar.png")
        );

        let overview = &profile.stats.overview;
        assert_eq!(overview.wins, Some(120));
        assert_eq!(overview.mvps, Some(45));
        assert_eq!(overview.goals, Some(300));
        assert_eq!(overview.assists, Some(210));
        assert_eq!(overview.saves, Some(400));
        assert_eq!(overview.shots, Some(900));
        assert_eq!(overview.goal_shot_ratio, Some(300.0 / 900.0));
    }

    #[test]
    fn extracts_ranked_playlist_mmr_and_division() {
        let profile = parse_profile_html(&sample_html(), "Steam", "PlayerOne").unwrap();
        let ranked = &profile.stats.ranked;

        let duel = ranked.duel.as_ref().expect("duel playlist");
        assert_eq!(duel.mmr, Some(1050));
        assert_eq!(duel.matches_played, Some(100));
        assert_eq!(duel.win_streak, Some(3));
        let duel_rank = duel.rank.as_ref().expect("duel rank");
        assert_eq!(duel_rank.tier.name, "Gold III");
        assert_eq!(duel_rank.tier.index, 9);
        assert_eq!(duel_rank.division.name, "Division III");
        assert_eq!(duel_rank.division.index, 3);

        let doubles = ranked.double.as_ref().expect("doubles playlist");
        assert_eq!(doubles.mmr, Some(1200));
        assert_eq!(doubles.rank.as_ref().unwrap().tier.name, "Platinum I");
        assert_eq!(doubles.rank.as_ref().unwrap().tier.index, 10);

        let standard = ranked.standard.as_ref().expect("standard playlist");
        assert_eq!(standard.mmr, Some(1400));
        assert_eq!(standard.rank.as_ref().unwrap().tier.name, "Diamond II");
        assert_eq!(standard.rank.as_ref().unwrap().division.index, 4);
    }

    #[test]
    fn extracts_extra_playlists_casual_and_total_matches() {
        let profile = parse_profile_html(&sample_html(), "Steam", "PlayerOne").unwrap();
        let stats = &profile.stats;

        let dropshot = stats.extra.dropshot.as_ref().expect("dropshot");
        assert_eq!(dropshot.mmr, Some(1100));
        assert_eq!(dropshot.rank.as_ref().unwrap().tier.name, "Platinum II");
        assert_eq!(stats.extra.hoops.as_ref().unwrap().mmr, Some(900));
        assert_eq!(stats.extra.rumble.as_ref().unwrap().mmr, Some(800));
        assert_eq!(stats.extra.snowday.as_ref().unwrap().mmr, Some(700));

        let unranked = stats.unranked.as_ref().expect("casual playlist");
        assert_eq!(unranked.mmr, Some(1234));
        assert!(unranked.rank.is_none());
        assert!(unranked.matches_played.is_none());

        // 100 + 200 + 300 ranked plus 50 + 40 + 30 + 20 extra.
        assert_eq!(stats.total_matches_played, Some(740));
    }

    #[test]
    fn extracts_season_reward_rank() {
        let profile = parse_profile_html(&sample_html(), "Steam", "PlayerOne").unwrap();
        let season_rank = profile
            .stats
            .overview
            .season_rank
            .as_ref()
            .expect("season reward rank");
        assert_eq!(season_rank.tier.name, "Diamond III");
        assert_eq!(season_rank.tier.index, 15);
        assert_eq!(season_rank.division.name, "Division I");
        assert_eq!(season_rank.division.index, 1);
    }

    #[test]
    fn empty_html_returns_error_without_panicking() {
        assert!(parse_profile_html("", "Steam", "PlayerOne").is_err());
        assert!(parse_profile_html("<html></html>", "Steam", "PlayerOne").is_err());
    }

    #[test]
    fn unsupported_platform_returns_error() {
        assert!(parse_profile_html(&sample_html(), "Switch", "PlayerOne").is_err());
    }

    #[test]
    fn playlist_helpers_normalize_names_and_ranks() {
        assert_eq!(normalize_rlstats_header("1v1"), "duel");
        assert_eq!(normalize_rlstats_header("2v2"), "doubles");
        assert_eq!(normalize_rlstats_header("3v3"), "standard");
        assert_eq!(normalize_rlstats_header("Snow Day"), "snowday");
        assert_eq!(normalize_rlstats_header("Competitive Doubles"), "doubles");
        assert_eq!(normalize_rlstats_header("Unknown Mode"), "");

        assert_eq!(rank_tier_index("Grand Champion III"), 21);
        assert_eq!(rank_tier_index("Supersonic Legend"), 22);
        assert_eq!(rank_tier_index("Not a rank"), 0);

        assert_eq!(division_index("Division IV"), 4);
        assert_eq!(division_index("II"), 2);
        assert_eq!(division_index("garbage"), 1);

        assert_eq!(extract_int_from_text("Win Streak 12"), Some(12));
        assert_eq!(extract_int_from_text("no digits"), None);

        // `parse_number_from_label` reads the first whitespace token.
        assert_eq!(parse_number_from_label("123 Wins", "Wins"), Some(123));
        assert_eq!(parse_number_from_label("Wins 123", "Wins"), None);
        assert_eq!(parse_number_from_label("123 Wins", "Goals"), None);
    }
}
