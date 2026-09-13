//! SQLite persistence for the Broadcast Studio entities.
//!
//! Everything the Control Room edits lives here: uploaded assets (logos,
//! fonts, images), design packs, scenes, teams, series and the role-scoped
//! access tokens. The overlay engine reads snapshots built from these tables.

use crate::core::storage::DbPool;
use crate::error::{AppError, AppResult};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tracing::info;

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn new_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastToken {
    pub id: String,
    pub token: String,
    pub role: String,
    pub label: String,
    pub created_at: String,
}

pub const ROLES: &[&str] = &["admin", "referee", "viewer"];

fn token_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BroadcastToken> {
    Ok(BroadcastToken {
        id: row.get(0)?,
        token: row.get(1)?,
        role: row.get(2)?,
        label: row.get(3)?,
        created_at: row.get(4)?,
    })
}

pub fn list_tokens(pool: &DbPool) -> AppResult<Vec<BroadcastToken>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let mut statement = conn
        .prepare(
            "SELECT id, token, role, label, created_at FROM broadcast_tokens ORDER BY created_at",
        )
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let rows = statement
        .query_map([], token_from_row)
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::StorageError(error.to_string()))
}

/// Ensures at least one admin token exists and returns it. Called on server
/// start so OBS URLs stay valid across restarts.
pub fn ensure_admin_token(pool: &DbPool) -> AppResult<String> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;

    if let Some(token) = conn
        .query_row(
            "SELECT token FROM broadcast_tokens WHERE role = 'admin' ORDER BY created_at LIMIT 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| AppError::StorageError(error.to_string()))?
    {
        return Ok(token);
    }

    let token = uuid::Uuid::new_v4().simple().to_string();
    conn.execute(
        "INSERT INTO broadcast_tokens (id, token, role, label, created_at) VALUES (?1, ?2, 'admin', 'Principal', ?3)",
        params![new_id(), token, now()],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    info!("Generated persistent admin broadcast token");
    Ok(token)
}

pub fn create_token(pool: &DbPool, role: &str, label: &str) -> AppResult<BroadcastToken> {
    if !ROLES.contains(&role) {
        return Err(AppError::ConfigError(format!("Unknown role: {role}")));
    }
    let token = BroadcastToken {
        id: new_id(),
        token: uuid::Uuid::new_v4().simple().to_string(),
        role: role.to_string(),
        label: label.to_string(),
        created_at: now(),
    };
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute(
        "INSERT INTO broadcast_tokens (id, token, role, label, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![token.id, token.token, token.role, token.label, token.created_at],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(token)
}

pub fn revoke_token(pool: &DbPool, id: &str) -> AppResult<()> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute("DELETE FROM broadcast_tokens WHERE id = ?1", params![id])
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastAsset {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub file_name: String,
    pub mime: String,
    pub size_bytes: i64,
    pub created_at: String,
    /// Server URL the overlay engine can load (built for the frontend).
    #[serde(default)]
    pub url: String,
}

fn asset_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BroadcastAsset> {
    let file_name: String = row.get(3)?;
    Ok(BroadcastAsset {
        id: row.get(0)?,
        kind: row.get(1)?,
        name: row.get(2)?,
        url: format!("/assets/{}", file_name),
        file_name,
        mime: row.get(4)?,
        size_bytes: row.get(5)?,
        created_at: row.get(6)?,
    })
}

pub fn list_assets(pool: &DbPool, kind: Option<&str>) -> AppResult<Vec<BroadcastAsset>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let (sql, filter) = match kind {
        Some(kind) => (
            "SELECT id, kind, name, file_name, mime, size_bytes, created_at FROM broadcast_assets WHERE kind = ?1 ORDER BY created_at DESC",
            Some(kind.to_string()),
        ),
        None => (
            "SELECT id, kind, name, file_name, mime, size_bytes, created_at FROM broadcast_assets ORDER BY created_at DESC",
            None,
        ),
    };
    let mut statement = conn
        .prepare(sql)
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let rows = match filter {
        Some(filter) => statement
            .query_map(params![filter], asset_from_row)
            .map_err(|error| AppError::StorageError(error.to_string()))?,
        None => statement
            .query_map([], asset_from_row)
            .map_err(|error| AppError::StorageError(error.to_string()))?,
    };
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::StorageError(error.to_string()))
}

pub fn get_asset(pool: &DbPool, id: &str) -> AppResult<Option<BroadcastAsset>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.query_row(
        "SELECT id, kind, name, file_name, mime, size_bytes, created_at FROM broadcast_assets WHERE id = ?1",
        params![id],
        asset_from_row,
    )
    .optional()
    .map_err(|error| AppError::StorageError(error.to_string()))
}

pub fn create_asset(
    pool: &DbPool,
    kind: &str,
    name: &str,
    file_name: &str,
    mime: &str,
    size_bytes: i64,
) -> AppResult<BroadcastAsset> {
    let asset = BroadcastAsset {
        id: new_id(),
        kind: kind.to_string(),
        name: name.to_string(),
        file_name: file_name.to_string(),
        mime: mime.to_string(),
        size_bytes,
        created_at: now(),
        url: format!("/assets/{}", file_name),
    };
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute(
        "INSERT INTO broadcast_assets (id, kind, name, file_name, mime, size_bytes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![asset.id, asset.kind, asset.name, asset.file_name, asset.mime, asset.size_bytes, asset.created_at],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(asset)
}

pub fn delete_asset(pool: &DbPool, id: &str) -> AppResult<()> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute("DELETE FROM broadcast_assets WHERE id = ?1", params![id])
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastPack {
    pub id: String,
    pub name: String,
    pub base_id: Option<String>,
    pub tokens: Value,
    pub layouts: Value,
    pub built_in: bool,
    pub created_at: String,
    pub updated_at: String,
}

fn pack_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BroadcastPack> {
    let tokens: String = row.get(3)?;
    let layouts: String = row.get(4)?;
    Ok(BroadcastPack {
        id: row.get(0)?,
        name: row.get(1)?,
        base_id: row.get(2)?,
        tokens: serde_json::from_str(&tokens).unwrap_or_else(|_| json!({})),
        layouts: serde_json::from_str(&layouts).unwrap_or_else(|_| json!({})),
        built_in: false,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

pub fn list_user_packs(pool: &DbPool) -> AppResult<Vec<BroadcastPack>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let mut statement = conn
        .prepare("SELECT id, name, base_id, tokens_json, layouts_json, created_at, updated_at FROM broadcast_packs ORDER BY updated_at DESC")
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let rows = statement
        .query_map([], pack_from_row)
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::StorageError(error.to_string()))
}

pub fn get_user_pack(pool: &DbPool, id: &str) -> AppResult<Option<BroadcastPack>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.query_row(
        "SELECT id, name, base_id, tokens_json, layouts_json, created_at, updated_at FROM broadcast_packs WHERE id = ?1",
        params![id],
        pack_from_row,
    )
    .optional()
    .map_err(|error| AppError::StorageError(error.to_string()))
}

/// Creates or updates a user pack. An empty `id` creates a new pack.
pub fn upsert_user_pack(
    pool: &DbPool,
    id: Option<&str>,
    name: &str,
    base_id: Option<&str>,
    tokens: &Value,
    layouts: &Value,
) -> AppResult<BroadcastPack> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let timestamp = now();

    if let Some(id) = id.filter(|value| !value.is_empty()) {
        let existing = get_user_pack(pool, id)?;
        let Some(existing) = existing else {
            return Err(AppError::StorageError(format!("Pack not found: {id}")));
        };
        conn.execute(
            "UPDATE broadcast_packs SET name = ?2, base_id = ?3, tokens_json = ?4, layouts_json = ?5, updated_at = ?6 WHERE id = ?1",
            params![
                id,
                name,
                base_id,
                tokens.to_string(),
                layouts.to_string(),
                timestamp
            ],
        )
        .map_err(|error| AppError::StorageError(error.to_string()))?;
        return Ok(BroadcastPack {
            id: id.to_string(),
            name: name.to_string(),
            base_id: base_id.map(str::to_string),
            tokens: tokens.clone(),
            layouts: layouts.clone(),
            built_in: false,
            created_at: existing.created_at,
            updated_at: timestamp,
        });
    }

    let pack = BroadcastPack {
        id: new_id(),
        name: name.to_string(),
        base_id: base_id.map(str::to_string),
        tokens: tokens.clone(),
        layouts: layouts.clone(),
        built_in: false,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    conn.execute(
        "INSERT INTO broadcast_packs (id, name, base_id, tokens_json, layouts_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            pack.id,
            pack.name,
            pack.base_id,
            pack.tokens.to_string(),
            pack.layouts.to_string(),
            pack.created_at,
            pack.updated_at
        ],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(pack)
}

pub fn delete_user_pack(pool: &DbPool, id: &str) -> AppResult<()> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute("DELETE FROM broadcast_packs WHERE id = ?1", params![id])
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastScene {
    pub id: String,
    pub name: String,
    pub pack_id: String,
    pub state: String,
    pub layout: Value,
    pub updated_at: String,
}

fn scene_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BroadcastScene> {
    let layout: String = row.get(4)?;
    Ok(BroadcastScene {
        id: row.get(0)?,
        name: row.get(1)?,
        pack_id: row.get(2)?,
        state: row.get(3)?,
        layout: serde_json::from_str(&layout).unwrap_or_else(|_| json!({})),
        updated_at: row.get(5)?,
    })
}

pub fn list_scenes(pool: &DbPool) -> AppResult<Vec<BroadcastScene>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let mut statement = conn
        .prepare("SELECT id, name, pack_id, state, layout_json, updated_at FROM broadcast_scenes ORDER BY state, name")
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let rows = statement
        .query_map([], scene_from_row)
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::StorageError(error.to_string()))
}

pub fn get_scene(pool: &DbPool, id: &str) -> AppResult<Option<BroadcastScene>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.query_row(
        "SELECT id, name, pack_id, state, layout_json, updated_at FROM broadcast_scenes WHERE id = ?1",
        params![id],
        scene_from_row,
    )
    .optional()
    .map_err(|error| AppError::StorageError(error.to_string()))
}

/// Scene used when a broadcast state is activated. Falls back to the first
/// scene in that state; `None` means the engine should build the default.
pub fn get_scene_for_state(pool: &DbPool, state: &str) -> AppResult<Option<BroadcastScene>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.query_row(
        "SELECT id, name, pack_id, state, layout_json, updated_at FROM broadcast_scenes WHERE state = ?1 ORDER BY updated_at DESC LIMIT 1",
        params![state],
        scene_from_row,
    )
    .optional()
    .map_err(|error| AppError::StorageError(error.to_string()))
}

pub fn upsert_scene(
    pool: &DbPool,
    id: Option<&str>,
    name: &str,
    pack_id: &str,
    state: &str,
    layout: &Value,
) -> AppResult<BroadcastScene> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let timestamp = now();
    if let Some(id) = id.filter(|value| !value.is_empty()) {
        let existing = get_scene(pool, id)?;
        let Some(_existing) = existing else {
            return Err(AppError::StorageError(format!("Scene not found: {id}")));
        };
        conn.execute(
            "UPDATE broadcast_scenes SET name = ?2, pack_id = ?3, state = ?4, layout_json = ?5, updated_at = ?6 WHERE id = ?1",
            params![id, name, pack_id, state, layout.to_string(), timestamp],
        )
        .map_err(|error| AppError::StorageError(error.to_string()))?;
        return Ok(BroadcastScene {
            id: id.to_string(),
            name: name.to_string(),
            pack_id: pack_id.to_string(),
            state: state.to_string(),
            layout: layout.clone(),
            updated_at: timestamp,
        });
    }

    let scene = BroadcastScene {
        id: new_id(),
        name: name.to_string(),
        pack_id: pack_id.to_string(),
        state: state.to_string(),
        layout: layout.clone(),
        updated_at: timestamp,
    };
    conn.execute(
        "INSERT INTO broadcast_scenes (id, name, pack_id, state, layout_json, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![scene.id, scene.name, scene.pack_id, scene.state, scene.layout.to_string(), scene.updated_at],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(scene)
}

pub fn delete_scene(pool: &DbPool, id: &str) -> AppResult<()> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute("DELETE FROM broadcast_scenes WHERE id = ?1", params![id])
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Team {
    pub id: String,
    pub name: String,
    pub tag: String,
    pub color_primary: String,
    pub color_secondary: String,
    pub logo_asset_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn team_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Team> {
    Ok(Team {
        id: row.get(0)?,
        name: row.get(1)?,
        tag: row.get(2)?,
        color_primary: row.get(3)?,
        color_secondary: row.get(4)?,
        logo_asset_id: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

pub fn list_teams(pool: &DbPool) -> AppResult<Vec<Team>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let mut statement = conn
        .prepare("SELECT id, name, tag, color_primary, color_secondary, logo_asset_id, created_at, updated_at FROM teams ORDER BY name")
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let rows = statement
        .query_map([], team_from_row)
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::StorageError(error.to_string()))
}

pub fn get_team(pool: &DbPool, id: &str) -> AppResult<Option<Team>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.query_row(
        "SELECT id, name, tag, color_primary, color_secondary, logo_asset_id, created_at, updated_at FROM teams WHERE id = ?1",
        params![id],
        team_from_row,
    )
    .optional()
    .map_err(|error| AppError::StorageError(error.to_string()))
}

pub fn upsert_team(
    pool: &DbPool,
    id: Option<&str>,
    name: &str,
    tag: &str,
    color_primary: &str,
    color_secondary: &str,
    logo_asset_id: Option<&str>,
) -> AppResult<Team> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let timestamp = now();
    let logo = logo_asset_id.filter(|value| !value.is_empty());

    if let Some(id) = id.filter(|value| !value.is_empty()) {
        let existing = get_team(pool, id)?;
        let Some(existing) = existing else {
            return Err(AppError::StorageError(format!("Team not found: {id}")));
        };
        conn.execute(
            "UPDATE teams SET name = ?2, tag = ?3, color_primary = ?4, color_secondary = ?5, logo_asset_id = ?6, updated_at = ?7 WHERE id = ?1",
            params![id, name, tag, color_primary, color_secondary, logo, timestamp],
        )
        .map_err(|error| AppError::StorageError(error.to_string()))?;
        return Ok(Team {
            id: id.to_string(),
            name: name.to_string(),
            tag: tag.to_string(),
            color_primary: color_primary.to_string(),
            color_secondary: color_secondary.to_string(),
            logo_asset_id: logo.map(str::to_string),
            created_at: existing.created_at,
            updated_at: timestamp,
        });
    }

    let team = Team {
        id: new_id(),
        name: name.to_string(),
        tag: tag.to_string(),
        color_primary: color_primary.to_string(),
        color_secondary: color_secondary.to_string(),
        logo_asset_id: logo.map(str::to_string),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    conn.execute(
        "INSERT INTO teams (id, name, tag, color_primary, color_secondary, logo_asset_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![team.id, team.name, team.tag, team.color_primary, team.color_secondary, team.logo_asset_id, team.created_at, team.updated_at],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(team)
}

pub fn delete_team(pool: &DbPool, id: &str) -> AppResult<()> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute("DELETE FROM teams WHERE id = ?1", params![id])
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(())
}

/// Serializes a team for the overlay, resolving its logo to a server URL.
pub fn team_snapshot(pool: &DbPool, id: Option<&str>) -> AppResult<Option<Value>> {
    let Some(id) = id.filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let Some(team) = get_team(pool, id)? else {
        return Ok(None);
    };
    let logo_url = match team
        .logo_asset_id
        .as_deref()
        .and_then(|id| get_asset(pool, id).ok().flatten())
    {
        Some(asset) => asset.url,
        None => String::new(),
    };
    Ok(Some(json!({
        "id": team.id,
        "name": team.name,
        "tag": team.tag,
        "colorPrimary": team.color_primary,
        "colorSecondary": team.color_secondary,
        "logoUrl": logo_url,
    })))
}

/// Every team with its logo resolved to a server URL, ready for the engine.
pub fn list_teams_with_logos(pool: &DbPool) -> AppResult<Vec<Value>> {
    let teams = list_teams(pool)?;
    let assets: std::collections::HashMap<String, String> = list_assets(pool, None)
        .unwrap_or_default()
        .into_iter()
        .map(|asset| (asset.id, asset.url))
        .collect();

    Ok(teams
        .into_iter()
        .map(|team| {
            let logo_url = team
                .logo_asset_id
                .as_deref()
                .and_then(|id| assets.get(id))
                .cloned()
                .unwrap_or_default();
            json!({
                "id": team.id,
                "name": team.name,
                "tag": team.tag,
                "colorPrimary": team.color_primary,
                "colorSecondary": team.color_secondary,
                "logoUrl": logo_url,
                "updatedAt": team.updated_at,
            })
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Series {
    pub id: String,
    pub name: String,
    pub format: i64,
    pub team_a_id: Option<String>,
    pub team_b_id: Option<String>,
    pub score_a: i64,
    pub score_b: i64,
    pub status: String,
    pub winner_team_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn series_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Series> {
    Ok(Series {
        id: row.get(0)?,
        name: row.get(1)?,
        format: row.get(2)?,
        team_a_id: row.get(3)?,
        team_b_id: row.get(4)?,
        score_a: row.get(5)?,
        score_b: row.get(6)?,
        status: row.get(7)?,
        winner_team_id: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

const SERIES_COLUMNS: &str = "id, name, format, team_a_id, team_b_id, score_a, score_b, status, winner_team_id, created_at, updated_at";

pub fn get_series(pool: &DbPool, id: &str) -> AppResult<Option<Series>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.query_row(
        &format!("SELECT {SERIES_COLUMNS} FROM series WHERE id = ?1"),
        params![id],
        series_from_row,
    )
    .optional()
    .map_err(|error| AppError::StorageError(error.to_string()))
}

/// Most recent live series, or the most recent finished one.
pub fn get_active_series(pool: &DbPool) -> AppResult<Option<Series>> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.query_row(
        &format!(
            "SELECT {SERIES_COLUMNS} FROM series ORDER BY CASE status WHEN 'live' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1"
        ),
        [],
        series_from_row,
    )
    .optional()
    .map_err(|error| AppError::StorageError(error.to_string()))
}

pub fn create_series(
    pool: &DbPool,
    name: &str,
    format: i64,
    team_a_id: Option<&str>,
    team_b_id: Option<&str>,
) -> AppResult<Series> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let timestamp = now();
    let series = Series {
        id: new_id(),
        name: name.to_string(),
        format: format.clamp(1, 99),
        team_a_id: team_a_id
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        team_b_id: team_b_id
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        score_a: 0,
        score_b: 0,
        status: "live".to_string(),
        winner_team_id: None,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    conn.execute(
        "INSERT INTO series (id, name, format, team_a_id, team_b_id, score_a, score_b, status, winner_team_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 'live', NULL, ?6, ?7)",
        params![series.id, series.name, series.format, series.team_a_id, series.team_b_id, series.created_at, series.updated_at],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(series)
}

fn wins_needed(format: i64) -> i64 {
    (format.max(1) / 2) + 1
}

/// Updates the series score. When a team reaches the wins required by the
/// format the series is marked as finished.
pub fn update_series_score(
    pool: &DbPool,
    id: &str,
    score_a: i64,
    score_b: i64,
) -> AppResult<Series> {
    let Some(mut series) = get_series(pool, id)? else {
        return Err(AppError::StorageError(format!("Series not found: {id}")));
    };
    series.score_a = score_a.max(0);
    series.score_b = score_b.max(0);
    series.updated_at = now();

    let needed = wins_needed(series.format);
    if series.score_a >= needed || series.score_b >= needed {
        series.status = "finished".to_string();
        series.winner_team_id = if series.score_a > series.score_b {
            series.team_a_id.clone()
        } else {
            series.team_b_id.clone()
        };
    } else {
        series.status = "live".to_string();
        series.winner_team_id = None;
    }

    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute(
        "UPDATE series SET score_a = ?2, score_b = ?3, status = ?4, winner_team_id = ?5, updated_at = ?6 WHERE id = ?1",
        params![
            series.id,
            series.score_a,
            series.score_b,
            series.status,
            series.winner_team_id,
            series.updated_at
        ],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(series)
}

pub fn delete_series(pool: &DbPool, id: &str) -> AppResult<()> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute("DELETE FROM series_games WHERE series_id = ?1", params![id])
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute("DELETE FROM series WHERE id = ?1", params![id])
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(())
}

/// Full series snapshot for the overlay: teams resolved, game log included.
pub fn series_snapshot(pool: &DbPool, id: Option<&str>) -> AppResult<Value> {
    let series = match id {
        Some(id) => get_series(pool, id)?,
        None => get_active_series(pool)?,
    };
    let Some(series) = series else {
        return Ok(json!({ "available": false }));
    };

    let team_a = team_snapshot(pool, series.team_a_id.as_deref())?;
    let team_b = team_snapshot(pool, series.team_b_id.as_deref())?;

    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let mut statement = conn
        .prepare(
            "SELECT index_no, winner_team_id, score_a, score_b, arena, duration_seconds FROM series_games WHERE series_id = ?1 ORDER BY index_no",
        )
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let games = statement
        .query_map(params![series.id], |row| {
            Ok(json!({
                "index": row.get::<_, i64>(0)?,
                "winnerTeamId": row.get::<_, Option<String>>(1)?,
                "scoreA": row.get::<_, i64>(2)?,
                "scoreB": row.get::<_, i64>(3)?,
                "arena": row.get::<_, Option<String>>(4)?,
                "durationSeconds": row.get::<_, i64>(5)?,
            }))
        })
        .map_err(|error| AppError::StorageError(error.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::StorageError(error.to_string()))?;

    Ok(json!({
        "available": true,
        "id": series.id,
        "name": series.name,
        "format": series.format,
        "winsNeeded": wins_needed(series.format),
        "scoreA": series.score_a,
        "scoreB": series.score_b,
        "status": series.status,
        "winnerTeamId": series.winner_team_id,
        "teamA": team_a,
        "teamB": team_b,
        "games": games,
    }))
}

/// Appends a game result to the series log.
#[allow(clippy::too_many_arguments)]
pub fn record_series_game(
    pool: &DbPool,
    series_id: &str,
    winner_team_id: Option<&str>,
    score_a: i64,
    score_b: i64,
    arena: Option<&str>,
    duration_seconds: i64,
    match_id: Option<i64>,
) -> AppResult<()> {
    let conn = pool
        .get()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let index: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(index_no), 0) + 1 FROM series_games WHERE series_id = ?1",
            params![series_id],
            |row| row.get(0),
        )
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    conn.execute(
        "INSERT INTO series_games (id, series_id, index_no, winner_team_id, score_a, score_b, arena, duration_seconds, match_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            new_id(),
            series_id,
            index,
            winner_team_id,
            score_a,
            score_b,
            arena,
            duration_seconds,
            match_id,
            now()
        ],
    )
    .map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_pool(name: &str) -> DbPool {
        let dir = std::env::temp_dir().join(format!(
            "rl-stats-broadcast-{}-{}-{}",
            name,
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        crate::core::storage::init_storage(dir.join("test.db")).expect("init storage")
    }

    #[test]
    fn admin_token_is_created_once_and_stays_stable() {
        let pool = temp_pool("token");
        let first = ensure_admin_token(&pool).unwrap();
        let second = ensure_admin_token(&pool).unwrap();
        assert_eq!(first, second);
        assert!(!first.is_empty());

        let tokens = list_tokens(&pool).unwrap();
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].role, "admin");
    }

    #[test]
    fn role_tokens_can_be_created_and_revoked() {
        let pool = temp_pool("roles");
        let token = create_token(&pool, "referee", "Árbitro 1").unwrap();
        assert!(list_tokens(&pool).unwrap().iter().any(|t| t.id == token.id));
        revoke_token(&pool, &token.id).unwrap();
        assert!(list_tokens(&pool).unwrap().is_empty());
        assert!(create_token(&pool, "wizard", "no").is_err());
    }

    #[test]
    fn pack_upsert_round_trips_and_updates() {
        let pool = temp_pool("pack");
        let created = upsert_user_pack(
            &pool,
            None,
            "Mi pack",
            Some("neon-circuit"),
            &json!({ "accent": "#ff0000" }),
            &json!({}),
        )
        .unwrap();
        let updated = upsert_user_pack(
            &pool,
            Some(&created.id),
            "Mi pack v2",
            Some("neon-circuit"),
            &json!({ "accent": "#00ff00" }),
            &json!({ "mod-1": { "module": "scorebug" } }),
        )
        .unwrap();
        assert_eq!(updated.name, "Mi pack v2");
        assert_eq!(updated.tokens["accent"], "#00ff00");
        let listed = list_user_packs(&pool).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].created_at, created.created_at);
    }

    #[test]
    fn series_score_auto_finishes_at_wins_needed() {
        let pool = temp_pool("series");
        let a = upsert_team(&pool, None, "Alpha", "ALP", "#111111", "#222222", None).unwrap();
        let b = upsert_team(&pool, None, "Bravo", "BRV", "#333333", "#444444", None).unwrap();
        let series = create_series(&pool, "Final", 3, Some(&a.id), Some(&b.id)).unwrap();

        let series = update_series_score(&pool, &series.id, 1, 0).unwrap();
        assert_eq!(series.status, "live");
        let series = update_series_score(&pool, &series.id, 2, 0).unwrap();
        assert_eq!(series.status, "finished");
        assert_eq!(series.winner_team_id.as_deref(), Some(a.id.as_str()));

        record_series_game(
            &pool,
            &series.id,
            Some(&a.id),
            3,
            1,
            Some("DFH Stadium"),
            300,
            None,
        )
        .unwrap();
        record_series_game(
            &pool,
            &series.id,
            Some(&a.id),
            2,
            0,
            Some("Mannfield"),
            280,
            None,
        )
        .unwrap();
        let snapshot = series_snapshot(&pool, Some(&series.id)).unwrap();
        assert_eq!(snapshot["games"].as_array().unwrap().len(), 2);
        assert_eq!(snapshot["games"][0]["index"], 1);
        assert_eq!(snapshot["teamA"]["tag"], "ALP");
    }

    #[test]
    fn scene_for_state_returns_latest_scene() {
        let pool = temp_pool("scene");
        upsert_scene(
            &pool,
            None,
            "Espera",
            "prime-broadcast",
            "waiting",
            &json!({}),
        )
        .unwrap();
        let live = upsert_scene(
            &pool,
            None,
            "En vivo",
            "prime-broadcast",
            "live",
            &json!({}),
        )
        .unwrap();
        let found = get_scene_for_state(&pool, "live").unwrap().unwrap();
        assert_eq!(found.id, live.id);
        assert!(get_scene_for_state(&pool, "post").unwrap().is_none());
    }
}
