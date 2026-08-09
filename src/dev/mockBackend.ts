/**
 * Browser-only stand-in for the Rust backend.
 *
 * Installed by main.tsx when the frontend runs outside Tauri in dev mode
 * (plain `pnpm dev`). It uses the official @tauri-apps/api/mocks IPC
 * interceptor and emits the same events the Rust core would, so the live
 * page behaves as if a real match were being played.
 */
import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import {
  ARENAS,
  FRIEND_PRIMARY_IDS,
  generateDetail,
  generateHistory,
  LOCAL_NAME,
  LOCAL_PRIMARY_ID,
  ROSTER,
  type MockMatch,
} from "./mockData";

interface LivePlayerSim {
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

interface LiveSim {
  guid: string;
  arena: string;
  timeRemaining: number;
  isOvertime: boolean;
  scoreBlue: number;
  scoreOrange: number;
  players: LivePlayerSim[];
  startedAt: number;
  matchNumber: number;
}

const LIVE_PLAYERS: { id: string; name: string; team: number }[] = [
  { id: ROSTER[0].primaryId, name: ROSTER[0].name, team: 0 },
  { id: ROSTER[1].primaryId, name: ROSTER[1].name, team: 0 },
  { id: ROSTER[2].primaryId, name: ROSTER[2].name, team: 0 },
  { id: ROSTER[3].primaryId, name: ROSTER[3].name, team: 1 },
  { id: ROSTER[4].primaryId, name: ROSTER[4].name, team: 1 },
  { id: ROSTER[5].primaryId, name: ROSTER[5].name, team: 1 },
];

let sim: LiveSim = createMatch(1);
let history: MockMatch[] = generateHistory();
let tickTimer: number | null = null;
let eventCounter = 0;

function createMatch(matchNumber: number): LiveSim {
  return {
    guid: `mock-live-${matchNumber}`,
    arena: ARENAS[matchNumber % ARENAS.length],
    timeRemaining: 300,
    isOvertime: false,
    scoreBlue: 0,
    scoreOrange: 0,
    startedAt: Math.floor(Date.now() / 1000),
    matchNumber,
    players: LIVE_PLAYERS.map((p, i) => ({
      ...p,
      score: 0,
      goals: 0,
      shots: 0,
      assists: 0,
      saves: 0,
      touches: 0,
      demos: 0,
      speed: 0,
      boost: 34 + ((i * 17) % 60),
    })),
  };
}

function rawLiveState() {
  return {
    match_guid: sim.guid,
    arena: sim.arena,
    is_online: true,
    is_overtime: sim.isOvertime,
    time_remaining: sim.timeRemaining,
    score_blue: sim.scoreBlue,
    score_orange: sim.scoreOrange,
    players: sim.players,
    ball_speed: 1200 + Math.round(Math.random() * 4800),
  };
}

function nextEventId(): string {
  eventCounter += 1;
  return `mock-evt-${eventCounter}`;
}

function pushLiveEvent(type: string, data: Record<string, unknown>) {
  void emit("live-event", {
    id: nextEventId(),
    type,
    timestamp: Math.floor(Date.now() / 1000),
    data,
  });
}

function emitLiveUpdate() {
  void emit("live-update", rawLiveState());
}

function simulateGoal() {
  const scoringTeam = Math.random() < 0.52 ? 0 : 1;
  const candidates = sim.players.filter((p) => p.team === scoringTeam);
  const scorer = candidates[Math.floor(Math.random() * candidates.length)];
  const assister =
    Math.random() < 0.6
      ? candidates.find((p) => p.id !== scorer.id)
      : undefined;

  if (scoringTeam === 0) sim.scoreBlue += 1;
  else sim.scoreOrange += 1;

  scorer.goals += 1;
  scorer.score += 30 + Math.floor(Math.random() * 45);
  scorer.shots += 1;
  if (assister) {
    assister.assists += 1;
    assister.score += 15;
  }

  pushLiveEvent("GoalScored", {
    scorer_id: scorer.id,
    scorer_name: scorer.name,
    team: scoringTeam,
    assister_id: assister?.id,
    assister_name: assister?.name,
  });
  if (assister) {
    pushLiveEvent("StatfeedEvent", {
      event_type: "Assist",
      player_id: assister.id,
      player_name: assister.name,
      team: scoringTeam,
    });
  }
  emitLiveUpdate();
}

function tick() {
  if (sim.timeRemaining > 0) {
    sim.timeRemaining -= 1;
  }

  for (const player of sim.players) {
    player.boost = Math.max(0, Math.min(100, player.boost + (Math.random() * 26 - 11)));
    player.touches += Math.random() < 0.32 ? 1 : 0;
    player.speed = Math.round(6000 + Math.random() * 9000);
    if (Math.random() < 0.05) {
      player.shots += 1;
      player.score += 4;
      pushLiveEvent("StatfeedEvent", {
        event_type: "Shot",
        player_id: player.id,
        player_name: player.name,
        team: player.team,
      });
    } else if (Math.random() < 0.04) {
      player.saves += 1;
      player.score += 10;
      pushLiveEvent("StatfeedEvent", {
        event_type: Math.random() < 0.25 ? "Epic Save" : "Save",
        player_id: player.id,
        player_name: player.name,
        team: player.team,
      });
    } else if (Math.random() < 0.012) {
      player.demos += 1;
      player.score += 20;
      pushLiveEvent("StatfeedEvent", {
        event_type: "Demolish",
        player_id: player.id,
        player_name: player.name,
        team: player.team,
      });
    }
    player.score += Math.random() < 0.4 ? Math.floor(Math.random() * 6) : 0;
  }

  if (sim.timeRemaining === 0 && !sim.isOvertime && sim.scoreBlue === sim.scoreOrange) {
    sim.isOvertime = true;
  }

  if (sim.timeRemaining <= 0 && sim.isOvertime && Math.random() < 0.2) {
    simulateGoal();
  } else if (sim.timeRemaining > 0 && Math.random() < 0.028) {
    simulateGoal();
  }

  const ended =
    sim.timeRemaining <= 0 && (!sim.isOvertime || sim.scoreBlue !== sim.scoreOrange);

  if (ended) {
    finishMatch();
    return;
  }

  emitLiveUpdate();
}

function finishMatch() {
  pushLiveEvent("MatchEnded", {});
  const winner = sim.scoreBlue === sim.scoreOrange ? null : sim.scoreBlue > sim.scoreOrange ? 0 : 1;
  void emit("match-summary", {
    match_guid: sim.guid,
    duration_seconds: 300 - Math.min(sim.timeRemaining, 300) + (sim.isOvertime ? 40 : 0),
    score_blue: sim.scoreBlue,
    score_orange: sim.scoreOrange,
    winner,
    local_primary_id: LOCAL_PRIMARY_ID,
    local_team_num: 0,
    players: sim.players.map((p, i) => ({
      id: i + 1,
      primary_id: p.id,
      name: p.name,
      team_num: p.team,
      stats: {
        score: p.score,
        goals: p.goals,
        shots: p.shots,
        assists: p.assists,
        saves: p.saves,
        touches: p.touches,
        demos: p.demos,
        speed: p.speed,
        boost: p.boost,
      },
    })),
  });

  sim = createMatch(sim.matchNumber + 1);
  window.setTimeout(() => {
    pushLiveEvent("MatchCreated", {});
    pushLiveEvent("CountdownBegin", {});
    emitLiveUpdate();
    startTicking();
  }, 6000);
}

function startTicking() {
  if (tickTimer !== null) window.clearInterval(tickTimer);
  tickTimer = window.setInterval(tick, 1000);
  (window as unknown as { __rlMockTimer?: number }).__rlMockTimer = tickTimer;
}

function liveMmrSnapshot() {
  const playlist = "Ranked Standard";
  return {
    playlist,
    playlistCandidates: [playlist],
    playlistConfidence: "high",
    fetchedAt: new Date().toISOString(),
    players: sim.players.map((p) => {
      const def = ROSTER.find((r) => r.primaryId === p.id);
      return {
        primaryId: p.id,
        playerName: p.name,
        platform: "steam",
        identifier: p.id,
        playlist,
        mmr: def ? def.mmr3v3 : null,
        rankName: null,
        division: null,
        matchesPlayed: 120 + (p.name.length * 13) % 300,
        source: "rlstats",
        cached: false,
        estimated: false,
        stale: false,
        estimateMatchesSinceRefresh: null,
        updatedAt: new Date().toISOString(),
        warning: null,
        error: null,
      };
    }),
    exactCount: sim.players.length,
    historicalCount: 0,
    estimatedCount: 0,
    unavailableCount: 0,
  };
}

function rawSummary(match: MockMatch) {
  return {
    id: match.id,
    guid: match.guid,
    start_time: new Date(match.startTime * 1000).toISOString(),
    end_time: new Date(match.endTime * 1000).toISOString(),
    arena: match.arena,
    score_blue: match.scoreBlue,
    score_orange: match.scoreOrange,
    winner: match.winner,
    local_team_num: match.localTeamNum,
    is_online: match.isOnline,
    is_overtime: match.isOvertime,
    duration_seconds: match.durationSeconds,
    match_type: match.matchType,
    playlist: match.playlist,
  };
}

function applyFilters(args: Record<string, unknown> | undefined) {
  const filters = (args?.filters ?? {}) as Record<string, unknown>;
  let rows = [...history];

  if (filters.match_type) rows = rows.filter((m) => m.matchType === filters.match_type);
  if (filters.playlist) rows = rows.filter((m) => m.playlist === filters.playlist);
  if (filters.result === "win") {
    rows = rows.filter((m) => m.winner !== null && m.winner === m.localTeamNum);
  } else if (filters.result === "loss") {
    rows = rows.filter((m) => m.winner !== null && m.winner !== m.localTeamNum);
  }
  if (filters.date_from) {
    rows = rows.filter((m) => m.startTime >= new Date(`${filters.date_from}T00:00:00`).getTime() / 1000);
  }
  if (filters.date_to) {
    rows = rows.filter((m) => m.startTime <= new Date(`${filters.date_to}T23:59:59`).getTime() / 1000);
  }
  if (filters.search) {
    const needle = String(filters.search).toLowerCase();
    rows = rows.filter((m) =>
      m.playerDefs.some((p) => p.name.toLowerCase().includes(needle)),
    );
  }

  const limit = typeof filters.limit === "number" ? filters.limit : 100;
  const offset = typeof filters.offset === "number" ? filters.offset : 0;
  return rows.slice(offset, offset + limit);
}

const SETTINGS = {
  player_name: LOCAL_NAME,
  local_primary_id: LOCAL_PRIMARY_ID,
  auto_start: false,
  port: 49123,
  data_retention_days: 90,
  rl_path: null,
  platform: "steam",
  theme: "dark",
  language: "es",
  default_match_type: "ranked",
  tracker_api_key: null,
  tracker_platform: null,
  tracker_username: null,
  rapidapi_key: null,
  rapidapi_enabled: false,
  tracker_auto_refresh: false,
  tracker_refresh_interval_min: 5,
  session_gap_minutes: 30,
  kickoff_goal_threshold_seconds: 7,
  overlay_enabled: false,
  game_running: true,
  warn_on_profile_mismatch: false,
  auto_switch_profile_on_exact_match: false,
  auto_sync_on_match_end: false,
};

const PROFILE = {
  id: "mock-profile",
  name: "Principal",
  createdAt: new Date().toISOString(),
  player_name: LOCAL_NAME,
  local_primary_id: LOCAL_PRIMARY_ID,
};

export function installMockBackend() {
  // HMR can re-run this module; drop the previous simulation loop first.
  const prev = (window as unknown as { __rlMockTimer?: number }).__rlMockTimer;
  if (prev !== undefined) window.clearInterval(prev);

  mockIPC((cmd, args) => {
    switch (cmd) {
      case "get_settings_cmd":
        return SETTINGS;
      case "set_settings_cmd":
        return null;
      case "get_connection_status":
        return {
          connected: true,
          address: "127.0.0.1:49123",
          last_error: null,
          reconnect_attempts: 0,
          game_running: true,
        };
      case "get_live_state":
        return rawLiveState();
      case "get_live_head_to_head":
        return {
          [ROSTER[3].primaryId]: {
            wins_against: 9,
            losses_against: 6,
            wins_together: 14,
            losses_together: 8,
          },
        };
      case "fetch_live_mmr_snapshot":
        return liveMmrSnapshot();
      case "set_session_mmr_snapshot":
        return null;
      case "set_local_mmr":
        return null;
      case "get_matches":
        return { matches: applyFilters(args as Record<string, unknown> | undefined).map(rawSummary) };
      case "get_match_detail": {
        const id = (args as { matchId?: number })?.matchId;
        const match = history.find((m) => m.id === id);
        if (!match) throw new Error(`match ${id} not found`);
        const detail = generateDetail(match);
        return { match: rawSummary(match), ...detail };
      }
      case "delete_match_cmd": {
        const id = (args as { matchId?: number })?.matchId;
        history = history.filter((m) => m.id !== id);
        return null;
      }
      case "update_match_cmd": {
        const { matchId, matchType, playlist } = args as {
          matchId: number;
          matchType: string | null;
          playlist: string | null;
        };
        const match = history.find((m) => m.id === matchId);
        if (match) {
          if (matchType) match.matchType = matchType;
          if (playlist) match.playlist = playlist;
        }
        return null;
      }
      case "get_friends_cmd":
        return FRIEND_PRIMARY_IDS.map((primaryId, i) => {
          const def = ROSTER.find((r) => r.primaryId === primaryId);
          return {
            id: i + 1,
            player_id: i + 1,
            primary_id: primaryId,
            name: def?.name ?? "Amigo",
            tag: null,
            created_at: new Date().toISOString(),
          };
        });
      case "get_cached_profile":
      case "get_cached_rlstats_profile":
        return null;
      case "list_profiles_cmd":
        return [PROFILE];
      case "get_active_profile_cmd":
        return PROFILE;
      case "get_daily_rollups":
        return { rollups: [] };
      case "get_analytics":
        return { summary: { totalMatches: 0, wins: 0, losses: 0, avgScore: 0, avgGoals: 0, avgAssists: 0, avgSaves: 0, avgShots: 0, avgBoost: 0, totalGoals: 0, totalAssists: 0, totalSaves: 0, totalShots: 0, totalDemos: 0, bestStreak: 0, currentStreak: 0, peakSpeed: 0, avgDuration: 0 } };
      case "get_storage_stats_cmd":
        return {
          total_matches: history.length,
          total_events: 4200,
          database_size_bytes: 1_240_000,
          oldest_match_date: Math.floor(Date.now() / 1000) - 6 * 86400,
          db_path: "/mock/rlstats.db",
        };
      case "get_player_detail_by_primary_id":
      case "get_player_detail":
        return null;
      case "get_player_directory":
        return { players: [] };
      case "report_frontend_error":
        return null;
      default:
        return null;
    }
  }, { shouldMockEvents: true });

  pushLiveEvent("MatchCreated", {});
  pushLiveEvent("CountdownBegin", {});
  startTicking();
}
