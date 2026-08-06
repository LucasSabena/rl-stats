/**
 * Rank derivation.
 *
 * The tracker/RapidAPI integrations that used to supply `rank_name` are dead
 * (the key can't be obtained any more), so every rank field arrives as null.
 * The app does still have an MMR figure per playlist, and Rocket League's
 * rank boundaries are a published function of MMR — so rank is derived here
 * instead of fetched.
 *
 * Each ranked playlist has its own ladder. The thresholds below are the
 * division-I lower bounds observed on the live ladder (season data published
 * by 3DJuegos, 2026); a rank spans from its lower bound up to the next
 * rank's lower bound. 1v1 runs noticeably lower than 2v2/3v3 for the same
 * skill — 1400 MMR is Grand Champion I territory in 2v2 but Supersonic
 * Legend in 1v1 — so a single shared ladder mislabels ranks.
 */

export type RankTier =
  | "Unranked"
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum"
  | "Diamond"
  | "Champion"
  | "Grand Champion"
  | "Supersonic Legend";

export interface DerivedRank {
  tier: RankTier;
  /** 1-3, or 0 for Unranked / Supersonic Legend (which has no divisions). */
  division: number;
  /** e.g. "Diamond II" */
  label: string;
  /** Short form for tight spaces, e.g. "D2", "GC1", "SSL". */
  short: string;
  /** 0-1 progress through the current division, for progress meters. */
  progress: number;
}

interface Band {
  tier: RankTier;
  division: number;
  min: number;
  max: number;
}

type LadderDef = [RankTier, number, number][];

/** 1v1 (Duel) ladder — the compressed ladder, SSL from 1341. */
const LADDER_1V1: LadderDef = [
  ["Bronze", 1, 0],
  ["Bronze", 2, 156],
  ["Bronze", 3, 203],
  ["Silver", 1, 275],
  ["Silver", 2, 335],
  ["Silver", 3, 395],
  ["Gold", 1, 455],
  ["Gold", 2, 515],
  ["Gold", 3, 575],
  ["Platinum", 1, 635],
  ["Platinum", 2, 695],
  ["Platinum", 3, 755],
  ["Diamond", 1, 815],
  ["Diamond", 2, 875],
  ["Diamond", 3, 935],
  ["Champion", 1, 995],
  ["Champion", 2, 1047],
  ["Champion", 3, 1105],
  ["Grand Champion", 1, 1163],
  ["Grand Champion", 2, 1224],
  ["Grand Champion", 3, 1288],
  ["Supersonic Legend", 0, 1341],
];

/** 2v2 (Ranked Doubles) ladder — SSL from 1863. */
const LADDER_2V2: LadderDef = [
  ["Bronze", 1, 0],
  ["Bronze", 2, 169],
  ["Bronze", 3, 232],
  ["Silver", 1, 291],
  ["Silver", 2, 353],
  ["Silver", 3, 415],
  ["Gold", 1, 475],
  ["Gold", 2, 534],
  ["Gold", 3, 593],
  ["Platinum", 1, 655],
  ["Platinum", 2, 714],
  ["Platinum", 3, 773],
  ["Diamond", 1, 835],
  ["Diamond", 2, 915],
  ["Diamond", 3, 995],
  ["Champion", 1, 1075],
  ["Champion", 2, 1195],
  ["Champion", 3, 1315],
  ["Grand Champion", 1, 1435],
  ["Grand Champion", 2, 1575],
  ["Grand Champion", 3, 1715],
  ["Supersonic Legend", 0, 1863],
];

/** 3v3 (Ranked Standard) ladder — SSL from 1885. */
const LADDER_3V3: LadderDef = [
  ["Bronze", 1, 0],
  ["Bronze", 2, 175],
  ["Bronze", 3, 235],
  ["Silver", 1, 295],
  ["Silver", 2, 355],
  ["Silver", 3, 415],
  ["Gold", 1, 475],
  ["Gold", 2, 535],
  ["Gold", 3, 595],
  ["Platinum", 1, 655],
  ["Platinum", 2, 715],
  ["Platinum", 3, 775],
  ["Diamond", 1, 835],
  ["Diamond", 2, 915],
  ["Diamond", 3, 995],
  ["Champion", 1, 1075],
  ["Champion", 2, 1195],
  ["Champion", 3, 1315],
  ["Grand Champion", 1, 1435],
  ["Grand Champion", 2, 1575],
  ["Grand Champion", 3, 1709],
  ["Supersonic Legend", 0, 1885],
];

function buildBands(ladder: LadderDef): Band[] {
  return ladder.map(([tier, division, min], i) => ({
    tier,
    division,
    min,
    max: i + 1 < ladder.length ? ladder[i + 1][2] - 1 : Number.POSITIVE_INFINITY,
  }));
}

const BANDS_1V1 = buildBands(LADDER_1V1);
const BANDS_2V2 = buildBands(LADDER_2V2);
const BANDS_3V3 = buildBands(LADDER_3V3);

const PLAYLIST_LADDERS: Record<string, Band[]> = {
  duel: BANDS_1V1,
  duels: BANDS_1V1,
  "1v1": BANDS_1V1,
  solo: BANDS_1V1,
  soloduel: BANDS_1V1,
  rankedduels: BANDS_1V1,

  doubles: BANDS_2V2,
  "2v2": BANDS_2V2,
  rankeddoubles: BANDS_2V2,

  standard: BANDS_3V3,
  "3v3": BANDS_3V3,
  rankedstandard: BANDS_3V3,
  // Chaos is unranked 4v4; when an MMR figure still shows up for it, the
  // standard ladder is the closest approximation.
  chaos: BANDS_3V3,
};

const SHORT_TIER: Record<RankTier, string> = {
  Unranked: "—",
  Bronze: "B",
  Silver: "S",
  Gold: "G",
  Platinum: "P",
  Diamond: "D",
  Champion: "C",
  "Grand Champion": "GC",
  "Supersonic Legend": "SSL",
};

function normalizePlaylist(playlist?: string | null): string {
  return (playlist ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Map an MMR value to a Rocket League rank on the playlist's own ladder.
 * Unknown playlists fall back to the 3v3 ladder, the most common mode.
 * Returns null when there is no MMR to work from.
 */
export function deriveRank(
  mmr: number | null | undefined,
  playlist?: string | null,
): DerivedRank | null {
  if (mmr == null || !Number.isFinite(mmr)) return null;

  const bands = PLAYLIST_LADDERS[normalizePlaylist(playlist)] ?? BANDS_3V3;
  const band = bands.find((b) => mmr >= b.min && mmr <= b.max) ?? bands[0];

  const span = band.max === Number.POSITIVE_INFINITY ? 200 : band.max - band.min + 1;
  const progress = Math.min(1, Math.max(0, (mmr - band.min) / span));

  const roman = band.division === 1 ? "I" : band.division === 2 ? "II" : "III";
  const label =
    band.division === 0 ? band.tier : `${band.tier} ${roman}`;
  const short =
    band.division === 0
      ? SHORT_TIER[band.tier]
      : `${SHORT_TIER[band.tier]}${band.division}`;

  return { tier: band.tier, division: band.division, label, short, progress };
}

/**
 * Tier colors, roughly matching the in-game palette so they read instantly.
 * Returned as OKLCH so they hold up in both themes.
 */
export const TIER_COLOR: Record<RankTier, string> = {
  Unranked: "oklch(0.62 0.01 265)",
  Bronze: "oklch(0.58 0.09 55)",
  Silver: "oklch(0.74 0.02 250)",
  Gold: "oklch(0.79 0.13 85)",
  Platinum: "oklch(0.79 0.11 195)",
  Diamond: "oklch(0.65 0.16 260)",
  Champion: "oklch(0.62 0.19 300)",
  "Grand Champion": "oklch(0.62 0.21 20)",
  "Supersonic Legend": "oklch(0.75 0.17 345)",
};

/** How many chevrons the insignia stacks for each tier. */
export const TIER_RANK_INDEX: Record<RankTier, number> = {
  Unranked: 0,
  Bronze: 1,
  Silver: 2,
  Gold: 3,
  Platinum: 4,
  Diamond: 5,
  Champion: 6,
  "Grand Champion": 7,
  "Supersonic Legend": 8,
};

/** First tier index on the in-game 0-22 ladder for each named tier. */
const TIER_ICON_BASE: Record<RankTier, number> = {
  Unranked: 0,
  Bronze: 1,
  Silver: 4,
  Gold: 7,
  Platinum: 10,
  Diamond: 13,
  Champion: 16,
  "Grand Champion": 19,
  "Supersonic Legend": 22,
};

/**
 * Index into the shipped rank icons (public/ranks/{index}-{size}.webp).
 *
 * The in-game ladder is a flat 0-22: 0 Unranked, then three divisions per
 * tier up to Grand Champion, and 22 for Supersonic Legend which has none.
 */
export function rankIconIndex(rank: DerivedRank): number {
  const base = TIER_ICON_BASE[rank.tier];
  if (rank.division === 0) return base;
  return base + (rank.division - 1);
}
