use crate::core::models::LivePlayer;
use crate::core::storage::{
    get_latest_player_mmr_for_playlist, get_mmr_cache, get_player_mmr_history_for_playlist,
    upsert_mmr_cache, DbPool,
};
use crate::core::tracker_api::{
    PlaylistStats as TrackerPlaylistStats, TrackerClient, TrackerProfile,
};
use crate::error::{AppError, AppResult};
use chrono::{DateTime, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::task::JoinSet;
use tracing::warn;

type RankInfoMap = HashMap<String, (Option<String>, Option<String>, Option<i32>)>;

const TRACKER_PROVIDER: &str = "tracker";
const RLSTATS_PROVIDER: &str = "rlstats";
const RAPIDAPI_PROVIDER: &str = "rapidapi";
const LOCAL_ESTIMATE_PROVIDER: &str = "local-estimate";
const HISTORY_PROVIDER: &str = "history";
const LOBBY_ESTIMATE_PROVIDER: &str = "lobby-estimate";
const LOCAL_ESTIMATE_PLATFORM: &str = "local";
const RAPIDAPI_HOST: &str = "rocket-league1.p.rapidapi.com";
const RAPIDAPI_BASE: &str = "https://rocket-league1.p.rapidapi.com";
const RAPIDAPI_CACHE_TTL_MINUTES: i64 = 15;
const TRACKER_CACHE_TTL_MINUTES: i64 = 15;
const RLSTATS_CACHE_TTL_MINUTES: i64 = 30;
const RLSTATS_BASE: &str = "https://rlstats.net";
const PARSEBOT_PROVIDER: &str = "parsebot";
const PARSEBOT_BASE: &str = "https://api.parse.bot";
const PARSEBOT_CACHE_TTL_MINUTES: i64 = 15;
const LOCAL_ESTIMATE_MAX_MATCHES: u32 = 3;
const LOCAL_ESTIMATE_FALLBACK_DELTA: i32 = 9;
const LOCAL_ESTIMATE_HISTORY_WINDOW: usize = 20;
const LOCAL_ESTIMATE_MIN_SAMPLES: usize = 2;
const LOCAL_ESTIMATE_MIN_DELTA: i32 = 1;
const LOCAL_ESTIMATE_MAX_DELTA: i32 = 30;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveMmrSnapshot {
    pub playlist: Option<String>,
    pub playlist_candidates: Vec<String>,
    pub playlist_confidence: String,
    pub fetched_at: String,
    pub players: Vec<LivePlayerMmr>,
    pub exact_count: usize,
    pub historical_count: usize,
    pub estimated_count: usize,
    pub unavailable_count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LivePlayerMmr {
    pub primary_id: String,
    pub player_name: String,
    pub platform: String,
    pub identifier: String,
    pub playlist: Option<String>,
    pub mmr: Option<i32>,
    pub rank_name: Option<String>,
    pub division: Option<String>,
    pub matches_played: Option<i64>,
    pub source: Option<String>,
    pub cached: bool,
    pub estimated: bool,
    pub stale: bool,
    pub estimate_matches_since_refresh: Option<u32>,
    pub updated_at: Option<String>,
    pub warning: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct CachedMmrProfile {
    provider: String,
    platform: String,
    identifier: String,
    fetched_at: String,
    playlists: HashMap<String, CachedPlaylistMmr>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct CachedPlaylistMmr {
    mmr: Option<i32>,
    rank_name: Option<String>,
    division: Option<String>,
    matches_played: Option<i64>,
}

#[derive(Clone, Debug)]
struct ProviderIdentity {
    source_primary_id: String,
    player_name: String,
    tracker_platform: String,
    rlstats_platform: String,
    identifier: String,
}

#[derive(Clone, Debug)]
struct PlaylistInference {
    primary: Option<String>,
    candidates: Vec<String>,
    confidence: &'static str,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct LocalMmrState {
    playlists: HashMap<String, LocalMmrEstimate>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct LocalMmrEstimate {
    mmr: i32,
    matches_since_refresh: u32,
    estimated: bool,
    updated_at: String,
}

#[derive(Clone, Debug)]
struct LocalEstimateResolution {
    mmr: i32,
    estimated: bool,
    stale: bool,
    matches_since_refresh: u32,
    updated_at: String,
}

#[allow(clippy::too_many_arguments)]
pub async fn resolve_lobby_mmr(
    db_pool: std::sync::Arc<DbPool>,
    rapidapi_key: Option<String>,
    rapidapi_enabled: bool,
    tracker_api_key: Option<String>,
    parsebot_api_key: Option<String>,
    parsebot_scraper_id: Option<String>,
    parsebot_endpoint: Option<String>,
    parsebot_enabled: bool,
    local_primary_id: Option<String>,
    prefer_local_estimate: bool,
    players: Vec<LivePlayer>,
) -> AppResult<LiveMmrSnapshot> {
    let inference = infer_playlist(players.iter());
    let fetched_at = Utc::now().to_rfc3339();
    let local_identity = local_primary_id.clone();

    let mut join_set = JoinSet::new();
    for player in players {
        let db_pool = std::sync::Arc::clone(&db_pool);
        let rapidapi_key = rapidapi_key.clone();
        let tracker_api_key = tracker_api_key.clone();
        let parsebot_api_key = parsebot_api_key.clone();
        let parsebot_scraper_id = parsebot_scraper_id.clone();
        let parsebot_endpoint = parsebot_endpoint.clone();
        let inference = inference.clone();
        let local_primary_id = local_primary_id.clone();

        join_set.spawn(async move {
            resolve_player_mmr(
                db_pool,
                rapidapi_key,
                rapidapi_enabled,
                tracker_api_key,
                parsebot_api_key,
                parsebot_scraper_id,
                parsebot_endpoint,
                parsebot_enabled,
                local_primary_id,
                prefer_local_estimate,
                player,
                inference,
            )
            .await
        });
    }

    let mut resolved = Vec::new();
    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(player) => resolved.push(player),
            Err(error) => {
                warn!(%error, "MMR lookup task failed");
            }
        }
    }

    apply_lobby_estimates(
        &mut resolved,
        local_identity.as_deref(),
        inference.primary.as_deref(),
    );

    resolved.sort_by(|left, right| {
        left.platform
            .cmp(&right.platform)
            .then_with(|| left.player_name.cmp(&right.player_name))
    });

    let exact_count = resolved
        .iter()
        .filter(|player| player.mmr.is_some() && !player.estimated && !player.stale)
        .count();
    let historical_count = resolved
        .iter()
        .filter(|player| player.mmr.is_some() && !player.estimated && player.stale)
        .count();
    let estimated_count = resolved
        .iter()
        .filter(|player| player.mmr.is_some() && player.estimated)
        .count();
    let unavailable_count = resolved
        .iter()
        .filter(|player| player.mmr.is_none())
        .count();
    Ok(LiveMmrSnapshot {
        playlist: inference.primary,
        playlist_candidates: inference.candidates,
        playlist_confidence: inference.confidence.into(),
        fetched_at,
        players: resolved,
        exact_count,
        historical_count,
        estimated_count,
        unavailable_count,
    })
}

fn apply_lobby_estimates(
    players: &mut [LivePlayerMmr],
    local_primary_id: Option<&str>,
    playlist: Option<&str>,
) {
    let Some(local_primary_id) = local_primary_id else {
        return;
    };
    let Some(baseline) = players
        .iter()
        .find(|player| player.primary_id == local_primary_id)
        .and_then(|player| player.mmr)
    else {
        return;
    };

    for player in players.iter_mut() {
        if player.primary_id == local_primary_id || player.mmr.is_some() {
            continue;
        }

        player.mmr = Some(baseline);
        player.playlist = playlist
            .map(str::to_string)
            .or_else(|| player.playlist.clone());
        player.source = Some(LOBBY_ESTIMATE_PROVIDER.into());
        player.cached = false;
        player.estimated = true;
        player.stale = false;
        player.warning = Some(
            "Estimacion de lobby: usa tu MMR conocido como referencia de matchmaking; no es el valor exacto de este jugador."
                .into(),
        );
        player.error = None;
    }
}

#[allow(clippy::too_many_arguments)]
async fn resolve_player_mmr(
    db_pool: std::sync::Arc<DbPool>,
    rapidapi_key: Option<String>,
    rapidapi_enabled: bool,
    tracker_api_key: Option<String>,
    parsebot_api_key: Option<String>,
    parsebot_scraper_id: Option<String>,
    parsebot_endpoint: Option<String>,
    parsebot_enabled: bool,
    local_primary_id: Option<String>,
    prefer_local_estimate: bool,
    player: LivePlayer,
    inference: PlaylistInference,
) -> LivePlayerMmr {
    let identity = match parse_primary_id(&player.id, &player.name) {
        Ok(identity) => identity,
        Err(error) => {
            return LivePlayerMmr {
                primary_id: player.id,
                player_name: player.name,
                platform: "unknown".into(),
                identifier: String::new(),
                playlist: inference.primary,
                mmr: None,
                rank_name: None,
                division: None,
                matches_played: None,
                source: None,
                cached: false,
                estimated: false,
                stale: false,
                estimate_matches_since_refresh: None,
                updated_at: None,
                warning: None,
                error: Some(error.to_string()),
            };
        }
    };

    let is_local_player = local_primary_id.as_deref() == Some(identity.source_primary_id.as_str());

    if prefer_local_estimate && is_local_player {
        if let Some(playlist_key) = inference.primary.as_deref() {
            if let Ok(Some(local_estimate)) =
                resolve_local_estimate(&db_pool, &identity.source_primary_id, playlist_key)
            {
                return LivePlayerMmr {
                    primary_id: identity.source_primary_id,
                    player_name: identity.player_name,
                    platform: identity.tracker_platform,
                    identifier: identity.identifier,
                    playlist: Some(playlist_key.to_string()),
                    mmr: Some(local_estimate.mmr),
                    rank_name: None,
                    division: None,
                    matches_played: None,
                    source: Some(LOCAL_ESTIMATE_PROVIDER.into()),
                    cached: true,
                    estimated: local_estimate.estimated,
                    stale: local_estimate.stale,
                    estimate_matches_since_refresh: Some(local_estimate.matches_since_refresh),
                    updated_at: if local_estimate.updated_at.is_empty() {
                        None
                    } else {
                        Some(local_estimate.updated_at.clone())
                    },
                    warning: if local_estimate.estimated {
                        Some(if local_estimate.stale {
                            "MMR local estimado. Ya acumulo varias partidas sin refrescarse online."
                                .into()
                        } else {
                            "MMR local estimado a partir de tu ultimo valor conocido y resultados recientes.".into()
                        })
                    } else {
                        None
                    },
                    error: None,
                };
            }
        }
    }

    if let Some(ref resolved_playlist) = inference.primary {
        let mut attempted_errors = Vec::new();
        let mut rapidapi_failed = false;
        let mut tracker_failed = false;
        let mut parsebot_failed = false;
        let mut rlstats_failed = false;

        for playlist_key in &inference.candidates {
            if rapidapi_enabled && rapidapi_key.is_some() && !rapidapi_failed {
                match resolve_with_rapidapi(
                    &db_pool,
                    rapidapi_key.clone(),
                    rapidapi_enabled,
                    &identity,
                    playlist_key,
                )
                .await
                {
                    Ok(entry) if entry.mmr.is_some() => {
                        if is_local_player {
                            let _ = sync_local_trusted_mmr(
                                &db_pool,
                                &identity.source_primary_id,
                                playlist_key,
                                entry.mmr,
                            );
                        }
                        return build_player_result(
                            identity,
                            Some(playlist_key.clone()),
                            entry,
                            maybe_confidence_warning(&inference, resolved_playlist, playlist_key),
                        );
                    }
                    Ok(_) => attempted_errors.push(format!(
                        "RapidAPI [{}]: el perfil no tiene MMR para esta playlist",
                        playlist_key
                    )),
                    Err(error) => {
                        attempted_errors.push(format!("RapidAPI [{}]: {}", playlist_key, error));
                        rapidapi_failed = true;
                    }
                }
            }

            if tracker_api_key.is_some() && !tracker_failed {
                match resolve_with_tracker(
                    &db_pool,
                    tracker_api_key.clone(),
                    &identity,
                    playlist_key,
                )
                .await
                {
                    Ok(entry) if entry.mmr.is_some() => {
                        if is_local_player {
                            let _ = sync_local_trusted_mmr(
                                &db_pool,
                                &identity.source_primary_id,
                                playlist_key,
                                entry.mmr,
                            );
                        }
                        return build_player_result(
                            identity,
                            Some(playlist_key.clone()),
                            entry,
                            maybe_confidence_warning(&inference, resolved_playlist, playlist_key),
                        );
                    }
                    Ok(_) => attempted_errors.push(format!(
                        "Tracker [{}]: el perfil no tiene MMR para esta playlist",
                        playlist_key
                    )),
                    Err(error) => {
                        attempted_errors.push(format!("Tracker [{}]: {}", playlist_key, error));
                        tracker_failed = true;
                    }
                }
            }

            if parsebot_enabled
                && parsebot_api_key.is_some()
                && parsebot_scraper_id.is_some()
                && !parsebot_failed
            {
                match resolve_with_parsebot(
                    &db_pool,
                    parsebot_api_key.clone(),
                    parsebot_scraper_id.clone(),
                    parsebot_endpoint.clone(),
                    parsebot_enabled,
                    &identity,
                    playlist_key,
                )
                .await
                {
                    Ok(entry) if entry.mmr.is_some() => {
                        if is_local_player {
                            let _ = sync_local_trusted_mmr(
                                &db_pool,
                                &identity.source_primary_id,
                                playlist_key,
                                entry.mmr,
                            );
                        }
                        return build_player_result(
                            identity,
                            Some(playlist_key.clone()),
                            entry,
                            maybe_confidence_warning(&inference, resolved_playlist, playlist_key),
                        );
                    }
                    Ok(_) => attempted_errors.push(format!(
                        "ParseBot [{}]: el perfil no tiene MMR para esta playlist",
                        playlist_key
                    )),
                    Err(error) => {
                        attempted_errors.push(format!("ParseBot [{}]: {}", playlist_key, error));
                        parsebot_failed = true;
                    }
                }
            }

            if !rlstats_failed {
                match resolve_with_rlstats(&db_pool, &identity, playlist_key).await {
                    Ok(entry) if entry.mmr.is_some() => {
                        if is_local_player {
                            let _ = sync_local_trusted_mmr(
                                &db_pool,
                                &identity.source_primary_id,
                                playlist_key,
                                entry.mmr,
                            );
                        }
                        return build_player_result(
                            identity,
                            Some(playlist_key.clone()),
                            entry,
                            maybe_confidence_warning(&inference, resolved_playlist, playlist_key),
                        );
                    }
                    Ok(_) => attempted_errors.push(format!(
                        "RLStats [{}]: el perfil no tiene MMR para esta playlist",
                        playlist_key
                    )),
                    Err(error) => {
                        attempted_errors.push(format!("RLStats [{}]: {}", playlist_key, error));
                        rlstats_failed = true;
                    }
                }
            }
        }

        for playlist_key in &inference.candidates {
            if let Ok(Some(mmr)) = get_latest_player_mmr_for_playlist(
                &db_pool,
                &identity.source_primary_id,
                playlist_key,
            ) {
                return LivePlayerMmr {
                    primary_id: identity.source_primary_id,
                    player_name: identity.player_name,
                    platform: identity.tracker_platform,
                    identifier: identity.identifier,
                    playlist: Some(playlist_key.clone()),
                    mmr: Some(mmr),
                    rank_name: None,
                    division: None,
                    matches_played: None,
                    source: Some(HISTORY_PROVIDER.into()),
                    cached: true,
                    estimated: false,
                    stale: true,
                    estimate_matches_since_refresh: None,
                    updated_at: None,
                    warning: Some(
                        "Ultimo MMR exacto guardado para este jugador; puede haber cambiado desde esa partida."
                            .into(),
                    ),
                    error: None,
                };
            }
        }

        let detailed_error = if attempted_errors.is_empty() {
            None
        } else {
            Some(attempted_errors.join(" | "))
        };

        return LivePlayerMmr {
            primary_id: identity.source_primary_id,
            player_name: identity.player_name,
            platform: identity.tracker_platform,
            identifier: identity.identifier,
            playlist: Some(resolved_playlist.clone()),
            mmr: None,
            rank_name: None,
            division: None,
            matches_played: None,
            source: None,
            cached: false,
            estimated: false,
            stale: false,
            estimate_matches_since_refresh: None,
            updated_at: None,
            warning: None,
            error: Some(if let Some(detailed_error) = detailed_error {
                if inference.confidence == "low" {
                    format!(
                        "No se pudo resolver MMR. La playlist del lobby se estimo como '{}' y se probaron estos candidatos: {}. Detalle: {}",
                        resolved_playlist,
                        inference.candidates.join(", "),
                        detailed_error
                    )
                } else {
                    format!(
                        "No se pudo resolver MMR para este jugador. Detalle: {}",
                        detailed_error
                    )
                }
            } else if inference.confidence == "low" {
                format!(
                    "No se pudo resolver MMR. La playlist actual es ambigua en la Stats API; candidatos: {}.",
                    inference.candidates.join(", ")
                )
            } else {
                "No se pudo resolver MMR para este jugador con los proveedores disponibles.".into()
            }),
        };
    }

    LivePlayerMmr {
        primary_id: identity.source_primary_id,
        player_name: identity.player_name,
        platform: identity.tracker_platform,
        identifier: identity.identifier,
        playlist: inference.primary,
        mmr: None,
        rank_name: None,
        division: None,
        matches_played: None,
        source: None,
        cached: false,
        estimated: false,
        stale: false,
        estimate_matches_since_refresh: None,
        updated_at: None,
        warning: None,
        error: Some(
            "No pudimos inferir la playlist actual con suficiente confianza desde la Stats API."
                .into(),
        ),
    }
}

fn build_player_result(
    identity: ProviderIdentity,
    playlist: Option<String>,
    entry: ResolvedMmrEntry,
    warning: Option<String>,
) -> LivePlayerMmr {
    LivePlayerMmr {
        primary_id: identity.source_primary_id,
        player_name: identity.player_name,
        platform: identity.tracker_platform,
        identifier: identity.identifier,
        playlist,
        mmr: entry.mmr,
        rank_name: entry.rank_name,
        division: entry.division,
        matches_played: entry.matches_played,
        source: Some(entry.source),
        cached: entry.cached,
        estimated: false,
        stale: false,
        estimate_matches_since_refresh: None,
        updated_at: None,
        warning,
        error: None,
    }
}

pub fn update_local_mmr_estimate(
    db_pool: &DbPool,
    local_primary_id: &str,
    playlist: &str,
    pre_match_mmr: Option<i32>,
    did_win: bool,
) -> AppResult<()> {
    let mut state = read_local_mmr_state(db_pool, local_primary_id)?;
    let baseline = pre_match_mmr
        .or_else(|| state.playlists.get(playlist).map(|estimate| estimate.mmr))
        .or_else(|| {
            get_latest_player_mmr_for_playlist(db_pool, local_primary_id, playlist)
                .ok()
                .flatten()
        });

    let Some(baseline) = baseline else {
        return Ok(());
    };

    let delta = compute_average_mmr_delta(db_pool, local_primary_id, playlist);
    let next_mmr = baseline + if did_win { delta } else { -delta };
    let previous_matches = state
        .playlists
        .get(playlist)
        .map(|estimate| estimate.matches_since_refresh)
        .unwrap_or(0);

    state.playlists.insert(
        playlist.to_string(),
        LocalMmrEstimate {
            mmr: next_mmr,
            matches_since_refresh: previous_matches.saturating_add(1),
            estimated: true,
            updated_at: Utc::now().to_rfc3339(),
        },
    );

    write_local_mmr_state(db_pool, local_primary_id, &state)
}

/// Computes the average absolute MMR delta from the player's recent match
/// history for the given playlist. Returns the fallback delta if there is
/// not enough data. The result is clamped to a sensible range so an outlier
/// match cannot produce absurd swings.
fn compute_average_mmr_delta(db_pool: &DbPool, primary_id: &str, playlist: &str) -> i32 {
    let history = match get_player_mmr_history_for_playlist(
        db_pool,
        primary_id,
        playlist,
        LOCAL_ESTIMATE_HISTORY_WINDOW,
    ) {
        Ok(values) => values,
        Err(_) => return LOCAL_ESTIMATE_FALLBACK_DELTA,
    };

    if history.len() < LOCAL_ESTIMATE_MIN_SAMPLES {
        return LOCAL_ESTIMATE_FALLBACK_DELTA;
    }

    // History arrives most-recent first; pair consecutive entries to get
    // absolute deltas between adjacent matches.
    let deltas: Vec<i32> = history
        .windows(2)
        .map(|pair| (pair[0] - pair[1]).abs())
        .collect();

    if deltas.is_empty() {
        return LOCAL_ESTIMATE_FALLBACK_DELTA;
    }

    let sum: i64 = deltas.iter().map(|d| i64::from(*d)).sum();
    let avg = (sum / i64::try_from(deltas.len()).unwrap_or(1)) as i32;

    avg.clamp(LOCAL_ESTIMATE_MIN_DELTA, LOCAL_ESTIMATE_MAX_DELTA)
}

fn maybe_confidence_warning(
    inference: &PlaylistInference,
    resolved_playlist: &str,
    selected_playlist: &str,
) -> Option<String> {
    if inference.confidence == "low" && resolved_playlist != selected_playlist {
        return Some(format!(
            "La playlist del lobby es una estimacion. Se uso '{}' porque la fuente primaria sugerida ('{}') no resolvio datos.",
            selected_playlist, resolved_playlist
        ));
    }

    if inference.confidence == "low" {
        return Some(format!(
            "La playlist del lobby es una estimacion basada en el tamano del match. Candidatos: {}.",
            inference.candidates.join(", ")
        ));
    }

    None
}

#[derive(Clone, Debug)]
struct ResolvedMmrEntry {
    source: String,
    cached: bool,
    mmr: Option<i32>,
    rank_name: Option<String>,
    division: Option<String>,
    matches_played: Option<i64>,
}

async fn resolve_with_tracker(
    db_pool: &DbPool,
    tracker_api_key: Option<String>,
    identity: &ProviderIdentity,
    playlist_key: &str,
) -> AppResult<ResolvedMmrEntry> {
    if let Some(cached) = read_cached_profile(
        db_pool,
        TRACKER_PROVIDER,
        &identity.tracker_platform,
        &identity.identifier,
        TRACKER_CACHE_TTL_MINUTES,
    )? {
        if let Some(entry) = cached.playlists.get(playlist_key) {
            return Ok(ResolvedMmrEntry {
                source: TRACKER_PROVIDER.into(),
                cached: true,
                mmr: entry.mmr,
                rank_name: entry.rank_name.clone(),
                division: entry.division.clone(),
                matches_played: entry.matches_played,
            });
        }
    }

    let api_key = tracker_api_key.ok_or_else(|| {
        AppError::ConfigError("Tracker Network no esta configurado para este dispositivo.".into())
    })?;

    let client = TrackerClient::new(Some(api_key))?;
    let profile = client
        .fetch_profile(&identity.tracker_platform, &identity.identifier)
        .await?;

    let cached_profile =
        map_tracker_profile(&profile, &identity.tracker_platform, &identity.identifier);
    store_cached_profile(db_pool, &cached_profile)?;

    let entry = cached_profile
        .playlists
        .get(playlist_key)
        .cloned()
        .unwrap_or_default();

    Ok(ResolvedMmrEntry {
        source: TRACKER_PROVIDER.into(),
        cached: false,
        mmr: entry.mmr,
        rank_name: entry.rank_name,
        division: entry.division,
        matches_played: entry.matches_played,
    })
}

async fn resolve_with_rlstats(
    db_pool: &DbPool,
    identity: &ProviderIdentity,
    playlist_key: &str,
) -> AppResult<ResolvedMmrEntry> {
    if let Some(cached) = read_cached_profile(
        db_pool,
        RLSTATS_PROVIDER,
        &identity.tracker_platform,
        &identity.identifier,
        RLSTATS_CACHE_TTL_MINUTES,
    )? {
        if let Some(entry) = cached.playlists.get(playlist_key) {
            return Ok(ResolvedMmrEntry {
                source: RLSTATS_PROVIDER.into(),
                cached: true,
                mmr: entry.mmr,
                rank_name: entry.rank_name.clone(),
                division: entry.division.clone(),
                matches_played: entry.matches_played,
            });
        }
    }

    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        )
        .default_headers({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                reqwest::header::ACCEPT,
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
                    .parse()
                    .unwrap(),
            );
            headers.insert(
                reqwest::header::ACCEPT_LANGUAGE,
                "en-US,en;q=0.9".parse().unwrap(),
            );
            headers.insert(
                reqwest::header::ACCEPT_ENCODING,
                "gzip, deflate, br".parse().unwrap(),
            );
            headers.insert(reqwest::header::CACHE_CONTROL, "no-cache".parse().unwrap());
            headers.insert(reqwest::header::PRAGMA, "no-cache".parse().unwrap());
            headers.insert(
                reqwest::header::UPGRADE_INSECURE_REQUESTS,
                "1".parse().unwrap(),
            );
            headers
        })
        .timeout(std::time::Duration::from_secs(12))
        .build()?;

    let url = format!(
        "{}/profile/{}/{}",
        RLSTATS_BASE, identity.rlstats_platform, identity.identifier
    );
    let response = client.get(url).send().await?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::TOO_MANY_REQUESTS
    {
        let body_lower = body.to_ascii_lowercase();
        let is_cloudflare = body_lower.contains("cloudflare")
            || body_lower.contains("attention required")
            || body_lower.contains("security verification");
        return Err(AppError::ConnectionError(format!(
            "RLStats bloqueo el acceso (HTTP {}). {}",
            status.as_u16(),
            if is_cloudflare {
                "Cloudflare anti-bot activo. Intenta de nuevo mas tarde o usa otro proveedor de MMR."
            } else {
                "El sitio rechazo la solicitud."
            }
        )));
    }

    if body.contains("Just a moment...")
        || body.contains("cf-browser-verification")
        || body.contains("cf-chl-")
        || body.contains("Enable JavaScript and cookies to continue")
    {
        return Err(AppError::ConnectionError(
            "RLStats bloqueo la consulta automatica con Cloudflare; el perfil solo esta disponible desde un navegador."
                .into(),
        ));
    }

    if !status.is_success() {
        return Err(AppError::ConnectionError(format!(
            "RLStats devolvio HTTP {}",
            status.as_u16()
        )));
    }

    let cached_profile =
        parse_rlstats_profile(&body, &identity.tracker_platform, &identity.identifier)?;
    store_cached_profile(db_pool, &cached_profile)?;

    let entry = cached_profile
        .playlists
        .get(playlist_key)
        .cloned()
        .unwrap_or_default();

    Ok(ResolvedMmrEntry {
        source: RLSTATS_PROVIDER.into(),
        cached: false,
        mmr: entry.mmr,
        rank_name: entry.rank_name,
        division: entry.division,
        matches_played: entry.matches_played,
    })
}

async fn resolve_with_rapidapi(
    db_pool: &DbPool,
    rapidapi_key: Option<String>,
    rapidapi_enabled: bool,
    identity: &ProviderIdentity,
    playlist_key: &str,
) -> AppResult<ResolvedMmrEntry> {
    if !rapidapi_enabled {
        return Err(AppError::ConfigError(
            "RapidAPI esta deshabilitado para este dispositivo.".into(),
        ));
    }

    if let Some(cached) = read_cached_profile(
        db_pool,
        RAPIDAPI_PROVIDER,
        &identity.tracker_platform,
        &identity.identifier,
        RAPIDAPI_CACHE_TTL_MINUTES,
    )? {
        if let Some(entry) = cached.playlists.get(playlist_key) {
            return Ok(ResolvedMmrEntry {
                source: RAPIDAPI_PROVIDER.into(),
                cached: true,
                mmr: entry.mmr,
                rank_name: entry.rank_name.clone(),
                division: entry.division.clone(),
                matches_played: entry.matches_played,
            });
        }
    }

    let api_key = rapidapi_key.ok_or_else(|| {
        AppError::ConfigError("RapidAPI no esta configurado para este dispositivo.".into())
    })?;

    let client = reqwest::Client::builder()
        .user_agent("RapidAPI Playground")
        .timeout(std::time::Duration::from_secs(12))
        .build()?;

    let url = format!("{}/ranks/{}", RAPIDAPI_BASE, identity.identifier);
    let response = client
        .get(url)
        .header("X-RapidAPI-Key", api_key)
        .header("X-RapidAPI-Host", RAPIDAPI_HOST)
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .send()
        .await?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(AppError::ConnectionError(
            "RapidAPI devolvio demasiadas solicitudes (429).".into(),
        ));
    }

    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(AppError::ConfigError(format!(
            "RapidAPI rechazo la clave o el acceso (HTTP {}).",
            status.as_u16()
        )));
    }

    if !status.is_success() {
        return Err(AppError::ConnectionError(format!(
            "RapidAPI devolvio HTTP {}: {}",
            status.as_u16(),
            body.chars().take(300).collect::<String>()
        )));
    }

    let cached_profile =
        parse_rapidapi_profile(&body, &identity.tracker_platform, &identity.identifier)?;
    store_cached_profile(db_pool, &cached_profile)?;

    let entry = cached_profile
        .playlists
        .get(playlist_key)
        .cloned()
        .unwrap_or_default();

    Ok(ResolvedMmrEntry {
        source: RAPIDAPI_PROVIDER.into(),
        cached: false,
        mmr: entry.mmr,
        rank_name: entry.rank_name,
        division: entry.division,
        matches_played: entry.matches_played,
    })
}

/// Provider that delegates scraping to a user-configured parse.bot scraper.
///
/// Each user builds their own scraper on parse.bot pointing at an MMR site
/// (RLStats, Tracker Network, etc.) and configures the `scraper_id`, endpoint
/// name, and API key in app settings. Parse.bot handles proxy rotation and
/// anti-bot bypass, so this works even when the target site is behind
/// Cloudflare.
///
/// The scraper is expected to return JSON with playlist MMR data. We reuse
/// the same flexible `collect_rapidapi_playlists` parser since parse.bot
/// scrapers tend to return similar shapes (mmr/rank/division fields keyed by
/// playlist name).
async fn resolve_with_parsebot(
    db_pool: &DbPool,
    parsebot_api_key: Option<String>,
    parsebot_scraper_id: Option<String>,
    parsebot_endpoint: Option<String>,
    parsebot_enabled: bool,
    identity: &ProviderIdentity,
    playlist_key: &str,
) -> AppResult<ResolvedMmrEntry> {
    if !parsebot_enabled {
        return Err(AppError::ConfigError(
            "Parse.bot esta deshabilitado para este dispositivo.".into(),
        ));
    }

    if let Some(cached) = read_cached_profile(
        db_pool,
        PARSEBOT_PROVIDER,
        &identity.tracker_platform,
        &identity.identifier,
        PARSEBOT_CACHE_TTL_MINUTES,
    )? {
        if let Some(entry) = cached.playlists.get(playlist_key) {
            return Ok(ResolvedMmrEntry {
                source: PARSEBOT_PROVIDER.into(),
                cached: true,
                mmr: entry.mmr,
                rank_name: entry.rank_name.clone(),
                division: entry.division.clone(),
                matches_played: entry.matches_played,
            });
        }
    }

    let api_key = parsebot_api_key
        .ok_or_else(|| AppError::ConfigError("Parse.bot API key no esta configurada.".into()))?;
    let scraper_id = parsebot_scraper_id
        .ok_or_else(|| AppError::ConfigError("Parse.bot scraper_id no esta configurado.".into()))?;
    let endpoint = parsebot_endpoint.unwrap_or_else(|| "get_profile".to_string());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()?;

    let url = format!("{}/scraper/{}/{}", PARSEBOT_BASE, scraper_id, endpoint);
    let body_json = serde_json::json!({
        "platform": identity.tracker_platform,
        "identifier": identity.identifier,
    });

    let response = client
        .post(&url)
        .header("X-API-Key", &api_key)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&body_json)
        .send()
        .await?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(AppError::ConnectionError(
            "Parse.bot devolvio demasiadas solicitudes (429). Revisa tus creditos.".into(),
        ));
    }

    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(AppError::ConfigError(format!(
            "Parse.bot rechazo la API key (HTTP {}).",
            status.as_u16()
        )));
    }

    if !status.is_success() {
        return Err(AppError::ConnectionError(format!(
            "Parse.bot devolvio HTTP {}: {}",
            status.as_u16(),
            body.chars().take(300).collect::<String>()
        )));
    }

    let cached_profile =
        parse_rapidapi_profile(&body, &identity.tracker_platform, &identity.identifier)?;
    store_cached_profile(db_pool, &cached_profile)?;

    let entry = cached_profile
        .playlists
        .get(playlist_key)
        .cloned()
        .unwrap_or_default();

    Ok(ResolvedMmrEntry {
        source: PARSEBOT_PROVIDER.into(),
        cached: false,
        mmr: entry.mmr,
        rank_name: entry.rank_name,
        division: entry.division,
        matches_played: entry.matches_played,
    })
}

fn map_tracker_profile(
    profile: &TrackerProfile,
    platform: &str,
    identifier: &str,
) -> CachedMmrProfile {
    let mut playlists = HashMap::new();
    insert_tracker_playlist(&mut playlists, "duel", profile.stats.ranked.duel.as_ref());
    insert_tracker_playlist(
        &mut playlists,
        "doubles",
        profile.stats.ranked.double.as_ref(),
    );
    insert_tracker_playlist(
        &mut playlists,
        "standard",
        profile.stats.ranked.standard.as_ref(),
    );
    insert_tracker_playlist(&mut playlists, "hoops", profile.stats.extra.hoops.as_ref());
    insert_tracker_playlist(
        &mut playlists,
        "rumble",
        profile.stats.extra.rumble.as_ref(),
    );
    insert_tracker_playlist(
        &mut playlists,
        "dropshot",
        profile.stats.extra.dropshot.as_ref(),
    );
    insert_tracker_playlist(
        &mut playlists,
        "snowday",
        profile.stats.extra.snowday.as_ref(),
    );
    insert_tracker_playlist(&mut playlists, "casual", profile.stats.unranked.as_ref());

    CachedMmrProfile {
        provider: TRACKER_PROVIDER.into(),
        platform: platform.into(),
        identifier: identifier.into(),
        fetched_at: Utc::now().to_rfc3339(),
        playlists,
    }
}

fn insert_tracker_playlist(
    target: &mut HashMap<String, CachedPlaylistMmr>,
    key: &str,
    playlist: Option<&TrackerPlaylistStats>,
) {
    if let Some(playlist) = playlist {
        target.insert(
            key.into(),
            CachedPlaylistMmr {
                mmr: playlist.mmr.and_then(|value| i32::try_from(value).ok()),
                rank_name: playlist.rank.as_ref().map(|rank| rank.tier.name.clone()),
                division: playlist
                    .rank
                    .as_ref()
                    .map(|rank| rank.division.name.clone()),
                matches_played: playlist.matches_played,
            },
        );
    }
}

fn parse_rapidapi_profile(
    body: &str,
    platform: &str,
    identifier: &str,
) -> AppResult<CachedMmrProfile> {
    let json: serde_json::Value = serde_json::from_str(body)
        .map_err(|e| AppError::ParseError(format!("RapidAPI devolvio JSON invalido: {e}")))?;

    let mut playlists = HashMap::new();
    collect_rapidapi_playlists(&json, None, &mut playlists);

    if playlists.is_empty() {
        return Err(AppError::ParseError(
            "RapidAPI no devolvio playlists reconocibles para MMR.".into(),
        ));
    }

    Ok(CachedMmrProfile {
        provider: RAPIDAPI_PROVIDER.into(),
        platform: platform.into(),
        identifier: identifier.into(),
        fetched_at: Utc::now().to_rfc3339(),
        playlists,
    })
}

fn collect_rapidapi_playlists(
    value: &serde_json::Value,
    context_playlist: Option<&str>,
    target: &mut HashMap<String, CachedPlaylistMmr>,
) {
    match value {
        serde_json::Value::Object(map) => {
            let inferred_playlist = map
                .get("playlist")
                .and_then(|v| v.as_str())
                .and_then(normalize_rapidapi_playlist_key)
                .or(context_playlist);

            if let Some(playlist_key) = inferred_playlist {
                if let Some(entry) = parse_rapidapi_playlist_entry(map) {
                    target.entry(playlist_key.to_string()).or_insert(entry);
                }
            }

            for (key, nested) in map {
                let nested_playlist = normalize_rapidapi_playlist_key(key).or(inferred_playlist);
                collect_rapidapi_playlists(nested, nested_playlist, target);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_rapidapi_playlists(item, context_playlist, target);
            }
        }
        _ => {}
    }
}

fn parse_rapidapi_playlist_entry(
    map: &serde_json::Map<String, serde_json::Value>,
) -> Option<CachedPlaylistMmr> {
    let mmr = map
        .get("mmr")
        .or_else(|| map.get("MMR"))
        .or_else(|| map.get("elo"))
        .or_else(|| map.get("rating"))
        .or_else(|| map.get("rankPoints"))
        .and_then(json_value_to_i32);

    let rank_name = map
        .get("rank")
        .or_else(|| map.get("tierName"))
        .or_else(|| map.get("rankName"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let division = map
        .get("division")
        .or_else(|| map.get("divisionName"))
        .and_then(json_value_to_string)
        .filter(|s| !s.is_empty());

    let matches_played = map
        .get("matchesPlayed")
        .or_else(|| map.get("matches"))
        .or_else(|| map.get("totalGames"))
        .or_else(|| map.get("gamesPlayed"))
        .and_then(json_value_to_i64);

    if mmr.is_none() && rank_name.is_none() && division.is_none() && matches_played.is_none() {
        return None;
    }

    Some(CachedPlaylistMmr {
        mmr,
        rank_name,
        division,
        matches_played,
    })
}

fn normalize_rapidapi_playlist_key(label: &str) -> Option<&'static str> {
    match label.trim().to_ascii_lowercase().as_str() {
        "duel" | "1v1" | "1v1 duel" | "10" => Some("duel"),
        "doubles" | "2v2" | "2v2 doubles" | "11" => Some("doubles"),
        "standard" | "3v3" | "3v3 standard" | "13" => Some("standard"),
        "hoops" | "27" => Some("hoops"),
        "rumble" | "28" => Some("rumble"),
        "dropshot" | "29" => Some("dropshot"),
        "snowday" | "snow day" | "30" => Some("snowday"),
        "quads" | "chaos" | "4v4" => Some("quads"),
        _ => None,
    }
}

fn json_value_to_i32(value: &serde_json::Value) -> Option<i32> {
    match value {
        serde_json::Value::Number(number) => number.as_i64().and_then(|v| i32::try_from(v).ok()),
        serde_json::Value::String(text) => text.trim().parse::<i32>().ok(),
        _ => None,
    }
}

fn json_value_to_i64(value: &serde_json::Value) -> Option<i64> {
    match value {
        serde_json::Value::Number(number) => number.as_i64(),
        serde_json::Value::String(text) => text.trim().parse::<i64>().ok(),
        _ => None,
    }
}

fn json_value_to_string(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(text) => Some(text.trim().to_string()),
        serde_json::Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

fn parse_rlstats_profile(
    html: &str,
    platform: &str,
    identifier: &str,
) -> AppResult<CachedMmrProfile> {
    let columns = extract_rlstats_columns(html)?;
    let first_row = extract_rlstats_first_row(html)?;
    let values = split_csv_like(&first_row);

    if values.len() < columns.len() + 1 {
        return Err(AppError::ParseError(
            "RLStats no devolvio suficientes valores para construir el perfil MMR.".into(),
        ));
    }

    let table_rank_info = extract_rlstats_table_rank_info(html);

    let mut playlists = HashMap::new();
    for (column, token) in columns.into_iter().zip(values.into_iter().skip(1)) {
        let token = token.trim().trim_matches('~');
        let mmr = if token.is_empty() {
            None
        } else {
            token.parse::<i32>().ok()
        };

        let (rank_name, division, mp) = table_rank_info
            .get(column.as_str())
            .cloned()
            .unwrap_or((None, None, None));

        playlists.insert(
            column,
            CachedPlaylistMmr {
                mmr,
                rank_name,
                division,
                matches_played: mp.map(|v| v as i64),
            },
        );
    }

    Ok(CachedMmrProfile {
        provider: RLSTATS_PROVIDER.into(),
        platform: platform.into(),
        identifier: identifier.into(),
        fetched_at: Utc::now().to_rfc3339(),
        playlists,
    })
}

fn extract_rlstats_table_rank_info(html: &str) -> RankInfoMap {
    let skills_start = match html.find("id=\"skills\"") {
        Some(pos) => pos,
        None => return HashMap::new(),
    };

    let history_start = html[skills_start..]
        .find("id=\"history\"")
        .map(|p| skills_start + p)
        .unwrap_or(html.len());

    let section = &html[skills_start..history_start];
    let mut result = HashMap::new();

    let mut rem = section;
    let mut table_count = 0;
    while let Some(table_start) = rem.find("<table") {
        let after = &rem[table_start..];
        let table_end = after
            .find("</table>")
            .map(|p| table_start + p + 8)
            .unwrap_or(rem.len());
        let table_html = &rem[table_start..table_end];

        if !table_html.contains("unranked-block") && !table_html.contains("Casual") {
            parse_single_skill_table(table_html, table_count, &mut result);
            table_count += 1;
        }

        rem = &rem[table_end..];
    }

    result
}

fn parse_single_skill_table(table_html: &str, _table_index: usize, out: &mut RankInfoMap) {
    let rows = extract_rlstats_table_rows(table_html);
    if rows.len() < 6 {
        return;
    }

    let headers = extract_tr_cell_texts(&rows[0]);
    let rank_names = extract_tr_cell_texts(&rows[1]);
    let divisions = extract_tr_cell_texts(&rows[2]);
    let matches_played_row = extract_tr_cell_texts(rows.get(4).unwrap_or(&String::new()));

    for (i, header) in headers.iter().enumerate() {
        let key = normalize_playlist_key_from_header(header);
        let key = match key {
            Some(k) => k.to_string(),
            None => continue,
        };

        let rank_name = rank_names.get(i).cloned();
        let rank_name = rank_name.filter(|n| !n.is_empty() && n != "Unranked");

        let division = divisions.get(i).cloned();
        let division = division.filter(|d| !d.is_empty());

        let mp = matches_played_row.get(i).and_then(|s| {
            s.split_whitespace()
                .last()
                .and_then(|w| w.parse::<i32>().ok())
        });

        out.insert(key, (rank_name, division, mp));
    }
}

fn extract_rlstats_table_rows(table_html: &str) -> Vec<String> {
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

fn extract_tr_cell_texts(row_html: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut remaining = row_html;

    while let Some(tag_start) = remaining.find("<t") {
        let after = &remaining[tag_start..];
        let content_start = match after.find('>') {
            Some(p) => tag_start + p + 1,
            None => break,
        };

        let close = match after.find("</td>") {
            Some(p) => p + 5,
            None => match after.find("</th>") {
                Some(p) => p + 5,
                None => break,
            },
        };

        let content = &remaining[content_start..tag_start + close - 5];
        values.push(content.trim().to_string());
        remaining = &remaining[tag_start + close..];
    }

    values
}

fn normalize_playlist_key_from_header(text: &str) -> Option<&'static str> {
    let t = text.trim().to_lowercase();
    if t.contains("duel") || t.contains("1v1 duel") {
        Some("duel")
    } else if t.contains("doubles") || t.contains("2v2 doubles") {
        Some("doubles")
    } else if t.contains("standard") || t.contains("3v3 standard") {
        Some("standard")
    } else if t.contains("tournament") {
        Some("tournament")
    } else if t.contains("heatseeker") {
        Some("heatseeker")
    } else if t.contains("hoops") {
        Some("hoops")
    } else if t.contains("rumble") {
        Some("rumble")
    } else if t.contains("dropshot") {
        Some("dropshot")
    } else if t.contains("snow") {
        Some("snowday")
    } else if t.contains("quad") || t.contains("4v4") {
        Some("quads")
    } else {
        normalize_playlist_key(text)
    }
}

fn extract_rlstats_columns(html: &str) -> AppResult<Vec<String>> {
    let marker = "data.addColumn";
    let mut search_start = 0usize;
    let mut columns = Vec::new();

    while let Some(relative_index) = html[search_start..].find(marker) {
        let start = search_start + relative_index;
        let statement_end = html[start..]
            .find(");")
            .map(|offset| start + offset)
            .ok_or_else(|| {
                AppError::ParseError(
                    "RLStats devolvio una definicion de columnas inesperada.".into(),
                )
            })?;
        let statement = &html[start..statement_end];

        if let Some(label) = extract_last_quoted_literal(statement) {
            if let Some(key) = normalize_playlist_key(&label) {
                columns.push(key.to_string());
            }
        }

        search_start = statement_end + 2;
    }

    if columns.is_empty() {
        return Err(AppError::ParseError(
            "No pudimos detectar columnas de MMR en RLStats.".into(),
        ));
    }

    Ok(columns)
}

fn extract_last_quoted_literal(statement: &str) -> Option<String> {
    let mut literals = Vec::new();
    let mut chars = statement.char_indices().peekable();

    while let Some((index, ch)) = chars.next() {
        if ch != '\'' && ch != '"' {
            continue;
        }

        let quote = ch;
        let start = index + quote.len_utf8();
        let mut escaped = false;

        for (end_index, current) in chars.by_ref() {
            if escaped {
                escaped = false;
                continue;
            }

            if current == '\\' {
                escaped = true;
                continue;
            }

            if current == quote {
                literals.push(statement[start..end_index].to_string());
                break;
            }
        }
    }

    literals.pop()
}

fn extract_rlstats_first_row(html: &str) -> AppResult<String> {
    let marker = "data.addRows([";
    let start = html
        .find(marker)
        .map(|index| index + marker.len())
        .ok_or_else(|| {
            AppError::ParseError("RLStats no expuso la serie de progreso MMR.".into())
        })?;

    let after = &html[start..];
    let row_start = after
        .find('[')
        .ok_or_else(|| AppError::ParseError("RLStats no expuso filas de progreso MMR.".into()))?;

    let mut depth = 0i32;
    let mut result = String::new();
    for ch in after[row_start + 1..].chars() {
        match ch {
            '[' => {
                depth += 1;
                result.push(ch);
            }
            ']' if depth == 0 => return Ok(result),
            ']' => {
                depth -= 1;
                result.push(ch);
            }
            _ => result.push(ch),
        }
    }

    Err(AppError::ParseError(
        "RLStats devolvio una fila MMR incompleta.".into(),
    ))
}

fn split_csv_like(input: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut current = String::new();
    let mut paren_depth = 0i32;

    for ch in input.chars() {
        match ch {
            '(' => {
                paren_depth += 1;
                current.push(ch);
            }
            ')' => {
                paren_depth -= 1;
                current.push(ch);
            }
            ',' if paren_depth == 0 => {
                values.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }

    if !current.is_empty() {
        values.push(current.trim().to_string());
    }

    values
}

fn normalize_playlist_key(label: &str) -> Option<&'static str> {
    playlist_label_to_key(label).or(match label.trim() {
        "Tournament" => Some("tournament"),
        "Quads" => Some("quads"),
        "Heatseeker" => Some("heatseeker"),
        "Hoops" => Some("hoops"),
        "Rumble" => Some("rumble"),
        "Dropshot" => Some("dropshot"),
        "Snow Day" => Some("snowday"),
        _ => None,
    })
}

pub fn playlist_label_to_key(label: &str) -> Option<&'static str> {
    match label.trim() {
        "Duel" => Some("duel"),
        "Doubles" => Some("doubles"),
        "Standard" => Some("standard"),
        "Chaos" => Some("quads"),
        _ => None,
    }
}

fn resolve_local_estimate(
    db_pool: &DbPool,
    local_primary_id: &str,
    playlist: &str,
) -> AppResult<Option<LocalEstimateResolution>> {
    let state = read_local_mmr_state(db_pool, local_primary_id)?;
    let Some(estimate) = state.playlists.get(playlist) else {
        return Ok(
            get_latest_player_mmr_for_playlist(db_pool, local_primary_id, playlist)?.map(|mmr| {
                LocalEstimateResolution {
                    mmr,
                    estimated: false,
                    stale: false,
                    matches_since_refresh: 0,
                    updated_at: String::new(),
                }
            }),
        );
    };

    Ok(Some(LocalEstimateResolution {
        mmr: estimate.mmr,
        estimated: estimate.estimated,
        stale: estimate.estimated && estimate.matches_since_refresh >= LOCAL_ESTIMATE_MAX_MATCHES,
        matches_since_refresh: estimate.matches_since_refresh,
        updated_at: estimate.updated_at.clone(),
    }))
}

/// Persist a manually-entered MMR for the local player on a given playlist.
/// This writes a trusted (non-estimated) local estimate so the live view and
/// rank derivation use the value the user knows to be correct instead of a
/// scraped or estimated one.
pub fn set_local_mmr_manual(
    db_pool: &DbPool,
    local_primary_id: &str,
    playlist: &str,
    mmr: i32,
) -> AppResult<()> {
    let mut state = read_local_mmr_state(db_pool, local_primary_id)?;
    state.playlists.insert(
        playlist.to_string(),
        LocalMmrEstimate {
            mmr,
            matches_since_refresh: 0,
            estimated: false,
            updated_at: Utc::now().to_rfc3339(),
        },
    );
    write_local_mmr_state(db_pool, local_primary_id, &state)
}

fn sync_local_trusted_mmr(
    db_pool: &DbPool,
    local_primary_id: &str,
    playlist: &str,
    mmr: Option<i32>,
) -> AppResult<()> {
    let Some(mmr) = mmr else {
        return Ok(());
    };

    let mut state = read_local_mmr_state(db_pool, local_primary_id)?;
    state.playlists.insert(
        playlist.to_string(),
        LocalMmrEstimate {
            mmr,
            matches_since_refresh: 0,
            estimated: false,
            updated_at: Utc::now().to_rfc3339(),
        },
    );
    write_local_mmr_state(db_pool, local_primary_id, &state)
}

fn read_local_mmr_state(db_pool: &DbPool, local_primary_id: &str) -> AppResult<LocalMmrState> {
    let Some((payload_json, _)) = get_mmr_cache(
        db_pool,
        LOCAL_ESTIMATE_PROVIDER,
        LOCAL_ESTIMATE_PLATFORM,
        local_primary_id,
    )?
    else {
        return Ok(LocalMmrState::default());
    };

    serde_json::from_str(&payload_json)
        .map_err(|e| AppError::ParseError(format!("Estado local MMR invalido: {e}")))
}

fn write_local_mmr_state(
    db_pool: &DbPool,
    local_primary_id: &str,
    state: &LocalMmrState,
) -> AppResult<()> {
    let payload_json = serde_json::to_string(state).map_err(|e| {
        AppError::ParseError(format!("No se pudo serializar el estado local MMR: {e}"))
    })?;
    upsert_mmr_cache(
        db_pool,
        LOCAL_ESTIMATE_PROVIDER,
        LOCAL_ESTIMATE_PLATFORM,
        local_primary_id,
        &payload_json,
        &Utc::now().to_rfc3339(),
    )
}

fn parse_primary_id(primary_id: &str, player_name: &str) -> AppResult<ProviderIdentity> {
    let mut parts = primary_id.split('|');
    let platform_raw = parts
        .next()
        .ok_or_else(|| AppError::ParseError("PrimaryId sin plataforma.".into()))?;
    let identifier = parts
        .next()
        .ok_or_else(|| AppError::ParseError("PrimaryId sin identificador.".into()))?;

    let (tracker_platform, rlstats_platform) = match platform_raw.to_ascii_lowercase().as_str() {
        "steam" => ("steam", "Steam"),
        "epic" => ("epic", "Epic"),
        "xbox" | "xbl" => ("xbl", "Xbox"),
        "ps4" | "psn" | "playstation" => ("psn", "PS4"),
        "switch" => ("switch", "Switch"),
        other => {
            return Err(AppError::ParseError(format!(
                "Plataforma no soportada para MMR: {other}"
            )));
        }
    };

    Ok(ProviderIdentity {
        source_primary_id: primary_id.to_string(),
        player_name: player_name.to_string(),
        tracker_platform: tracker_platform.to_string(),
        rlstats_platform: rlstats_platform.to_string(),
        identifier: identifier.to_string(),
    })
}

fn infer_playlist<'a>(players: impl Iterator<Item = &'a LivePlayer>) -> PlaylistInference {
    let (blue_count, orange_count) = players.fold((0usize, 0usize), |(blue, orange), player| {
        match player.team {
            0 => (blue + 1, orange),
            1 => (blue, orange + 1),
            _ => (blue, orange),
        }
    });

    let total = blue_count + orange_count;
    let team_size = blue_count.max(orange_count);

    if blue_count == 0 || orange_count == 0 || blue_count != orange_count {
        return PlaylistInference {
            primary: None,
            candidates: Vec::new(),
            confidence: "unknown",
        };
    }

    match total {
        2 => PlaylistInference {
            primary: Some("duel".into()),
            candidates: vec!["duel".into()],
            confidence: "high",
        },
        4 if team_size == 2 => PlaylistInference {
            primary: Some("doubles".into()),
            candidates: vec!["doubles".into(), "hoops".into(), "heatseeker".into()],
            confidence: "low",
        },
        6 if team_size == 3 => PlaylistInference {
            primary: Some("standard".into()),
            candidates: vec![
                "standard".into(),
                "rumble".into(),
                "dropshot".into(),
                "snowday".into(),
            ],
            confidence: "low",
        },
        8 if team_size >= 4 => PlaylistInference {
            primary: Some("quads".into()),
            candidates: vec!["quads".into()],
            confidence: "high",
        },
        _ => PlaylistInference {
            primary: None,
            candidates: Vec::new(),
            confidence: "unknown",
        },
    }
}

fn read_cached_profile(
    db_pool: &DbPool,
    provider: &str,
    platform: &str,
    identifier: &str,
    ttl_minutes: i64,
) -> AppResult<Option<CachedMmrProfile>> {
    let cached = get_mmr_cache(db_pool, provider, platform, identifier)?;
    let Some((payload_json, fetched_at)) = cached else {
        return Ok(None);
    };

    if !is_cache_fresh(&fetched_at, ttl_minutes) {
        return Ok(None);
    }

    let cached_profile: CachedMmrProfile = serde_json::from_str(&payload_json)
        .map_err(|e| AppError::ParseError(format!("MMR cache invalido: {e}")))?;
    Ok(Some(cached_profile))
}

fn store_cached_profile(db_pool: &DbPool, cached_profile: &CachedMmrProfile) -> AppResult<()> {
    let payload_json = serde_json::to_string(cached_profile)
        .map_err(|e| AppError::ParseError(format!("No se pudo serializar el cache MMR: {e}")))?;

    upsert_mmr_cache(
        db_pool,
        &cached_profile.provider,
        &cached_profile.platform,
        &cached_profile.identifier,
        &payload_json,
        &cached_profile.fetched_at,
    )?;

    Ok(())
}

fn is_cache_fresh(fetched_at: &str, ttl_minutes: i64) -> bool {
    match parse_datetime(fetched_at) {
        Some(parsed) => parsed > Utc::now() - chrono::Duration::minutes(ttl_minutes),
        None => false,
    }
}

fn parse_datetime(value: &str) -> Option<DateTime<Utc>> {
    if let Ok(parsed) = DateTime::parse_from_rfc3339(value) {
        return Some(parsed.with_timezone(&Utc));
    }

    if let Ok(parsed) = NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S") {
        return Some(DateTime::from_naive_utc_and_offset(parsed, Utc));
    }

    None
}

#[cfg(test)]
mod tests {
    use super::{
        apply_lobby_estimates, extract_last_quoted_literal, extract_rlstats_columns,
        infer_playlist, parse_primary_id, parse_rapidapi_profile, parse_rlstats_profile,
        LivePlayerMmr,
    };
    use crate::core::models::LivePlayer;

    fn mmr_player(primary_id: &str, mmr: Option<i32>) -> LivePlayerMmr {
        LivePlayerMmr {
            primary_id: primary_id.into(),
            player_name: primary_id.into(),
            platform: "epic".into(),
            identifier: primary_id.into(),
            playlist: Some("doubles".into()),
            mmr,
            rank_name: None,
            division: None,
            matches_played: None,
            source: mmr.map(|_| "rapidapi".into()),
            cached: false,
            estimated: false,
            stale: false,
            estimate_matches_since_refresh: None,
            updated_at: None,
            warning: None,
            error: mmr.is_none().then(|| "unavailable".into()),
        }
    }

    #[test]
    fn lobby_estimate_fills_only_unresolved_players() {
        let mut players = vec![
            mmr_player("local", Some(1_250)),
            mmr_player("unknown", None),
            mmr_player("exact", Some(1_310)),
        ];

        apply_lobby_estimates(&mut players, Some("local"), Some("doubles"));

        assert_eq!(players[1].mmr, Some(1_250));
        assert!(players[1].estimated);
        assert_eq!(players[1].source.as_deref(), Some("lobby-estimate"));
        assert!(players[1].error.is_none());
        assert_eq!(players[2].mmr, Some(1_310));
        assert!(!players[2].estimated);
    }

    #[test]
    fn parse_primary_id_maps_platforms() {
        let identity = parse_primary_id("Epic|abc123|0", "Player").expect("identity");
        assert_eq!(identity.tracker_platform, "epic");
        assert_eq!(identity.rlstats_platform, "Epic");
        assert_eq!(identity.identifier, "abc123");
    }

    #[test]
    fn infer_playlist_detects_doubles() {
        let players = [
            LivePlayer {
                team: 0,
                ..Default::default()
            },
            LivePlayer {
                team: 0,
                ..Default::default()
            },
            LivePlayer {
                team: 1,
                ..Default::default()
            },
            LivePlayer {
                team: 1,
                ..Default::default()
            },
        ];

        let inference = infer_playlist(players.iter());
        assert_eq!(inference.primary.as_deref(), Some("doubles"));
        assert_eq!(inference.confidence, "low");
    }

    #[test]
    fn infer_playlist_rejects_incomplete_doubles_lobby() {
        let players = [
            LivePlayer {
                team: 0,
                ..Default::default()
            },
            LivePlayer {
                team: 0,
                ..Default::default()
            },
            LivePlayer {
                team: 1,
                ..Default::default()
            },
        ];

        let inference = infer_playlist(players.iter());
        assert_eq!(inference.primary, None);
        assert_eq!(inference.confidence, "unknown");
    }

    #[test]
    fn infer_playlist_rejects_incomplete_standard_lobby() {
        let players = [
            LivePlayer {
                team: 0,
                ..Default::default()
            },
            LivePlayer {
                team: 0,
                ..Default::default()
            },
            LivePlayer {
                team: 0,
                ..Default::default()
            },
            LivePlayer {
                team: 1,
                ..Default::default()
            },
            LivePlayer {
                team: 1,
                ..Default::default()
            },
        ];

        let inference = infer_playlist(players.iter());
        assert_eq!(inference.primary, None);
        assert_eq!(inference.confidence, "unknown");
    }

    #[test]
    fn parse_rapidapi_profile_extracts_playlist_mmrs() {
        let json = r#"
        {
          "ranks": {
            "10": { "rank": "Diamond I", "division": "Division II", "mmr": 954, "matchesPlayed": 18 },
            "11": { "rank": "Champion I", "division": "Division I", "mmr": 1198, "matchesPlayed": 42 },
            "13": { "rank": "Champion II", "division": "Division III", "mmr": 1322, "matchesPlayed": 88 }
          }
        }
        "#;

        let profile = parse_rapidapi_profile(json, "epic", "abc123").expect("rapidapi profile");
        assert_eq!(profile.playlists["duel"].mmr, Some(954));
        assert_eq!(profile.playlists["doubles"].mmr, Some(1198));
        assert_eq!(profile.playlists["standard"].mmr, Some(1322));
    }

    #[test]
    fn parse_rlstats_chart_extracts_latest_mmrs() {
        let html = r#"
            <script>
                data.addColumn('number', "Duel");
                data.addColumn('number', "Doubles");
                data.addColumn('number', "Standard");
                data.addColumn('number', "Hoops");
                data.addRows([
                    [new Date(1773318770*1000), 942, 1253, , 1056],
                    [new Date(1773249936*1000), 940, 1240, , 1040],
                ]);
            </script>
        "#;

        let columns = extract_rlstats_columns(html).expect("columns");
        assert_eq!(columns, vec!["duel", "doubles", "standard", "hoops"]);

        let profile = parse_rlstats_profile(html, "epic", "abc123").expect("profile");
        assert_eq!(profile.playlists["duel"].mmr, Some(942));
        assert_eq!(profile.playlists["doubles"].mmr, Some(1253));
        assert_eq!(profile.playlists["standard"].mmr, None);
        assert_eq!(profile.playlists["hoops"].mmr, Some(1056));
    }

    #[test]
    fn extract_rlstats_columns_handles_mixed_quotes_and_spacing() {
        let html = r#"
            <script>
                data.addColumn( 'number' , 'Duel' );
                data.addColumn("number", "Doubles");
                data.addColumn('number', "Rumble");
            </script>
        "#;

        let columns = extract_rlstats_columns(html).expect("columns");
        assert_eq!(columns, vec!["duel", "doubles", "rumble"]);
    }

    #[test]
    fn extract_last_quoted_literal_returns_last_string() {
        let statement = "data.addColumn( 'number' , \"Doubles\" )";
        assert_eq!(
            extract_last_quoted_literal(statement).as_deref(),
            Some("Doubles")
        );
    }
}
