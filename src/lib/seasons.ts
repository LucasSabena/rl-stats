import type { DateRange } from "./types";

/**
 * Rocket League competitive season calendar (free-to-play numbering, which
 * restarted at Season 1 in September 2020).
 *
 * Psyonix does not expose a seasons API, so the table is maintained manually.
 * Dates are the day each season went live / is expected to end, in
 * `YYYY-MM-DD`; the day a new season starts is the day the previous one ends.
 * `endEstimated` flags dates Psyonix has not officially confirmed (usually
 * extrapolated from the in-game event window).
 */
export interface RlSeason {
  number: number;
  startDate: string;
  endDate: string;
  endEstimated?: boolean;
}

export const RL_SEASONS: RlSeason[] = [
  { number: 1, startDate: "2020-09-23", endDate: "2020-12-09" },
  { number: 2, startDate: "2020-12-09", endDate: "2021-04-07" },
  { number: 3, startDate: "2021-04-07", endDate: "2021-08-11" },
  { number: 4, startDate: "2021-08-11", endDate: "2021-11-17" },
  { number: 5, startDate: "2021-11-17", endDate: "2022-03-09" },
  { number: 6, startDate: "2022-03-09", endDate: "2022-06-15" },
  { number: 7, startDate: "2022-06-15", endDate: "2022-09-07" },
  { number: 8, startDate: "2022-09-07", endDate: "2022-12-07" },
  { number: 9, startDate: "2022-12-07", endDate: "2023-03-08" },
  { number: 10, startDate: "2023-03-08", endDate: "2023-06-07" },
  { number: 11, startDate: "2023-06-07", endDate: "2023-09-06" },
  { number: 12, startDate: "2023-09-06", endDate: "2023-12-06" },
  { number: 13, startDate: "2023-12-06", endDate: "2024-03-06" },
  { number: 14, startDate: "2024-03-06", endDate: "2024-06-05" },
  { number: 15, startDate: "2024-06-05", endDate: "2024-09-04" },
  { number: 16, startDate: "2024-09-04", endDate: "2024-12-04" },
  { number: 17, startDate: "2024-12-04", endDate: "2025-03-14" },
  { number: 18, startDate: "2025-03-14", endDate: "2025-06-18" },
  { number: 19, startDate: "2025-06-18", endDate: "2025-09-17" },
  { number: 20, startDate: "2025-09-17", endDate: "2025-12-10" },
  { number: 21, startDate: "2025-12-10", endDate: "2026-03-11" },
  { number: 22, startDate: "2026-03-11", endDate: "2026-06-10" },
  { number: 23, startDate: "2026-06-10", endDate: "2026-09-23" },
  // Season 24 "Heads to the Streets" launched 2026-09-23. Psyonix has not
  // published an official end date; the season-long event window ends
  // 2026-12-09, the day Season 25 is reported to start.
  { number: 24, startDate: "2026-09-23", endDate: "2026-12-09", endEstimated: true },
  { number: 25, startDate: "2026-12-09", endDate: "2027-03-11", endEstimated: true },
];

export function seasonByNumber(number: number): RlSeason | undefined {
  return RL_SEASONS.find((season) => season.number === number);
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The season that contains `date` (defaults to today), if any. */
export function currentSeason(date: Date = new Date()): RlSeason | undefined {
  const today = toLocalDateString(date);
  return RL_SEASONS.find(
    (season) => season.startDate <= today && today <= season.endDate,
  );
}

export function seasonDateRange(season: RlSeason): DateRange {
  return { startDate: season.startDate, endDate: season.endDate };
}
