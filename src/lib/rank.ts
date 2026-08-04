/**
 * Rank derivation.
 *
 * The tracker/RapidAPI integrations that used to supply `rank_name` are dead
 * (the key can't be obtained any more), so every rank field arrives as null.
 * The app does still have an MMR figure per playlist, and Rocket League's
 * rank boundaries are a published function of MMR — so rank is derived here
 * instead of fetched.
 *
 * Thresholds are the standard 2v2/3v3 ladder. 1v1 sits roughly one tier
 * lower for the same MMR, which `PLAYLIST_OFFSET` accounts for.
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

/** Lower bound of each division on the standard ladder. */
const LADDER: [RankTier, number, number][] = [
  // [tier, division, min MMR]
  ["Bronze", 1, 0],
  ["Bronze", 2, 172],
  ["Bronze", 3, 212],
  ["Silver", 1, 252],
  ["Silver", 2, 292],
  ["Silver", 3, 332],
  ["Gold", 1, 372],
  ["Gold", 2, 412],
  ["Gold", 3, 452],
  ["Platinum", 1, 492],
  ["Platinum", 2, 532],
  ["Platinum", 3, 572],
  ["Diamond", 1, 612],
  ["Diamond", 2, 672],
  ["Diamond", 3, 732],
  ["Champion", 1, 792],
  ["Champion", 2, 872],
  ["Champion", 3, 952],
  ["Grand Champion", 1, 1032],
  ["Grand Champion", 2, 1132],
  ["Grand Champion", 3, 1232],
  ["Supersonic Legend", 0, 1332],
];

const BANDS: Band[] = LADDER.map(([tier, division, min], i) => ({
  tier,
  division,
  min,
  max: i + 1 < LADDER.length ? LADDER[i + 1][2] - 1 : Number.POSITIVE_INFINITY,
}));

/**
 * 1v1 MMR runs lower than 2v2/3v3 for the same skill, so the same number maps
 * to a higher rank. Shifting the lookup keeps the icon honest across modes.
 */
const PLAYLIST_OFFSET: Record<string, number> = {
  duel: 120,
  duels: 120,
  "1v1": 120,
  solo: 120,
  soloduel: 120,
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
 * Map an MMR value to a Rocket League rank.
 * Returns null when there is no MMR to work from.
 */
export function deriveRank(
  mmr: number | null | undefined,
  playlist?: string | null,
): DerivedRank | null {
  if (mmr == null || !Number.isFinite(mmr)) return null;

  const offset = PLAYLIST_OFFSET[normalizePlaylist(playlist)] ?? 0;
  const effective = mmr + offset;

  const band =
    BANDS.find((b) => effective >= b.min && effective <= b.max) ?? BANDS[0];

  const span = band.max === Number.POSITIVE_INFINITY ? 200 : band.max - band.min + 1;
  const progress = Math.min(1, Math.max(0, (effective - band.min) / span));

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
