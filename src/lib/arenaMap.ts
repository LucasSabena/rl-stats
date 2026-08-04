// Arena name mapping: internal API name -> official display name
// Source: RLStats.net gameinfo/maps page + Rocket League Wiki
// https://rlstats.net/gameinfo/maps

import { ARENA_IMAGE_KEYS } from "./arenaImages";

export interface ArenaInfo {
  name: string;
  image?: string; // e.g. "/arenas/underwater_p.jpg" if available
  /**
   * Borrow another arena's image. Used for variants that are visually the
   * same venue (e.g. the Quads layout of Mannfield at night), so they show a
   * real photo instead of falling through to the generated tile.
   */
  imageFrom?: string;
}

export const ARENA_MAP: Record<string, ArenaInfo> = {
  // --- Standard Maps ---

  // Aquadome
  underwater_p: { name: "Aquadome" },
  underwater_grs_p: { name: "Aquadome (Salty Shallows)" },

  // Beckwith Park
  park_p: { name: "Beckwith Park" },
  park_night_p: { name: "Beckwith Park (Midnight)" },
  park_snowy_p: { name: "Beckwith Park (Snowy)" },
  park_rainy_p: { name: "Beckwith Park (Stormy)" },
  park_bman_p: { name: "Beckwith Park (Batman)" },

  // Boostfield Mall
  mall_day_p: { name: "Boostfield Mall" },

  // Champions Field
  cs_p: { name: "Champions Field" },
  cs_day_p: { name: "Champions Field (Day)" },
  swoosh_p: { name: "Champions Field (Nike FC)" },
  bb_p: { name: "Champions Field (NFL)" },

  // Deadeye Canyon
  outlaw_p: { name: "Deadeye Canyon" },
  outlaw_oasis_p: { name: "Deadeye Canyon (Oasis)" },

  // DFH Stadium
  stadium_p: { name: "DFH Stadium" },
  stadium_10a_p: { name: "DFH Stadium (10th Anniversary)" },
  stadium_race_day_p: { name: "DFH Stadium (Circuit)" },
  stadium_day_p: { name: "DFH Stadium (Day)" },
  stadium_winter_p: { name: "DFH Stadium (Snowy)" },
  stadium_foggy_p: { name: "DFH Stadium (Stormy)" },

  // Drift Woods
  woods_p: { name: "Drift Woods" },
  woods_night_p: { name: "Drift Woods (Night)" },

  // Estadio Vida
  ff_dusk_p: { name: "Estadio Vida" },

  // Farmstead
  farm_p: { name: "Farmstead" },
  farm_night_p: { name: "Farmstead (Night)" },
  farm_grs_p: { name: "Farmstead (Pitched)" },
  farm_hw_p: { name: "Farmstead (Spooky)" },
  farm_upsidedown_p: { name: "Farmstead (The Upside Down)" },

  // Forbidden Temple
  chn_stadium_p: { name: "Forbidden Temple" },
  chn_stadium_day_p: { name: "Forbidden Temple (Day)" },
  fni_stadium_p: { name: "Forbidden Temple (Fire & Ice)" },

  // Futura Garden
  uf_day_p: { name: "Futura Garden" },

  // Mannfield
  eurostadium_p: { name: "Mannfield" },
  eurostadium_dusk_p: { name: "Mannfield (Dusk)" },
  eurostadium_night_p: { name: "Mannfield (Night)" },
  eurostadium_snownight_p: { name: "Mannfield (Snowy)" },
  eurostadium_rainy_p: { name: "Mannfield (Stormy)" },

  // Neo Tokyo
  neotokyo_standard_p: { name: "Neo Tokyo" },
  neotokyo_arcade_p: { name: "Neo Tokyo (Arcade)" },
  neotokyo_toon_p: { name: "Neo Tokyo (Comic)" },
  neotokyo_hax_p: { name: "Neo Tokyo (Hacked)" },

  // Neon Fields
  music_p: { name: "Neon Fields" },

  // Parc de Paris
  paname_dusk_p: { name: "Parc de Paris" },

  // Rivals Arena
  cs_hw_p: { name: "Rivals Arena" },

  // Salty Shores
  beach_p: { name: "Salty Shores" },
  beach_night_p: { name: "Salty Shores (Night)" },
  beach_night_grs_p: { name: "Salty Shores (Salty Fest)" },

  // Sovereign Heights
  street_p: { name: "Sovereign Heights" },

  // Starbase ARC
  arc_standard_p: { name: "Starbase ARC" },
  arc_darc_p: { name: "Starbase ARC (Aftermath)" },

  // Urban Central
  trainstation_p: { name: "Urban Central" },
  trainstation_dawn_p: { name: "Urban Central (Dawn)" },
  trainstation_night_p: { name: "Urban Central (Night)" },
  trainstation_spooky_p: { name: "Urban Central (Haunted)" },

  // Utopia Coliseum
  utopiastadium_p: { name: "Utopia Coliseum" },
  utopiastadium_dusk_p: { name: "Utopia Coliseum (Dusk)" },
  utopiastadium_lux_p: { name: "Utopia Coliseum (Gilded)" },
  utopiastadium_snow_p: { name: "Utopia Coliseum (Snowy)" },

  // Wasteland
  wasteland_s_p: { name: "Wasteland" },
  wasteland_night_s_p: { name: "Wasteland (Night)" },
  wasteland_grs_p: { name: "Wasteland (Pitched)" },

  // --- Alternate Maps ---

  // Arctagon
  arc_p: { name: "Arctagon" },

  // Badlands
  wasteland_p: { name: "Badlands" },
  wasteland_night_p: { name: "Badlands (Night)" },

  // Barricade
  labs_pillarheat_p: { name: "Barricade" },

  // Basin
  labs_basin_p: { name: "Basin" },

  // Calavera
  ko_calavera_p: { name: "Calavera" },

  // Carbon
  ko_carbon_p: { name: "Carbon" },

  // Colossus
  labs_pillarwings_p: { name: "Colossus" },

  // Core 707
  shattershot_p: { name: "Core 707" },

  // Corridor
  labs_corridor_p: { name: "Corridor" },

  // Cosmic
  labs_cosmic_v4_p: { name: "Cosmic" },
  labs_cosmic_p: { name: "Cosmic (Old)" },

  // Double Goal
  labs_doublegoal_v2_p: { name: "Double Goal" },
  labs_doublegoal_p: { name: "Double Goal (Old)" },

  // Dunk House
  hoopsstadium_p: { name: "Dunk House" },

  // Force Field
  labs_holyfield_space_p: { name: "Force Field" },

  // Galleon
  labs_galleon_p: { name: "Galleon" },
  labs_galleon_mast_p: { name: "Galleon Retro" },

  // Hourglass
  labs_pillarglass_p: { name: "Hourglass" },

  // Loophole
  labs_holyfield_p: { name: "Loophole" },

  // Mannfield (Quads) — same venue as Mannfield at night, no dedicated shot.
  labs_4v4_arena15_eurostadium_night_p: {
    name: "Mannfield (Quads)",
    imageFrom: "eurostadium_night_p",
  },

  // Midnight Metro (Quads)
  labs_4v4_arena15_blackout_p: { name: "Midnight Metro (Quads)" },

  // Octagon
  labs_octagon_02_p: { name: "Octagon" },
  labs_octagon_p: { name: "Octagon (Old)" },

  // Pillars
  labs_circlepillars_p: { name: "Pillars" },

  // Quadron
  ko_quadron_p: { name: "Quadron" },

  // Roadblock
  labs_octagon_b2b_02_p: { name: "Roadblock" },

  // Sunset Dunes (Quads)
  labs_4v4_arena15_retro_p: { name: "Sunset Dunes (Quads)" },

  // The Block
  hoopsstreet_p: { name: "The Block" },

  // Throwback Stadium
  throwbackstadium_p: { name: "Throwback Stadium" },
  throwbackhockey_p: { name: "Throwback Stadium (Snowy)" },

  // Tokyo Underpass
  neotokyo_p: { name: "Tokyo Underpass" },

  // Underpass
  labs_underpass_p: { name: "Underpass" },
  labs_underpass_v0_p: { name: "Underpass (Old)" },

  // Urban Central (Haunted) - alternate name
  haunted_trainstation_p: { name: "Urban Central (Haunted)" },

  // Utopia Retro
  labs_utopia_p: { name: "Utopia Retro" },
};

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const NORMALIZED_MAP: Record<string, string> = {};
for (const key of Object.keys(ARENA_MAP)) {
  NORMALIZED_MAP[normalizeKey(key)] = key;
}

function resolveArenaKey(arena: string): string | null {
  // Exact match first
  if (ARENA_MAP[arena]) return arena;
  // Case-insensitive / punctuation-insensitive fallback
  const normalized = normalizeKey(arena);
  const exactNormalized = NORMALIZED_MAP[normalized];
  if (exactNormalized) return exactNormalized;
  // Try with common suffix variations
  const withP = normalized + "p";
  if (NORMALIZED_MAP[withP]) return NORMALIZED_MAP[withP];
  return null;
}

/**
 * Get the official display name for an arena internal code.
 * Falls back to the raw code if unknown.
 * Case-insensitive matching.
 */
export function getArenaDisplayName(arena: string | null | undefined): string {
  if (!arena) return "---";
  const resolved = resolveArenaKey(arena);
  if (!resolved) return arena;
  return ARENA_MAP[resolved]?.name ?? arena;
}

/**
 * Get the ArenaInfo object for an internal code.
 * Case-insensitive matching.
 */
export function getArenaInfo(arena: string | null | undefined): ArenaInfo | null {
  if (!arena) return null;
  const resolved = resolveArenaKey(arena);
  if (!resolved) return null;
  return ARENA_MAP[resolved] ?? null;
}

/**
 * Arena keys that actually have a file in public/arenas/.
 *
 * Regenerate with `pnpm assets:arenas`. Without this the resolver happily
 * returned a path for every mapped arena, including ones with no file, so
 * those rendered as broken images that each cost a failed request.
 */
export const ARENAS_WITH_IMAGE: ReadonlySet<string> = new Set(
  ARENA_IMAGE_KEYS,
);

/**
 * Resolve the image path for an arena.
 * Returns null when no image ships for it — callers should fall back to
 * `getArenaFallback`. Images live in public/arenas/{internalName}.webp.
 * Case-insensitive matching.
 */
export function getArenaImagePath(arena: string | null | undefined): string | null {
  if (!arena) return null;
  const resolved = resolveArenaKey(arena);
  if (!resolved) return null;

  const alias = ARENA_MAP[resolved]?.imageFrom;
  if (alias && ARENAS_WITH_IMAGE.has(alias)) return `/arenas/${alias}.webp`;
  if (ARENAS_WITH_IMAGE.has(resolved)) return `/arenas/${resolved}.webp`;
  return null;
}

/**
 * Deterministic stand-in for arenas with no shipped image (new Psyonix maps,
 * rotating event variants). Derives a stable hue from the arena key so the
 * same map always looks the same, instead of showing a broken image.
 */
export function getArenaFallback(arena: string | null | undefined): {
  hue: number;
  initials: string;
} {
  const name = getArenaDisplayName(arena);
  const seed = (arena ?? name) || "unknown";

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const initials = name
    .replace(/\(.*\)/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();

  return { hue: hash % 360, initials: initials || "?" };
}
