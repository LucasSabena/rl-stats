//! Canonical Rocket League playlist identifiers.
//!
//! The official Stats API reports the current match playlist as a numeric
//! `Game.PlaylistId`. Those ids are stable and come straight from the game, so
//! they replace the old team-size inference (which could not tell a 2v2 from
//! Hoops or a 3v3 from Rumble).
//!
//! Ids are sourced from the BakkesMod playlist id table. Casual playlists are
//! collapsed into a single `casual` MMR bucket because every third-party MMR
//! provider exposes exactly one casual rating.

/// Internal playlist key used by MMR providers, derived from a numeric
/// `PlaylistId`. Casual modes (duel/doubles/standard/chaos/extra) all map to
/// `casual` because that is how the providers expose their rating.
pub fn playlist_id_to_key(id: i32) -> Option<&'static str> {
    match id {
        // Casual buckets (generic 0 plus each casual mode).
        0 | 1 | 2 | 3 | 4 | 15 | 17 | 18 | 23 => Some("casual"),
        10 => Some("duel"),
        11 => Some("doubles"),
        13 => Some("standard"),
        22 | 34 => Some("tournament"),
        27 => Some("hoops"),
        28 => Some("rumble"),
        29 => Some("dropshot"),
        30 => Some("snowday"),
        38 | 43 => Some("heatseeker"),
        _ => None,
    }
}

/// Display label persisted in `matches.playlist` for a numeric `PlaylistId`.
///
/// Casual modes keep their specific label (Duel/Doubles/Standard/Chaos/…)
/// rather than being collapsed, so history filters behave as they always did.
pub fn playlist_id_to_match_label(id: i32) -> Option<&'static str> {
    match id {
        1 | 10 => Some("Duel"),
        2 | 11 => Some("Doubles"),
        3 | 13 => Some("Standard"),
        4 => Some("Chaos"),
        15 | 30 => Some("Snowday"),
        17 | 27 => Some("Hoops"),
        18 | 28 => Some("Rumble"),
        23 | 29 => Some("Dropshot"),
        22 | 34 => Some("Tournament"),
        38 | 43 => Some("Heatseeker"),
        _ => None,
    }
}

/// Match type implied by a numeric `PlaylistId`.
///
/// The official playlist ids distinguish competitive, casual and tournament
/// queues. Real matches used to be persisted as the user's default match type
/// regardless of the queue, so a casual 2v2 landed in history labelled as
/// ranked. Ids shared with no clear bucket return `None` and let the caller
/// fall back to the configured default.
pub fn match_type_from_playlist_id(id: i32) -> Option<&'static str> {
    match id {
        // Casual queues. The ids are the ones `playlist_id_to_key` already
        // collapses into the single casual MMR bucket.
        0 | 1 | 2 | 3 | 4 | 15 | 17 | 18 | 23 => Some("casual"),
        22 | 34 => Some("tournament"),
        // Competitive queues, including the competitive extra modes.
        10 | 11 | 13 | 27 | 28 | 29 | 30 => Some("ranked"),
        // Heatseeker and unknown ids stay `None`: the caller falls back to the
        // user's configured default instead of guessing a bucket.
        _ => None,
    }
}

/// Canonical display label for an internal playlist key.
pub fn playlist_key_label(key: &str) -> Option<&'static str> {
    match key {
        "duel" => Some("Duel"),
        "doubles" => Some("Doubles"),
        "standard" => Some("Standard"),
        "quads" => Some("Chaos"),
        "hoops" => Some("Hoops"),
        "rumble" => Some("Rumble"),
        "dropshot" => Some("Dropshot"),
        "snowday" => Some("Snowday"),
        "tournament" => Some("Tournament"),
        "heatseeker" => Some("Heatseeker"),
        "casual" => Some("Casual"),
        _ => None,
    }
}

/// Maps the playlist table headers used by rlstats.net to internal keys.
pub fn rlstats_label_to_key(label: &str) -> Option<&'static str> {
    match label.trim() {
        "1v1 Solo Duel" => Some("duel"),
        "2v2 Doubles" => Some("doubles"),
        "3v3 Standard" => Some("standard"),
        "3v3 Tournament" => Some("tournament"),
        "2v2 Hoops" => Some("hoops"),
        "3v3 Rumble" => Some("rumble"),
        "3v3 Dropshot" => Some("dropshot"),
        "3v3 Snow Day" => Some("snowday"),
        "Casual" => Some("casual"),
        other => normalize_label_to_key(other),
    }
}

/// Maps generic tracker labels (Tracker Network / RapidAPI / persisted match
/// labels) to internal keys. Case-insensitive.
pub fn normalize_label_to_key(label: &str) -> Option<&'static str> {
    match label.trim().to_ascii_lowercase().as_str() {
        "duel" | "1v1" | "1v1 duel" | "solo duel" | "ranked duel 1v1" | "10" => Some("duel"),
        "doubles" | "2v2" | "2v2 doubles" | "ranked doubles 2v2" | "11" => Some("doubles"),
        "standard" | "3v3" | "3v3 standard" | "ranked standard 3v3" | "13" => Some("standard"),
        "chaos" | "4v4" | "quads" => Some("quads"),
        "hoops" | "2v2 hoops" | "27" => Some("hoops"),
        "rumble" | "3v3 rumble" | "28" => Some("rumble"),
        "dropshot" | "3v3 dropshot" | "29" => Some("dropshot"),
        "snow day" | "snowday" | "3v3 snow day" | "30" => Some("snowday"),
        "tournament" | "3v3 tournament" | "34" => Some("tournament"),
        "heatseeker" | "38" | "43" => Some("heatseeker"),
        "casual" => Some("casual"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranked_ids_map_to_ranked_keys() {
        assert_eq!(playlist_id_to_key(10), Some("duel"));
        assert_eq!(playlist_id_to_key(11), Some("doubles"));
        assert_eq!(playlist_id_to_key(13), Some("standard"));
        assert_eq!(playlist_id_to_key(27), Some("hoops"));
        assert_eq!(playlist_id_to_key(28), Some("rumble"));
        assert_eq!(playlist_id_to_key(29), Some("dropshot"));
        assert_eq!(playlist_id_to_key(30), Some("snowday"));
        assert_eq!(playlist_id_to_key(34), Some("tournament"));
    }

    #[test]
    fn casual_ids_collapse_to_casual_mmr() {
        for id in [0, 1, 2, 3, 4, 15, 17, 18, 23] {
            assert_eq!(playlist_id_to_key(id), Some("casual"), "id {id}");
        }
    }

    #[test]
    fn match_labels_keep_specific_casual_modes() {
        assert_eq!(playlist_id_to_match_label(2), Some("Doubles"));
        assert_eq!(playlist_id_to_match_label(4), Some("Chaos"));
        assert_eq!(playlist_id_to_match_label(30), Some("Snowday"));
        assert_eq!(playlist_id_to_match_label(999), None);
    }

    #[test]
    fn rlstats_headers_map_to_keys() {
        assert_eq!(rlstats_label_to_key("1v1 Solo Duel"), Some("duel"));
        assert_eq!(rlstats_label_to_key("3v3 Tournament"), Some("tournament"));
        assert_eq!(rlstats_label_to_key("2v2 Hoops"), Some("hoops"));
        assert_eq!(rlstats_label_to_key("3v3 Snow Day"), Some("snowday"));
        assert_eq!(rlstats_label_to_key("Casual"), Some("casual"));
        assert_eq!(rlstats_label_to_key("Unknown"), None);
    }

    /// The numeric queue id distinguishes ranked from casual from tournament;
    /// every real match used to be persisted as the user's default instead.
    #[test]
    fn playlist_ids_derive_the_match_type() {
        assert_eq!(match_type_from_playlist_id(11), Some("ranked"));
        assert_eq!(match_type_from_playlist_id(13), Some("ranked"));
        assert_eq!(match_type_from_playlist_id(27), Some("ranked"));
        assert_eq!(match_type_from_playlist_id(2), Some("casual"));
        assert_eq!(match_type_from_playlist_id(3), Some("casual"));
        assert_eq!(match_type_from_playlist_id(0), Some("casual"));
        assert_eq!(match_type_from_playlist_id(34), Some("tournament"));
        assert_eq!(match_type_from_playlist_id(22), Some("tournament"));
        // Unknown ids defer to the caller's configured default.
        assert_eq!(match_type_from_playlist_id(999), None);
    }

    /// Every id that maps to a known playlist must also resolve a match type,
    /// so a real match can never fall through to the default by accident.
    #[test]
    fn every_known_playlist_has_a_match_type() {
        for id in [
            0, 1, 2, 3, 4, 10, 11, 13, 15, 17, 18, 22, 23, 27, 28, 29, 30, 34,
        ] {
            assert!(
                match_type_from_playlist_id(id).is_some(),
                "playlist id {id} must resolve a match type"
            );
        }
    }
}
