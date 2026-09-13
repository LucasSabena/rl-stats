//! Built-in design packs for the overlay engine.
//!
//! A pack is a set of design tokens (colors, typography, shape, motion) that
//! the overlay engine maps to CSS variables. Users can fork any built-in pack
//! into a custom one and tweak every token, so these definitions are only
//! starting points, never hardcoded styles.

use serde_json::{json, Value};

/// Curated typography options. `stack` is what the overlay uses; fonts marked
/// `bundled: true` are shipped with the app (self-hosted woff2), the rest are
/// high-availability system stacks so overlays never flash or fail to load.
pub fn font_options() -> Vec<Value> {
    vec![
        json!({
            "id": "geist",
            "label": "Geist",
            "stack": "'Geist Variable','Geist','Segoe UI',system-ui,sans-serif",
            "bundled": true,
            "vibe": "modern"
        }),
        json!({
            "id": "geist-mono",
            "label": "Geist Mono",
            "stack": "'Geist Mono Variable','Geist Mono','Cascadia Code',Consolas,monospace",
            "bundled": true,
            "vibe": "numeric"
        }),
        json!({
            "id": "condensed",
            "label": "Condensed (Barlow-like)",
            "stack": "'Barlow Condensed','Arial Narrow','Roboto Condensed',sans-serif",
            "bundled": false,
            "vibe": "broadcast"
        }),
        json!({
            "id": "tech",
            "label": "Tech (Chakra-like)",
            "stack": "'Chakra Petch','Rajdhani',Impact,'Arial Black',sans-serif",
            "bundled": false,
            "vibe": "esports"
        }),
        json!({
            "id": "display",
            "label": "Display (Anton-like)",
            "stack": "Anton,Impact,'Arial Black',sans-serif",
            "bundled": false,
            "vibe": "hype"
        }),
        json!({
            "id": "serif",
            "label": "Editorial Serif",
            "stack": "Georgia,'Times New Roman',serif",
            "bundled": false,
            "vibe": "editorial"
        }),
        json!({
            "id": "system",
            "label": "System UI",
            "stack": "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
            "bundled": false,
            "vibe": "neutral"
        }),
    ]
}

/// All built-in packs. Keep this list small but meaningfully different: each
/// pack must read as a different product, not a recolor.
pub fn builtin_packs() -> Vec<Value> {
    vec![
        json!({
            "id": "prime-broadcast",
            "name": "Prime Broadcast",
            "description": "Televisivo, limpio, esquinas cortadas. El look clásico de transmisión.",
            "builtIn": true,
            "tokens": {
                "accent": "#3B82F6",
                "accentAlt": "#F97316",
                "surface": "rgba(7,11,20,0.88)",
                "surfaceSolid": "#0B1220",
                "text": "#F8FAFC",
                "muted": "#94A3B8",
                "border": "rgba(148,163,184,0.28)",
                "radius": 8,
                "corner": "cut",
                "shadow": "0 14px 38px rgba(0,0,0,0.45)",
                "fontDisplay": "condensed",
                "fontBody": "geist",
                "fontNumeric": "geist-mono",
                "motionMs": 220,
                "uppercase": true,
                "texture": "none",
                "logoScale": 1.0
            }
        }),
        json!({
            "id": "neon-circuit",
            "name": "Neon Circuit",
            "description": "Esports neón con glow, bordes técnicos y acentos animados.",
            "builtIn": true,
            "tokens": {
                "accent": "#22D3EE",
                "accentAlt": "#E879F9",
                "surface": "rgba(10,6,24,0.82)",
                "surfaceSolid": "#120A2A",
                "text": "#F5F3FF",
                "muted": "#A5B4FC",
                "border": "rgba(34,211,238,0.45)",
                "radius": 10,
                "corner": "cut",
                "shadow": "0 0 24px rgba(34,211,238,0.28), 0 14px 40px rgba(0,0,0,0.5)",
                "fontDisplay": "tech",
                "fontBody": "tech",
                "fontNumeric": "geist-mono",
                "motionMs": 180,
                "uppercase": true,
                "texture": "scanline",
                "logoScale": 1.05
            }
        }),
        json!({
            "id": "minimal-ink",
            "name": "Minimal Ink",
            "description": "Suizo, tipográfico, sin sombras. Máxima legibilidad con mínimo ruido.",
            "builtIn": true,
            "tokens": {
                "accent": "#111827",
                "accentAlt": "#6B7280",
                "surface": "rgba(255,255,255,0.94)",
                "surfaceSolid": "#FFFFFF",
                "text": "#0B0F19",
                "muted": "#6B7280",
                "border": "rgba(17,24,39,0.18)",
                "radius": 2,
                "corner": "sharp",
                "shadow": "none",
                "fontDisplay": "geist",
                "fontBody": "geist",
                "fontNumeric": "geist-mono",
                "motionMs": 160,
                "uppercase": false,
                "texture": "none",
                "logoScale": 0.95
            }
        }),
        json!({
            "id": "grid-retro",
            "name": "Grid Retro",
            "description": "Arcade de los 80: verde fósforo, bordes duros y números de puntaje.",
            "builtIn": true,
            "tokens": {
                "accent": "#4ADE80",
                "accentAlt": "#FACC15",
                "surface": "rgba(3,10,6,0.9)",
                "surfaceSolid": "#04140A",
                "text": "#DCFCE7",
                "muted": "#4ADE80",
                "border": "rgba(74,222,128,0.5)",
                "radius": 0,
                "corner": "sharp",
                "shadow": "0 0 0 2px rgba(74,222,128,0.35), 0 12px 30px rgba(0,0,0,0.5)",
                "fontDisplay": "tech",
                "fontBody": "geist-mono",
                "fontNumeric": "geist-mono",
                "motionMs": 120,
                "uppercase": true,
                "texture": "scanline",
                "logoScale": 1.0
            }
        }),
        json!({
            "id": "glass-lux",
            "name": "Glass Lux",
            "description": "Glass bien ejecutado: blur profundo, radios grandes y acentos suaves.",
            "builtIn": true,
            "tokens": {
                "accent": "#8B5CF6",
                "accentAlt": "#EC4899",
                "surface": "rgba(24,24,38,0.55)",
                "surfaceSolid": "#181826",
                "text": "#FAFAFF",
                "muted": "#C4B5FD",
                "border": "rgba(255,255,255,0.16)",
                "radius": 20,
                "corner": "round",
                "shadow": "0 18px 50px rgba(0,0,0,0.4)",
                "fontDisplay": "geist",
                "fontBody": "geist",
                "fontNumeric": "geist-mono",
                "motionMs": 260,
                "uppercase": false,
                "texture": "blur",
                "logoScale": 1.0
            }
        }),
        json!({
            "id": "league-ops",
            "name": "League Ops",
            "description": "Liga y torneo: franjas de sponsor, series destacadas y contraste fuerte.",
            "builtIn": true,
            "tokens": {
                "accent": "#FACC15",
                "accentAlt": "#3B82F6",
                "surface": "rgba(10,10,14,0.92)",
                "surfaceSolid": "#0A0A0E",
                "text": "#FAFAFA",
                "muted": "#A1A1AA",
                "border": "rgba(250,204,21,0.35)",
                "radius": 4,
                "corner": "cut",
                "shadow": "0 14px 34px rgba(0,0,0,0.5)",
                "fontDisplay": "display",
                "fontBody": "geist",
                "fontNumeric": "condensed",
                "motionMs": 200,
                "uppercase": true,
                "texture": "stripes",
                "logoScale": 1.1
            }
        }),
        json!({
            "id": "caster-board",
            "name": "Caster Board",
            "description": "Editorial cálido para podcasts y co-streams: serif, tonos crema.",
            "builtIn": true,
            "tokens": {
                "accent": "#B45309",
                "accentAlt": "#0F766E",
                "surface": "rgba(28,25,23,0.9)",
                "surfaceSolid": "#1C1917",
                "text": "#FEFCE8",
                "muted": "#D6D3D1",
                "border": "rgba(254,252,232,0.2)",
                "radius": 12,
                "corner": "round",
                "shadow": "0 12px 30px rgba(0,0,0,0.45)",
                "fontDisplay": "serif",
                "fontBody": "geist",
                "fontNumeric": "geist-mono",
                "motionMs": 240,
                "uppercase": false,
                "texture": "none",
                "logoScale": 1.0
            }
        }),
    ]
}

/// Default scene layout used when a scene has no stored layout. Modules are
/// percentages of the overlay stage so they scale to any browser-source size.
pub fn default_layout_for_state(state: &str) -> Value {
    let modules = match state {
        "waiting" => vec![
            ("brand", json!({ "x": 86, "y": 5, "w": 10, "h": 10 })),
            ("upnext", json!({ "x": 12, "y": 66, "w": 30, "h": 16 })),
            ("countdown", json!({ "x": 34, "y": 30, "w": 32, "h": 22 })),
        ],
        "brb" => vec![
            ("brand", json!({ "x": 86, "y": 5, "w": 10, "h": 10 })),
            ("countdown", json!({ "x": 34, "y": 34, "w": 32, "h": 20 })),
            ("socials", json!({ "x": 30, "y": 60, "w": 40, "h": 8 })),
        ],
        "replay" => vec![
            ("scorebug", json!({ "x": 24, "y": 4, "w": 52, "h": 10 })),
            ("replaybadge", json!({ "x": 44, "y": 15, "w": 12, "h": 6 })),
            (
                "roster",
                json!({ "x": 2, "y": 26, "w": 24, "h": 40, "team": "blue" }),
            ),
            (
                "roster",
                json!({ "x": 74, "y": 26, "w": 24, "h": 40, "team": "orange" }),
            ),
        ],
        "post" => vec![
            ("series", json!({ "x": 30, "y": 12, "w": 40, "h": 16 })),
            ("mvp", json!({ "x": 30, "y": 36, "w": 40, "h": 24 })),
            ("socials", json!({ "x": 32, "y": 66, "w": 36, "h": 8 })),
        ],
        // "live" and unknown states
        _ => vec![
            ("scorebug", json!({ "x": 27, "y": 3, "w": 46, "h": 9 })),
            ("series", json!({ "x": 40, "y": 12.5, "w": 20, "h": 4 })),
            (
                "roster",
                json!({ "x": 1.5, "y": 20, "w": 22, "h": 36, "team": "blue" }),
            ),
            (
                "roster",
                json!({ "x": 76.5, "y": 20, "w": 22, "h": 36, "team": "orange" }),
            ),
            ("events", json!({ "x": 25, "y": 66, "w": 26, "h": 26 })),
            ("chat", json!({ "x": 52, "y": 66, "w": 23, "h": 26 })),
            ("focus", json!({ "x": 1.5, "y": 60, "w": 22, "h": 14 })),
            ("brand", json!({ "x": 88, "y": 92, "w": 10, "h": 6 })),
        ],
    };

    let mut map = serde_json::Map::new();
    for (module, placement) in modules {
        let key = format!("{}-{}", module, uuid::Uuid::new_v4().simple());
        let mut value = placement;
        value["module"] = json!(module);
        value["enabled"] = json!(true);
        map.insert(key, value);
    }
    Value::Object(map)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn built_in_packs_have_unique_ids_and_required_tokens() {
        let packs = builtin_packs();
        assert!(packs.len() >= 6);
        let mut ids = std::collections::HashSet::new();
        for pack in &packs {
            let id = pack["id"].as_str().unwrap();
            assert!(ids.insert(id.to_string()), "duplicate pack id {id}");
            for token in ["accent", "surface", "text", "fontDisplay", "radius"] {
                assert!(
                    !pack["tokens"][token].is_null(),
                    "pack {id} missing token {token}"
                );
            }
        }
    }

    #[test]
    fn font_options_cover_every_pack_font_reference() {
        let fonts: std::collections::HashSet<String> = font_options()
            .iter()
            .filter_map(|font| font["id"].as_str().map(str::to_string))
            .collect();
        for pack in builtin_packs() {
            let tokens = &pack["tokens"];
            for slot in ["fontDisplay", "fontBody", "fontNumeric"] {
                let id = tokens[slot].as_str().unwrap();
                assert!(fonts.contains(id), "unknown font id {id} in {slot}");
            }
        }
    }

    #[test]
    fn every_state_has_a_default_layout() {
        for state in ["waiting", "live", "replay", "post", "brb"] {
            let layout = default_layout_for_state(state);
            assert!(!layout.as_object().unwrap().is_empty());
        }
    }
}
