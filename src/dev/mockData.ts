/**
 * Deterministic fake data for the browser-only dev preview.
 *
 * Nothing here ships in the production bundle: main.tsx only imports this
 * module when running outside Tauri in dev mode.
 */

export const LOCAL_PRIMARY_ID = "76561198012345601";
export const LOCAL_NAME = "Kaelis";

export interface MockPlayerDef {
  primaryId: string;
  name: string;
  mmr3v3: number;
  mmr2v2: number;
  mmr1v1: number;
}

export const ROSTER: MockPlayerDef[] = [
  { primaryId: LOCAL_PRIMARY_ID, name: LOCAL_NAME, mmr3v3: 1400, mmr2v2: 1400, mmr1v1: 1180 },
  { primaryId: "76561198012345602", name: "NyxShadow", mmr3v3: 1520, mmr2v2: 1488, mmr1v1: 1240 },
  { primaryId: "76561198012345603", name: "Voltari", mmr3v3: 1445, mmr2v2: 1362, mmr1v1: 1105 },
  { primaryId: "76561198012345604", name: "Riptide", mmr3v3: 1610, mmr2v2: 1720, mmr1v1: 1300 },
  { primaryId: "76561198012345605", name: "Momo", mmr3v3: 1350, mmr2v2: 1318, mmr1v1: 1042 },
  { primaryId: "76561198012345606", name: "Zephyr.exe", mmr3v3: 1280, mmr2v2: 1256, mmr1v1: 998 },
  { primaryId: "76561198012345607", name: "BrunoGC", mmr3v3: 920, mmr2v2: 860, mmr1v1: 700 },
  { primaryId: "76561198012345608", name: "Atenea", mmr3v3: 1090, mmr2v2: 1120, mmr1v1: 890 },
];

export const FRIEND_PRIMARY_IDS = [ROSTER[3].primaryId, ROSTER[7].primaryId];

export const ARENAS = [
  "stadium_p",
  "park_p",
  "underwater_p",
  "cs_p",
  "farm_p",
  "outlaw_p",
  "woods_p",
  "ff_dusk_p",
];

/** Small, fast, seedable PRNG so the fake history is stable across reloads. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MockMatch {
  id: number;
  guid: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  arena: string;
  scoreBlue: number;
  scoreOrange: number;
  winner: number | null;
  localTeamNum: number;
  isOnline: boolean;
  isOvertime: boolean;
  matchType: string;
  playlist: string;
  playerDefs: MockPlayerDef[];
  teamSize: number;
}

const DAY = 86_400;

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Generate ~6 days of mixed ranked/casual matches, most recent first. */
export function generateHistory(now = Math.floor(Date.now() / 1000)): MockMatch[] {
  const rng = mulberry32(20260804);
  const matches: MockMatch[] = [];
  let id = 1;

  for (let day = 0; day < 6; day++) {
    const perDay = day === 0 ? 6 : 4 + Math.floor(rng() * 3);
    for (let i = 0; i < perDay; i++) {
      const ranked = rng() < 0.78;
      const playlistRoll = rng();
      const playlist = !ranked
        ? "Standard"
        : playlistRoll < 0.48
          ? "Doubles"
          : playlistRoll < 0.88
            ? "Standard"
            : "Duel";
      const teamSize = playlist === "Duel" ? 1 : playlist === "Doubles" ? 2 : 3;

      const startHour = 14 + Math.floor(rng() * 8);
      const start =
        now - day * DAY - (now % DAY) + startHour * 3600 + Math.floor(rng() * 3000) - 3 * 3600;
      const durationSeconds = 240 + Math.floor(rng() * 180);

      const localTeamNum = rng() < 0.5 ? 0 : 1;
      const won = rng() < 0.55;
      const draw = !won && rng() < 0.06;

      let scoreBlue: number;
      let scoreOrange: number;
      let winner: number | null;
      if (draw) {
        scoreBlue = scoreOrange = 1 + Math.floor(rng() * 2);
        winner = null;
      } else {
        const winScore = 1 + Math.floor(rng() * 4);
        const loseScore = Math.max(0, winScore - 1 - Math.floor(rng() * 3));
        const winnerTeam = won ? localTeamNum : 1 - localTeamNum;
        scoreBlue = winnerTeam === 0 ? winScore : loseScore;
        scoreOrange = winnerTeam === 1 ? winScore : loseScore;
        winner = winnerTeam;
      }
      const isOvertime = !draw && rng() < 0.18;

      const pool = ROSTER.filter((p) => p.primaryId !== LOCAL_PRIMARY_ID);
      const others = [...pool].sort(() => rng() - 0.5).slice(0, teamSize * 2 - 1);
      const playerDefs = [ROSTER[0], ...others];

      matches.push({
        id: id++,
        guid: `mock-match-${id}`,
        startTime: start,
        endTime: start + durationSeconds,
        durationSeconds,
        arena: pick(rng, ARENAS),
        scoreBlue,
        scoreOrange,
        winner,
        localTeamNum,
        isOnline: true,
        isOvertime,
        matchType: ranked ? "ranked" : "casual",
        playlist,
        playerDefs,
        teamSize,
      });
    }
  }

  return matches.sort((a, b) => b.startTime - a.startTime);
}

export interface MockGoal {
  id: string;
  scorerId: string;
  scorerName: string;
  scorerTeam: number;
  assisterId?: string;
  assisterName?: string;
  time: number;
  ballSpeed: number;
}

export interface MockDetailPlayer {
  id: number;
  primary_id: string;
  name: string;
  team_num: number;
  stats: {
    score: number;
    goals: number;
    shots: number;
    assists: number;
    saves: number;
    touches: number;
    demos: number;
    speed: number;
    boost: number;
    mmr: number | null;
    kickoff_goals: number;
  };
}

export interface MockDetail {
  players: MockDetailPlayer[];
  goals: MockGoal[];
  events: { id: string; type: string; timestamp: number; data: Record<string, unknown> }[];
}

function mmrFor(def: MockPlayerDef, playlist: string): number | null {
  if (playlist === "Duel") return def.mmr1v1;
  if (playlist === "Doubles") return def.mmr2v2;
  return def.mmr3v3;
}

/** Build a full, internally consistent match detail for a mock match. */
export function generateDetail(match: MockMatch): MockDetail {
  const rng = mulberry32(match.id * 7919 + 13);

  const players: MockDetailPlayer[] = match.playerDefs.map((def, i) => {
    const slot = Math.floor(i / match.teamSize);
    const teamNum = slot === 0 ? match.localTeamNum : match.localTeamNum === 0 ? 1 : 0;
    return {
      id: i + 1,
      primary_id: def.primaryId,
      name: def.name,
      team_num: teamNum,
      stats: {
        score: 120 + Math.floor(rng() * 620),
        goals: 0,
        shots: 1 + Math.floor(rng() * 5),
        assists: 0,
        saves: Math.floor(rng() * 4),
        touches: 18 + Math.floor(rng() * 40),
        demos: Math.floor(rng() * 2),
        speed: 9000 + Math.floor(rng() * 6000),
        boost: 900 + Math.floor(rng() * 700),
        mmr: match.matchType === "ranked" ? mmrFor(def, match.playlist) : null,
        kickoff_goals: 0,
      },
    };
  });

  const goals: MockGoal[] = [];
  const events: MockDetail["events"] = [];
  const totalGoals = match.scoreBlue + match.scoreOrange;
  const times: number[] = [];
  for (let g = 0; g < totalGoals; g++) {
    times.push(Math.floor(((g + 0.6) / (totalGoals + 0.5)) * (match.durationSeconds - 20)) + Math.floor(rng() * 14));
  }
  times.sort((a, b) => a - b);

  const order: number[] = [];
  for (let b = 0; b < match.scoreBlue; b++) order.push(0);
  for (let o = 0; o < match.scoreOrange; o++) order.push(1);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  order.forEach((team, g) => {
    const teamPlayers = players.filter((p) => p.team_num === team);
    const scorer = pick(rng, teamPlayers);
    const assister = rng() < 0.62 ? pick(rng, teamPlayers.filter((p) => p.id !== scorer.id)) : undefined;
    const time = times[g];
    const ballSpeed = 70 + rng() * 60;

    scorer.stats.goals += 1;
    scorer.stats.score += 30 + Math.floor(rng() * 40);
    if (assister) {
      assister.stats.assists += 1;
      assister.stats.score += 15;
    }
    if (rng() < 0.14) scorer.stats.kickoff_goals += 1;

    goals.push({
      id: `goal-${match.id}-${g}`,
      scorerId: scorer.primary_id,
      scorerName: scorer.name,
      scorerTeam: team,
      assisterId: assister?.primary_id,
      assisterName: assister?.name,
      time,
      ballSpeed,
    });

    events.push({
      id: `evt-${match.id}-goal-${g}`,
      type: "GoalScored",
      timestamp: time,
      data: {
        scorer_id: scorer.primary_id,
        scorer_name: scorer.name,
        team,
        assister_id: assister?.primary_id,
        assister_name: assister?.name,
      },
    });

    if (assister) {
      events.push({
        id: `evt-${match.id}-assist-${g}`,
        type: "StatfeedEvent",
        timestamp: Math.max(0, time - 2),
        data: { event_type: "Assist", player_id: assister.primary_id, player_name: assister.name, team },
      });
    }
  });

  const filler = ["Save", "Epic Save", "Shot", "Demolish"] as const;
  for (let k = 0; k < 10; k++) {
    const p = pick(rng, players);
    const kind = pick(rng, [...filler]);
    events.push({
      id: `evt-${match.id}-filler-${k}`,
      type: "StatfeedEvent",
      timestamp: Math.floor(rng() * match.durationSeconds),
      data: { event_type: kind, player_id: p.primary_id, player_name: p.name, team: p.team_num },
    });
  }

  events.sort((a, b) => a.timestamp - b.timestamp);

  const topScorer = [...players].sort((a, b) => b.stats.goals - a.stats.goals)[0];
  if (topScorer) topScorer.stats.score = Math.max(topScorer.stats.score, 480 + Math.floor(rng() * 220));

  return { players, goals, events };
}
