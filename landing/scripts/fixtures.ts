/**
 * Rich, coherent fixture data used ONLY to capture marketing screenshots and
 * video of the real RL Stats UI. Nothing here ships in the app.
 *
 * The shapes must mirror the Rust `serde(rename_all = "camelCase")` /
 * snake_case IPC contracts exactly, otherwise the mocked commands render the
 * empty states instead of the real screens.
 *
 * The story: a Diamond III / Champion I player ("Nico") in a ranked doubles
 * session. MMR climbing, one rough loss, a comeback win, mood ratings mixed.
 */

const now = Date.now();
const MINUTE = 60;

function iso(secondsAgo: number): string {
  return new Date(now - secondsAgo * 1000).toISOString();
}

// ─── Identity ────────────────────────────────────────────────────────────────

export const PLAYER_NAME = "Nico";
export const LOCAL_PRIMARY_ID = "76561198000000042";
export const PLAYER_PLATFORM = "steam";

export const PROFILE = {
  id: "landing-profile",
  name: "Principal",
  createdAt: iso(86_400 * 120),
  player_name: PLAYER_NAME,
  local_primary_id: LOCAL_PRIMARY_ID,
};

// ─── Settings ────────────────────────────────────────────────────────────────

export const SETTINGS = {
  player_name: PLAYER_NAME,
  local_primary_id: LOCAL_PRIMARY_ID,
  auto_start: true,
  port: 49123,
  data_retention_days: 0,
  rl_path: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\rocketleague",
  rl_paths: [
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\rocketleague",
  ],
  platform: "steam",
  active_platform: "steam",
  theme: "dark",
  language: "es",
  default_match_type: "ranked",
  game_running: true,
  overlay_enabled: true,
  warn_on_profile_mismatch: true,
  auto_switch_profile_on_exact_match: false,
  auto_sync_on_match_end: false,
  mmr_scraper_enabled: true,
  session_gap_minutes: 30,
  training_tracking_enabled: true,
  weekly_goal_matches: 40,
  weekly_goal_wins: 24,
  overlay_show_mmr: true,
  overlay_show_boost: true,
  overlay_server_enabled: true,
  overlay_server_port: 9528,
};

export const SETTINGS_STORE = {
  state: {
    autoStart: true,
    playerName: PLAYER_NAME,
    hasCompletedOnboarding: true,
    onboardingVersion: 2,
    rlPath: SETTINGS.rl_path,
    platform: "steam",
    defaultMatchType: "ranked",
  },
  version: 0,
};

// ─── Live lobby (ranked doubles, mid-match) ──────────────────────────────────

export const LIVE_BLUE_SCORE = 2;
export const LIVE_ORANGE_SCORE = 1;
export const LIVE_TIME_REMAINING = 178; // 2:58 left

interface FixtureLivePlayer {
  id: string;
  name: string;
  team: number;
  score: number;
  goals: number;
  shots: number;
  assists: number;
  saves: number;
  touches: number;
  demos: number;
  speed: number;
  boost: number;
}

export const LIVE_PLAYERS: FixtureLivePlayer[] = [
  {
    id: LOCAL_PRIMARY_ID,
    name: PLAYER_NAME,
    team: 0,
    score: 412,
    goals: 1,
    shots: 3,
    assists: 1,
    saves: 2,
    touches: 48,
    demos: 1,
    speed: 2201,
    boost: 68,
  },
  {
    id: "76561198000000117",
    name: "Tomi",
    team: 0,
    score: 355,
    goals: 1,
    shots: 2,
    assists: 1,
    saves: 1,
    touches: 41,
    demos: 0,
    speed: 2140,
    boost: 52,
  },
  {
    id: "76561198000000231",
    name: "Kaze",
    team: 1,
    score: 388,
    goals: 1,
    shots: 4,
    assists: 0,
    saves: 3,
    touches: 52,
    demos: 2,
    speed: 2288,
    boost: 44,
  },
  {
    id: "76561198000000345",
    name: "Rulo",
    team: 1,
    score: 290,
    goals: 0,
    shots: 1,
    assists: 1,
    saves: 1,
    touches: 37,
    demos: 0,
    speed: 2105,
    boost: 71,
  },
];

export const LIVE_STATE = {
  match_guid: "LND-LIVE-7F3A9C21",
  arena: "DFH Stadium",
  is_online: true,
  is_overtime: false,
  time_remaining: LIVE_TIME_REMAINING,
  score_blue: LIVE_BLUE_SCORE,
  score_orange: LIVE_ORANGE_SCORE,
  players: LIVE_PLAYERS,
  ball_speed: 1412,
  player_count: 4,
  match_type: "online",
  training_elapsed_seconds: null,
};

export const CONNECTION_STATUS = {
  connected: true,
  address: "127.0.0.1:49123",
  last_error: null,
  reconnect_attempts: 0,
  game_running: true,
};

/** Live MMR for the four players in the lobby. */
export const LIVE_MMR_SNAPSHOT = {
  playlist: "Ranked Doubles",
  playlistCandidates: ["Ranked Doubles"],
  playlistConfidence: "high",
  fetchedAt: iso(12),
  players: [
    {
      primaryId: LOCAL_PRIMARY_ID,
      playerName: PLAYER_NAME,
      platform: "steam",
      identifier: LOCAL_PRIMARY_ID,
      playlist: "Ranked Doubles",
      mmr: 1187,
      rankName: "Diamond III",
      division: "Division III",
      matchesPlayed: 428,
      source: "rlstats-webview",
      cached: false,
      estimated: false,
      stale: false,
      estimateMatchesSinceRefresh: null,
      updatedAt: iso(12),
      warning: null,
      error: null,
    },
    {
      primaryId: "76561198000000117",
      playerName: "Tomi",
      platform: "steam",
      identifier: "76561198000000117",
      playlist: "Ranked Doubles",
      mmr: 1204,
      rankName: "Diamond III",
      division: "Division IV",
      matchesPlayed: 391,
      source: "rlstats-webview",
      cached: false,
      estimated: false,
      stale: false,
      estimateMatchesSinceRefresh: null,
      updatedAt: iso(12),
      warning: null,
      error: null,
    },
    {
      primaryId: "76561198000000231",
      playerName: "Kaze",
      platform: "epic",
      identifier: "76561198000000231",
      playlist: "Ranked Doubles",
      mmr: 1241,
      rankName: "Champion I",
      division: "Division I",
      matchesPlayed: 512,
      source: "rlstats-webview",
      cached: true,
      estimated: false,
      stale: false,
      estimateMatchesSinceRefresh: null,
      updatedAt: iso(640),
      warning: null,
      error: null,
    },
    {
      primaryId: "76561198000000345",
      playerName: "Rulo",
      platform: "epic",
      identifier: "76561198000000345",
      playlist: "Ranked Doubles",
      mmr: null,
      rankName: null,
      division: null,
      matchesPlayed: null,
      source: "local-estimate",
      cached: false,
      estimated: true,
      stale: false,
      estimateMatchesSinceRefresh: 3,
      updatedAt: iso(12),
      warning: "MMR estimado con partidas recientes",
      error: null,
    },
  ],
  exactCount: 3,
  historicalCount: 0,
  estimatedCount: 1,
  unavailableCount: 0,
  averageMmr: 1211,
};

export const LIVE_HEAD_TO_HEAD = {
  "76561198000000231": {
    wins_against: 4,
    losses_against: 6,
    wins_together: 0,
    losses_together: 0,
  },
  "76561198000000345": {
    wins_against: 7,
    losses_against: 3,
    wins_together: 2,
    losses_together: 1,
  },
};

// ─── Match history ───────────────────────────────────────────────────────────

export interface FixtureMatch {
  id: number;
  guid: string;
  start_time: string;
  end_time: string;
  arena: string;
  score_blue: number;
  score_orange: number;
  winner: number;
  local_team_num: number;
  is_online: boolean;
  is_overtime: boolean;
  duration_seconds: number;
  match_type: string;
  playlist: string;
  mood: string | null;
}

/** Most recent first. 14 matches across a few days, mixed results. */
export const MATCHES: FixtureMatch[] = [
  {
    id: 1014,
    guid: "LND-1014-AA01",
    start_time: iso(38 * MINUTE),
    end_time: iso(31 * MINUTE),
    arena: "DFH Stadium",
    score_blue: 4,
    score_orange: 2,
    winner: 0,
    local_team_num: 0,
    is_online: true,
    is_overtime: false,
    duration_seconds: 312,
    match_type: "ranked",
    playlist: "doubles",
    mood: "very_happy",
  },
  {
    id: 1013,
    guid: "LND-1013-AA02",
    start_time: iso(52 * MINUTE),
    end_time: iso(45 * MINUTE),
    arena: "Mannfield (Night)",
    score_blue: 3,
    score_orange: 4,
    winner: 1,
    local_team_num: 0,
    is_online: true,
    is_overtime: true,
    duration_seconds: 361,
    match_type: "ranked",
    playlist: "doubles",
    mood: "angry",
  },
  {
    id: 1012,
    guid: "LND-1012-AA03",
    start_time: iso(67 * MINUTE),
    end_time: iso(60 * MINUTE),
    arena: "Champions Field",
    score_blue: 5,
    score_orange: 3,
    winner: 0,
    local_team_num: 0,
    is_online: true,
    is_overtime: false,
    duration_seconds: 318,
    match_type: "ranked",
    playlist: "doubles",
    mood: "happy",
  },
  {
    id: 1011,
    guid: "LND-1011-AA04",
    start_time: iso(84 * MINUTE),
    end_time: iso(78 * MINUTE),
    arena: "Neo Tokyo",
    score_blue: 2,
    score_orange: 0,
    winner: 0,
    local_team_num: 0,
    is_online: true,
    is_overtime: false,
    duration_seconds: 289,
    match_type: "ranked",
    playlist: "doubles",
    mood: "happy",
  },
  {
    id: 1010,
    guid: "LND-1010-AA05",
    start_time: iso(96 * MINUTE),
    end_time: iso(89 * MINUTE),
    arena: "Utopia Coliseum",
    score_blue: 1,
    score_orange: 6,
    winner: 1,
    local_team_num: 0,
    is_online: true,
    is_overtime: false,
    duration_seconds: 301,
    match_type: "ranked",
    playlist: "doubles",
    mood: "very_angry",
  },
  {
    id: 1009,
    guid: "LND-1009-AA06",
    start_time: iso(26 * 60 + 12),
    end_time: iso(26 * 60 + 5),
    arena: "Forbidden Temple",
    score_blue: 3,
    score_orange: 2,
    winner: 0,
    local_team_num: 0,
    is_online: true,
    is_overtime: true,
    duration_seconds: 355,
    match_type: "ranked",
    playlist: "doubles",
    mood: "very_happy",
  },
  {
    id: 1008,
    guid: "LND-1008-AA07",
    start_time: iso(26 * 60 + 28),
    end_time: iso(26 * 60 + 21),
    arena: "Beckwith Park",
    score_blue: 2,
    score_orange: 4,
    winner: 1,
    local_team_num: 0,
    is_online: true,
    is_overtime: false,
    duration_seconds: 296,
    match_type: "ranked",
    playlist: "doubles",
    mood: "neutral",
  },
  {
    id: 1007,
    guid: "LND-1007-AA08",
    start_time: iso(26 * 60 + 45),
    end_time: iso(26 * 60 + 38),
    arena: "Salty Shores",
    score_blue: 4,
    score_orange: 1,
    winner: 0,
    local_team_num: 0,
    is_online: true,
    is_overtime: false,
    duration_seconds: 304,
    match_type: "ranked",
    playlist: "doubles",
    mood: "happy",
  },
  {
    id: 1006,
    guid: "LND-1006-AA09",
    start_time: iso(26 * 60 + 60),
    end_time: iso(26 * 60 + 54),
    arena: "Wasteland",
    score_blue: 0,
    score_orange: 3,
    winner: 1,
    local_team_num: 0,
    is_online: true,
    is_overtime: false,
    duration_seconds: 281,
    match_type: "ranked",
    playlist: "standard",
    mood: "angry",
  },
  {
    id: 1005,
    guid: "LND-1005-AA10",
    start_time: iso(26 * 60 + 78),
    end_time: iso(26 * 60 + 71),
    arena: "Starbase ARC",
    score_blue: 3,
    score_orange: 3,
    winner: 0,
    local_team_num: 0,
    is_online: true,
    is_overtime: false,
    duration_seconds: 322,
    match_type: "ranked",
    playlist: "standard",
    mood: "neutral",
  },
  {
    id: 1004,
    guid: "LND-1004-AA11",
    start_time: iso(26 * 60 + 140),
    end_time: iso(26 * 60 + 133),
    arena: "Farmstead",
    score_blue: 6,
    score_orange: 2,
    winner: 0,
    local_team_num: 0,
    is_online: true,
    is_overtime: false,
    duration_seconds: 315,
    match_type: "ranked",
    playlist: "doubles",
    mood: "very_happy",
  },
  {
    id: 1003,
    guid: "LND-1003-AA12",
    start_time: iso(26 * 60 + 155),
    end_time: iso(26 * 60 + 149),
    arena: "AquaDome",
    score_blue: 1,
    score_orange: 2,
    winner: 1,
    local_team_num: 0,
    is_online: true,
    is_overtime: false,
    duration_seconds: 287,
    match_type: "ranked",
    playlist: "doubles",
    mood: "neutral",
  },
  {
    id: 1002,
    guid: "LND-1002-AA13",
    start_time: iso(50 * 60 + 20),
    end_time: iso(50 * 60 + 13),
    arena: "Champions Field",
    score_blue: 2,
    score_orange: 1,
    winner: 0,
    local_team_num: 0,
    is_online: true,
    is_overtime: true,
    duration_seconds: 372,
    match_type: "ranked",
    playlist: "doubles",
    mood: "happy",
  },
  {
    id: 1001,
    guid: "LND-1001-AA14",
    start_time: iso(50 * 60 + 35),
    end_time: iso(50 * 60 + 28),
    arena: "Mannfield",
    score_blue: 3,
    score_orange: 5,
    winner: 1,
    local_team_num: 0,
    is_online: true,
    is_overtime: false,
    duration_seconds: 299,
    match_type: "ranked",
    playlist: "doubles",
    mood: null,
  },
];

// ─── Match detail (the 4-2 win, id 1014) ─────────────────────────────────────

export const MATCH_DETAIL = {
  match: {
    id: 1014,
    guid: "LND-1014-AA01",
    start_time: iso(38 * MINUTE),
    end_time: iso(31 * MINUTE),
    arena: "DFH Stadium",
    score_blue: 4,
    score_orange: 2,
    winner: 0,
    local_team_num: 0,
    is_online: true,
    is_overtime: false,
    duration_seconds: 312,
    match_type: "ranked",
    playlist: "doubles",
    mood: "very_happy",
  },
  players: [
    {
      id: 1,
      primary_id: LOCAL_PRIMARY_ID,
      name: PLAYER_NAME,
      team_num: 0,
      stats: {
        score: 486,
        goals: 2,
        shots: 5,
        assists: 1,
        saves: 2,
        touches: 61,
        demos: 1,
        speed: 2201,
        boost: 71,
        mmr: 1187,
        kickoff_goals: 1,
        head_to_head: null,
      },
    },
    {
      id: 2,
      primary_id: "76561198000000117",
      name: "Tomi",
      team_num: 0,
      stats: {
        score: 402,
        goals: 2,
        shots: 4,
        assists: 2,
        saves: 1,
        touches: 54,
        demos: 0,
        speed: 2140,
        boost: 58,
        mmr: 1204,
        kickoff_goals: 0,
        head_to_head: null,
      },
    },
    {
      id: 3,
      primary_id: "76561198000000231",
      name: "Kaze",
      team_num: 1,
      stats: {
        score: 388,
        goals: 1,
        shots: 4,
        assists: 1,
        saves: 3,
        touches: 58,
        demos: 2,
        speed: 2288,
        boost: 49,
        mmr: 1241,
        kickoff_goals: 1,
        head_to_head: {
          wins_against: 4,
          losses_against: 6,
          wins_together: 0,
          losses_together: 0,
        },
      },
    },
    {
      id: 4,
      primary_id: "76561198000000345",
      name: "Rulo",
      team_num: 1,
      stats: {
        score: 331,
        goals: 1,
        shots: 3,
        assists: 0,
        saves: 2,
        touches: 44,
        demos: 1,
        speed: 2105,
        boost: 66,
        mmr: 1152,
        kickoff_goals: 0,
        head_to_head: {
          wins_against: 7,
          losses_against: 3,
          wins_together: 2,
          losses_together: 1,
        },
      },
    },
  ],
  goals: [
    {
      id: "g1",
      scorerId: "76561198000000231",
      scorerName: "Kaze",
      scorerTeam: 1,
      assisterId: "76561198000000345",
      assisterName: "Rulo",
      time: 41,
      ballSpeed: 1218,
    },
    {
      id: "g2",
      scorerId: LOCAL_PRIMARY_ID,
      scorerName: PLAYER_NAME,
      scorerTeam: 0,
      assisterId: "76561198000000117",
      assisterName: "Tomi",
      time: 158,
      ballSpeed: 1394,
    },
    {
      id: "g3",
      scorerId: "76561198000000117",
      scorerName: "Tomi",
      scorerTeam: 0,
      time: 214,
      ballSpeed: 1102,
    },
    {
      id: "g4",
      scorerId: LOCAL_PRIMARY_ID,
      scorerName: PLAYER_NAME,
      scorerTeam: 0,
      assisterId: "76561198000000117",
      assisterName: "Tomi",
      time: 263,
      ballSpeed: 1461,
    },
    {
      id: "g5",
      scorerId: "76561198000000231",
      scorerName: "Kaze",
      scorerTeam: 1,
      time: 279,
      ballSpeed: 1188,
    },
    {
      id: "g6",
      scorerId: "76561198000000117",
      scorerName: "Tomi",
      scorerTeam: 0,
      assisterId: LOCAL_PRIMARY_ID,
      assisterName: PLAYER_NAME,
      time: 301,
      ballSpeed: 1526,
    },
  ],
  events: [],
};

// ─── Analytics (week summary) ────────────────────────────────────────────────

export const ANALYTICS_SUMMARY = {
  period: "week",
  totalMatches: 38,
  wins: 23,
  losses: 15,
  winRate: 61,
  avgScore: 386,
  avgGoals: 1.6,
  avgAssists: 0.8,
  avgSaves: 2.1,
  avgShots: 3.4,
  avgBoost: 63,
  totalGoals: 61,
  totalAssists: 31,
  totalSaves: 81,
  totalShots: 130,
  totalDemos: 24,
  totalConceded: 44,
  totalKickoffGoalsScored: 9,
  totalKickoffGoalsConceded: 5,
  avgKickoffGoalsScored: 0.24,
  avgKickoffGoalsConceded: 0.13,
  bestStreak: 7,
  currentStreak: 3,
  peakSpeed: 2347,
  avgDuration: 311,
};

/** Daily rollups, oldest → newest, for the performance chart. */
export const ROLLUPS = [
  {
    date: "2026-09-05",
    matches_played: 5,
    wins: 3,
    losses: 2,
    avg_score: 372,
    goals_scored: 8,
    goals_conceded: 7,
    total_shots: 17,
    total_saves: 11,
    total_demos: 3,
    total_assists: 4,
    avg_duration_seconds: 305,
    kickoff_goals_scored: 1,
    kickoff_goals_conceded: 1,
  },
  {
    date: "2026-09-06",
    matches_played: 7,
    wins: 5,
    losses: 2,
    avg_score: 401,
    goals_scored: 13,
    goals_conceded: 8,
    total_shots: 26,
    total_saves: 15,
    total_demos: 5,
    total_assists: 7,
    avg_duration_seconds: 318,
    kickoff_goals_scored: 2,
    kickoff_goals_conceded: 1,
  },
  {
    date: "2026-09-07",
    matches_played: 4,
    wins: 2,
    losses: 2,
    avg_score: 358,
    goals_scored: 6,
    goals_conceded: 6,
    total_shots: 13,
    total_saves: 9,
    total_demos: 2,
    total_assists: 3,
    avg_duration_seconds: 297,
    kickoff_goals_scored: 1,
    kickoff_goals_conceded: 0,
  },
  {
    date: "2026-09-08",
    matches_played: 6,
    wins: 4,
    losses: 2,
    avg_score: 394,
    goals_scored: 11,
    goals_conceded: 7,
    total_shots: 22,
    total_saves: 13,
    total_demos: 4,
    total_assists: 6,
    avg_duration_seconds: 309,
    kickoff_goals_scored: 2,
    kickoff_goals_conceded: 1,
  },
  {
    date: "2026-09-09",
    matches_played: 3,
    wins: 1,
    losses: 2,
    avg_score: 340,
    goals_scored: 4,
    goals_conceded: 6,
    total_shots: 10,
    total_saves: 7,
    total_demos: 1,
    total_assists: 2,
    avg_duration_seconds: 288,
    kickoff_goals_scored: 0,
    kickoff_goals_conceded: 1,
  },
  {
    date: "2026-09-10",
    matches_played: 8,
    wins: 5,
    losses: 3,
    avg_score: 408,
    goals_scored: 13,
    goals_conceded: 9,
    total_shots: 27,
    total_saves: 16,
    total_demos: 6,
    total_assists: 7,
    avg_duration_seconds: 322,
    kickoff_goals_scored: 2,
    kickoff_goals_conceded: 1,
  },
  {
    date: "2026-09-11",
    matches_played: 5,
    wins: 3,
    losses: 2,
    avg_score: 391,
    goals_scored: 6,
    goals_conceded: 4,
    total_shots: 15,
    total_saves: 10,
    total_demos: 3,
    total_assists: 2,
    avg_duration_seconds: 314,
    kickoff_goals_scored: 1,
    kickoff_goals_conceded: 0,
  },
];

export const SESSIONS = [
  {
    id: 41,
    start_time: iso(96 * MINUTE),
    end_time: iso(31 * MINUTE),
    duration_seconds: 65 * MINUTE,
    match_count: 5,
    wins: 3,
    losses: 2,
    unknown: 0,
    goals_scored: 15,
    goals_conceded: 15,
    total_shots: 27,
    total_saves: 18,
    total_assists: 8,
    total_demos: 5,
    kickoff_goals_scored: 2,
    kickoff_goals_conceded: 2,
  },
  {
    id: 40,
    start_time: iso(26 * 60 + 78),
    end_time: iso(26 * 60 + 5),
    duration_seconds: 73 * MINUTE,
    match_count: 6,
    wins: 4,
    losses: 2,
    unknown: 0,
    goals_scored: 19,
    goals_conceded: 14,
    total_shots: 32,
    total_saves: 21,
    total_assists: 11,
    total_demos: 6,
    kickoff_goals_scored: 3,
    kickoff_goals_conceded: 1,
  },
];

/** MMR history points (doubles, climbing from 1140 to 1187). */
export const MMR_HISTORY = {
  available: true,
  playlists: ["Ranked Doubles", "Ranked Standard"],
  points: [
    { match_id: 1001, start_time: iso(50 * 60 + 35), mmr: 1142, playlist: "Ranked Doubles", is_win: false, overtime: false },
    { match_id: 1002, start_time: iso(50 * 60 + 20), mmr: 1153, playlist: "Ranked Doubles", is_win: true, overtime: true },
    { match_id: 1003, start_time: iso(26 * 60 + 155), mmr: 1147, playlist: "Ranked Doubles", is_win: false, overtime: false },
    { match_id: 1004, start_time: iso(26 * 60 + 140), mmr: 1161, playlist: "Ranked Doubles", is_win: true, overtime: false },
    { match_id: 1006, start_time: iso(26 * 60 + 60), mmr: 1152, playlist: "Ranked Standard", is_win: false, overtime: false },
    { match_id: 1007, start_time: iso(26 * 60 + 45), mmr: 1166, playlist: "Ranked Doubles", is_win: true, overtime: false },
    { match_id: 1008, start_time: iso(26 * 60 + 28), mmr: 1159, playlist: "Ranked Doubles", is_win: false, overtime: false },
    { match_id: 1009, start_time: iso(26 * 60 + 12), mmr: 1171, playlist: "Ranked Doubles", is_win: true, overtime: true },
    { match_id: 1010, start_time: iso(96 * MINUTE), mmr: 1163, playlist: "Ranked Doubles", is_win: false, overtime: false },
    { match_id: 1011, start_time: iso(84 * MINUTE), mmr: 1174, playlist: "Ranked Doubles", is_win: true, overtime: false },
    { match_id: 1012, start_time: iso(67 * MINUTE), mmr: 1180, playlist: "Ranked Doubles", is_win: true, overtime: false },
    { match_id: 1013, start_time: iso(52 * MINUTE), mmr: 1172, playlist: "Ranked Doubles", is_win: false, overtime: true },
    { match_id: 1014, start_time: iso(38 * MINUTE), mmr: 1187, playlist: "Ranked Doubles", is_win: true, overtime: false },
  ],
};

// ─── Insights ────────────────────────────────────────────────────────────────

export const INSIGHTS = {
  available: true,
  totalMatches: 38,
  playlists: [
    { name: "doubles", played: 26, won: 17, winRate: 65 },
    { name: "standard", played: 9, won: 5, winRate: 56 },
    { name: "rumble", played: 3, won: 1, winRate: 33 },
  ],
  bestPlaylist: "doubles",
  bestPlaylistWR: 65,
  byHour: [
    { hour: 15, played: 4, won: 3, winRate: 75 },
    { hour: 16, played: 5, won: 3, winRate: 60 },
    { hour: 17, played: 6, won: 4, winRate: 67 },
    { hour: 18, played: 7, won: 5, winRate: 71 },
    { hour: 19, played: 6, won: 4, winRate: 67 },
    { hour: 20, played: 5, won: 3, winRate: 60 },
    { hour: 21, played: 3, won: 1, winRate: 33 },
    { hour: 22, played: 2, won: 0, winRate: 0 },
  ],
  bestHour: 18,
  bestHourWR: 71,
  otGames: 9,
  otWins: 6,
  otLosses: 3,
  otWinRate: 67,
  closeGames: 12,
  closeWinRate: 58,
  blowoutGames: 7,
  blowoutWins: 6,
  blowoutLosses: 1,
  blowoutWinRate: 86,
  comebackWins: 5,
  collapseLosses: 2,
  contrib: {
    goalsPct: 34,
    assistsPct: 28,
    savesPct: 41,
    shotsPct: 32,
    demosPct: 22,
  },
  byWeekday: [
    { weekday: 1, played: 6, won: 4, winRate: 67 },
    { weekday: 2, played: 5, won: 3, winRate: 60 },
    { weekday: 3, played: 7, won: 5, winRate: 71 },
    { weekday: 4, played: 5, won: 3, winRate: 60 },
    { weekday: 5, played: 6, won: 3, winRate: 50 },
    { weekday: 6, played: 5, won: 4, winRate: 80 },
    { weekday: 0, played: 4, won: 1, winRate: 25 },
  ],
  bestWeekday: 6,
  bestWeekdayWR: 80,
  minSample: 3,
  heatmap: buildHeatmap(),
  byArena: [
    { name: "DFH Stadium", played: 9, won: 7, winRate: 78 },
    { name: "Champions Field", played: 7, won: 5, winRate: 71 },
    { name: "Mannfield", played: 6, won: 3, winRate: 50 },
    { name: "Neo Tokyo", played: 5, won: 3, winRate: 60 },
    { name: "Utopia Coliseum", played: 4, won: 2, winRate: 50 },
    { name: "Wasteland", played: 4, won: 2, winRate: 50 },
    { name: "Farmstead", played: 3, won: 1, winRate: 33 },
  ],
};

/** Deterministic 7×24 win-rate heatmap with a believable shape. */
function buildHeatmap() {
  const points: {
    weekday: number;
    hour: number;
    played: number;
    won: number;
    winRate: number;
  }[] = [];
  // Evenings are stronger; late nights and weekend mornings are volatile.
  const hourQuality: Record<number, number> = {
    14: 52, 15: 61, 16: 64, 17: 68, 18: 72, 19: 70,
    20: 63, 21: 55, 22: 42, 23: 30,
  };
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (const hourStr of Object.keys(hourQuality)) {
      const hour = Number(hourStr);
      const base = hourQuality[hour];
      const weekendBoost = weekday === 6 ? 6 : weekday === 0 ? -6 : 0;
      const winRate = Math.max(18, Math.min(84, base + weekendBoost + ((weekday * 7 + hour) % 11) - 5));
      const played = 2 + ((weekday + hour) % 4);
      const won = Math.max(0, Math.round((played * winRate) / 100));
      points.push({ weekday, hour, played, won, winRate });
    }
  }
  return points;
}

// ─── Session curve (fatigue / momentum) ──────────────────────────────────────

function curvePoint(
  label: string,
  played: number,
  winRate: number,
  avgGoals: number,
): {
  label: string;
  played: number;
  won: number;
  lost: number;
  winRate: number;
  avgGoals: number;
  avgAssists: number;
  avgSaves: number;
  avgShots: number;
  avgDemos: number;
  avgScore: number;
} {
  const won = Math.round((played * winRate) / 100);
  return {
    label,
    played,
    won,
    lost: played - won,
    winRate,
    avgGoals,
    avgAssists: Number((avgGoals * 0.5).toFixed(2)),
    avgSaves: Number((avgGoals * 1.3).toFixed(2)),
    avgShots: Number((avgGoals * 2.1).toFixed(2)),
    avgDemos: Number((avgGoals * 0.4).toFixed(2)),
    avgScore: Math.round(320 + winRate * 1.1),
  };
}

export const SESSION_CURVE = {
  available: true,
  totalMatches: 38,
  totalSessions: 6,
  minSample: 3,
  byGameNumber: [
    curvePoint("1", 6, 67, 1.9),
    curvePoint("2", 6, 71, 2.1),
    curvePoint("3", 6, 64, 1.7),
    curvePoint("4", 6, 58, 1.6),
    curvePoint("5", 5, 52, 1.4),
    curvePoint("6", 4, 44, 1.2),
    curvePoint("7", 3, 31, 0.9),
  ],
  byMinute: [
    curvePoint("0-15", 6, 69, 1.9),
    curvePoint("15-30", 6, 66, 1.8),
    curvePoint("30-45", 6, 61, 1.7),
    curvePoint("45-60", 5, 55, 1.5),
    curvePoint("60-75", 4, 47, 1.3),
    curvePoint("75-90", 3, 35, 1.0),
  ],
  momentum: {
    afterWin: curvePoint("after_win", 26, 68, 1.9),
    afterLoss: curvePoint("after_loss", 12, 42, 1.2),
    firstOfDay: curvePoint("first_of_day", 7, 61, 1.6),
    restOfDay: curvePoint("rest_of_day", 31, 58, 1.7),
  },
  breakpointGame: {
    splitAfter: 6,
    beforeWr: 63,
    afterWr: 31,
    beforeN: 29,
    afterN: 9,
  },
  breakpointMinute: {
    splitAfterBucket: 4,
    splitAfterMinutes: 60,
    beforeWr: 64,
    afterWr: 35,
    beforeN: 27,
    afterN: 11,
  },
};

// ─── Teammates (chemistry) ───────────────────────────────────────────────────

export const TEAMMATE_STATS = {
  available: true,
  minSample: 3,
  teammates: [
    { primaryId: "76561198000000117", name: "Tomi", played: 18, won: 13, lost: 5, winRate: 72, isFriend: true },
    { primaryId: "76561198000000456", name: "Mati", played: 9, won: 5, lost: 4, winRate: 56, isFriend: true },
    { primaryId: "76561198000000231", name: "Kaze", played: 7, won: 4, lost: 3, winRate: 57, isFriend: false },
    { primaryId: "76561198000000567", name: "Sofi", played: 5, won: 2, lost: 3, winRate: 40, isFriend: false },
    { primaryId: "76561198000000678", name: "Dante", played: 4, won: 1, lost: 3, winRate: 25, isFriend: false },
  ],
  byTeamSize: [
    { teamSize: 2, played: 21, won: 14, lost: 7, winRate: 67 },
    { teamSize: 3, played: 10, won: 5, lost: 5, winRate: 50 },
  ],
};

// ─── Mood breakdown ──────────────────────────────────────────────────────────

export const MOOD_BREAKDOWN = {
  available: true,
  dimension: "mood",
  minSample: 2,
  buckets: [
    { key: "very_happy", ...curvePoint("very_happy", 9, 89, 2.4) },
    { key: "happy", ...curvePoint("happy", 12, 75, 2.0) },
    { key: "neutral", ...curvePoint("neutral", 8, 50, 1.4) },
    { key: "angry", ...curvePoint("angry", 6, 33, 1.0) },
    { key: "very_angry", ...curvePoint("very_angry", 3, 0, 0.6) },
  ],
};

// ─── Custom breakdown (hour) ─────────────────────────────────────────────────

export const HOUR_BREAKDOWN = {
  available: true,
  dimension: "hour",
  minSample: 2,
  buckets: [
    { key: "15", ...curvePoint("15:00", 4, 75, 2.1) },
    { key: "16", ...curvePoint("16:00", 5, 60, 1.7) },
    { key: "17", ...curvePoint("17:00", 6, 67, 1.8) },
    { key: "18", ...curvePoint("18:00", 7, 71, 2.0) },
    { key: "19", ...curvePoint("19:00", 6, 67, 1.9) },
    { key: "20", ...curvePoint("20:00", 5, 60, 1.6) },
    { key: "21", ...curvePoint("21:00", 3, 33, 1.1) },
    { key: "22", ...curvePoint("22:00", 2, 0, 0.8) },
  ],
};

// ─── Training time ───────────────────────────────────────────────────────────

export const TRAINING_ANALYTICS = {
  totalSessions: 14,
  totalSeconds: 5 * 3600 + 42 * 60,
  avgSessionSeconds: 24 * 60,
  enabled: true,
  period: 7,
  days: [
    { date: "2026-09-05", sessions: 2, totalSeconds: 2640 },
    { date: "2026-09-06", sessions: 1, totalSeconds: 1800 },
    { date: "2026-09-08", sessions: 3, totalSeconds: 5400 },
    { date: "2026-09-10", sessions: 2, totalSeconds: 3600 },
    { date: "2026-09-11", sessions: 3, totalSeconds: 4860 },
    { date: "2026-09-12", sessions: 3, totalSeconds: 4260 },
  ],
  byHour: [
    { hour: 15, sessions: 2, totalSeconds: 2400 },
    { hour: 16, sessions: 3, totalSeconds: 3600 },
    { hour: 17, sessions: 2, totalSeconds: 2700 },
    { hour: 18, sessions: 3, totalSeconds: 4500 },
    { hour: 19, sessions: 2, totalSeconds: 3000 },
    { hour: 20, sessions: 2, totalSeconds: 1860 },
  ],
};

// ─── Comparison (this week vs last week) ─────────────────────────────────────

function side(
  totalMatches: number,
  wins: number,
  totalGoals: number,
  totalConceded: number,
  avgScore: number,
  peakSpeed: number,
): {
  totalMatches: number;
  wins: number;
  losses: number;
  totalGoals: number;
  totalConceded: number;
  totalShots: number;
  totalSaves: number;
  totalAssists: number;
  totalDemos: number;
  avgScore: number;
  avgDuration: number;
  peakSpeed: number;
  totalKickoffGoals: number;
  totalKickoffConceded: number;
} {
  return {
    totalMatches,
    wins,
    losses: totalMatches - wins,
    totalGoals,
    totalConceded,
    totalShots: Math.round(totalGoals * 2.1),
    totalSaves: Math.round(totalGoals * 1.3),
    totalAssists: Math.round(totalGoals * 0.5),
    totalDemos: Math.round(totalGoals * 0.4),
    avgScore,
    avgDuration: 311,
    peakSpeed,
    totalKickoffGoals: Math.round(totalGoals * 0.15),
    totalKickoffConceded: Math.round(totalConceded * 0.12),
  };
}

export const COMPARISON = {
  available: true,
  mode: "periods",
  a: side(38, 23, 61, 44, 386, 2347),
  b: side(31, 16, 48, 47, 361, 2288),
};

// ─── Friends / players ───────────────────────────────────────────────────────

export const FRIENDS = [
  { id: 1, player_id: 11, primary_id: "76561198000000117", name: "Tomi", tag: "Duo fijo", created_at: iso(86_400 * 60) },
  { id: 2, player_id: 12, primary_id: "76561198000000456", name: "Mati", tag: null, created_at: iso(86_400 * 40) },
  { id: 3, player_id: 13, primary_id: "76561198000000789", name: "Vicky", tag: "Entrena conmigo", created_at: iso(86_400 * 22) },
];

export const PLAYER_DIRECTORY = {
  players: [
    {
      player_id: 11,
      primary_id: "76561198000000117",
      name: "Tomi",
      total_matches: 24,
      matches_as_teammate: 18,
      matches_as_opponent: 6,
      first_seen: iso(86_400 * 90),
      last_seen: iso(38 * MINUTE),
      wins_together: 13,
      losses_together: 5,
      wins_against: 3,
      losses_against: 3,
      avg_score_teammate: 398,
      avg_goals_teammate: 1.7,
      avg_assists_teammate: 0.9,
    },
    {
      player_id: 14,
      primary_id: "76561198000000231",
      name: "Kaze",
      total_matches: 11,
      matches_as_teammate: 4,
      matches_as_opponent: 7,
      first_seen: iso(86_400 * 65),
      last_seen: iso(38 * MINUTE),
      wins_together: 2,
      losses_together: 2,
      wins_against: 4,
      losses_against: 3,
      avg_score_teammate: 371,
      avg_goals_teammate: 1.4,
      avg_assists_teammate: 0.7,
    },
    {
      player_id: 15,
      primary_id: "76561198000000345",
      name: "Rulo",
      total_matches: 9,
      matches_as_teammate: 2,
      matches_as_opponent: 7,
      first_seen: iso(86_400 * 48),
      last_seen: iso(38 * MINUTE),
      wins_together: 1,
      losses_together: 1,
      wins_against: 5,
      losses_against: 2,
      avg_score_teammate: 352,
      avg_goals_teammate: 1.1,
      avg_assists_teammate: 0.6,
    },
  ],
};

/**
 * Single-player detail, keyed by the ids the directory links to. The demo
 * recording opens Tomi's profile from the directory, so the shape must match
 * `PlayerDetailRecord` exactly or the page shows "not found".
 */
export const PLAYER_DETAILS: Record<string, unknown> = {
  "11": {
    player_id: 11,
    primary_id: "76561198000000117",
    name: "Tomi",
    total_matches: 24,
    matches_as_teammate: 18,
    matches_as_opponent: 6,
    first_seen: iso(86_400 * 90),
    last_seen: iso(38 * MINUTE),
    wins_together: 13,
    losses_together: 5,
    wins_against: 3,
    losses_against: 3,
    total_goals_together: 41,
    total_assists_together: 22,
    total_saves_together: 37,
    total_shots_together: 88,
    total_goals_against: 14,
    total_assists_against: 9,
    total_saves_against: 19,
    total_shots_against: 34,
    recent_matches: [
      {
        match_id: 1014,
        match_guid: "LND-1014-AA01",
        start_time: iso(38 * MINUTE),
        arena: "DFH Stadium",
        playlist: "doubles",
        relationship: "teammate",
        goals: 2,
        assists: 2,
        saves: 1,
        shots: 4,
        score: 402,
        demos: 0,
      },
      {
        match_id: 1013,
        match_guid: "LND-1013-AA02",
        start_time: iso(52 * MINUTE),
        arena: "Mannfield (Night)",
        playlist: "doubles",
        relationship: "teammate",
        goals: 1,
        assists: 1,
        saves: 2,
        shots: 3,
        score: 355,
        demos: 0,
      },
      {
        match_id: 1012,
        match_guid: "LND-1012-AA03",
        start_time: iso(67 * MINUTE),
        arena: "Champions Field",
        playlist: "doubles",
        relationship: "teammate",
        goals: 2,
        assists: 0,
        saves: 3,
        shots: 5,
        score: 388,
        demos: 1,
      },
      {
        match_id: 1011,
        match_guid: "LND-1011-AA04",
        start_time: iso(84 * MINUTE),
        arena: "Neo Tokyo",
        playlist: "doubles",
        relationship: "teammate",
        goals: 0,
        assists: 3,
        saves: 1,
        shots: 2,
        score: 301,
        demos: 0,
      },
      {
        match_id: 1010,
        match_guid: "LND-1010-AA05",
        start_time: iso(96 * MINUTE),
        arena: "Utopia Coliseum",
        playlist: "doubles",
        relationship: "teammate",
        goals: 1,
        assists: 0,
        saves: 1,
        shots: 2,
        score: 244,
        demos: 0,
      },
    ],
  },
  "14": {
    player_id: 14,
    primary_id: "76561198000000231",
    name: "Kaze",
    total_matches: 11,
    matches_as_teammate: 4,
    matches_as_opponent: 7,
    first_seen: iso(86_400 * 65),
    last_seen: iso(38 * MINUTE),
    wins_together: 2,
    losses_together: 2,
    wins_against: 4,
    losses_against: 3,
    total_goals_together: 8,
    total_assists_together: 5,
    total_saves_together: 7,
    total_shots_together: 19,
    total_goals_against: 21,
    total_assists_against: 12,
    total_saves_against: 14,
    total_shots_against: 38,
    recent_matches: [
      {
        match_id: 1014,
        match_guid: "LND-1014-AA01",
        start_time: iso(38 * MINUTE),
        arena: "DFH Stadium",
        playlist: "doubles",
        relationship: "opponent",
        goals: 1,
        assists: 1,
        saves: 3,
        shots: 4,
        score: 388,
        demos: 2,
      },
      {
        match_id: 1013,
        match_guid: "LND-1013-AA02",
        start_time: iso(52 * MINUTE),
        arena: "Mannfield (Night)",
        playlist: "doubles",
        relationship: "opponent",
        goals: 2,
        assists: 0,
        saves: 2,
        shots: 5,
        score: 421,
        demos: 1,
      },
    ],
  },
};

// ─── Player analytics matches (per-player history tab) ───────────────────────

export const PLAYER_ANALYTICS_MATCHES = MATCHES.slice(0, 8).map((match, index) => ({
  id: match.id,
  guid: match.guid,
  start_time: match.start_time,
  end_time: match.end_time,
  arena: match.arena,
  score_blue: match.score_blue,
  score_orange: match.score_orange,
  winner: match.winner,
  is_online: match.is_online,
  is_overtime: match.is_overtime,
  duration_seconds: match.duration_seconds,
  match_type: match.match_type,
  playlist: match.playlist,
  team_num: match.local_team_num,
  is_win: match.winner === match.local_team_num,
  goal_diff: match.score_blue - match.score_orange,
  goals: [2, 1, 2, 0, 1, 0, 1, 1][index] ?? 1,
  assists: [2, 1, 0, 3, 0, 1, 1, 0][index] ?? 0,
  saves: [1, 2, 3, 1, 1, 2, 0, 1][index] ?? 1,
  shots: [4, 3, 5, 2, 2, 4, 3, 2][index] ?? 3,
  score: [402, 355, 388, 301, 244, 318, 290, 334][index] ?? 300,
  demos: [0, 0, 1, 0, 0, 1, 0, 0][index] ?? 0,
  kickoff_goals: [1, 0, 1, 0, 0, 0, 0, 1][index] ?? 0,
  mood: match.mood,
  was_comeback: index === 6,
  was_collapse: index === 4,
}));

// ─── Storage stats (privacy section) ─────────────────────────────────────────

export const STORAGE_STATS = {
  total_matches: 1284,
  total_events: 41_932,
  database_size_bytes: 28_442_624,
  oldest_match_date: iso(86_400 * 214),
  db_path: "C:\\Users\\Nico\\AppData\\Roaming\\com.lukit.rl-stats\\rl_stats_default.db",
};

// ─── Overlay server ──────────────────────────────────────────────────────────

export const OVERLAY_SERVER_STATUS = {
  running: true,
  port: 9528,
  connected_clients: 2,
  token: "lnd0demo",
};

// ─── Cloud (explicitly disabled — local-first story) ─────────────────────────

export const CLOUD_CONFIG = {
  enabled: false,
  cloud_sync_enabled: false,
  device_name: null,
  plan_code: null,
  plan_status: null,
};

export const CLOUD_SYNC_STATUS = {
  configured: false,
  enabled: false,
  cloud_sync_enabled: false,
  device_id: "landing-device",
  pending_app_changes: 0,
  failed_app_changes: 0,
  plan_code: null,
  plan_status: null,
};

export const PROFILE_SYNC_STATUS = {
  device_id: "landing-device",
  protocol_version: "1",
  pending_changes: 0,
  failed_changes: 0,
  last_pulled_revision: 0,
};

// ─── Training packs (real-ish curated list) ──────────────────────────────────

export const TRAINING_PACKS = [
  {
    id: 1,
    name: "Ground Shots",
    code: "6EB1-79B2-33B8-681C",
    creator: "Wayprotein",
    category: "Shooting",
    difficulty: "Beginner",
    description: "Fundamentos de tiro raso: colocación y potencia.",
    tags: ["shooting", "fundamentals"],
    source_url: null,
    favorite: true,
    is_cloud: false,
    created_at: iso(86_400 * 30),
    updated_at: iso(86_400 * 30),
  },
  {
    id: 2,
    name: "Aerial Passes",
    code: "9D87-2C4A-1E6B-5F31",
    creator: "RLCD",
    category: "Passing",
    difficulty: "Intermediate",
    description: "Pases aéreos y recepción para juego en equipo.",
    tags: ["passing", "aerial"],
    source_url: null,
    favorite: false,
    is_cloud: false,
    created_at: iso(86_400 * 25),
    updated_at: iso(86_400 * 25),
  },
  {
    id: 3,
    name: "Backboard Defense",
    code: "4C1F-7A9E-2D3B-8E5A",
    creator: "Musty",
    category: "Defense",
    difficulty: "Advanced",
    description: "Lectura de rebotes y despejes de pared.",
    tags: ["defense", "backboard"],
    source_url: null,
    favorite: true,
    is_cloud: false,
    created_at: iso(86_400 * 18),
    updated_at: iso(86_400 * 18),
  },
  {
    id: 4,
    name: "Dribbling Basics",
    code: "2F8E-6B1D-9C4A-7E3F",
    creator: "Dignitas",
    category: "Dribbling",
    difficulty: "Beginner",
    description: "Control de balón sobre el auto y flicks simples.",
    tags: ["dribbling", "control"],
    source_url: null,
    favorite: false,
    is_cloud: true,
    created_at: iso(86_400 * 12),
    updated_at: iso(86_400 * 12),
  },
];

// ─── Pro configs ─────────────────────────────────────────────────────────────

export const PRO_CONFIGS = [
  { name: "Zen", team: "Team Vitality", region: "EU", fov: 110, height: 90, distance: 260, angle: -4, stiffness: 0.45 },
  { name: "Vatira", team: "Karmine Corp", region: "EU", fov: 109, height: 100, distance: 270, angle: -3, stiffness: 0.4 },
  { name: "Firstkiller", team: "Team Falcons", region: "NA", fov: 110, height: 110, distance: 280, angle: -5, stiffness: 0.5 },
  { name: "M0nkey M00n", team: "Team BDS", region: "EU", fov: 110, height: 100, distance: 270, angle: -4, stiffness: 0.45 },
];
