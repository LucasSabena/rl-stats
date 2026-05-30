// Mirrored from Rust backend (serde rename_all = "camelCase")

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "game_not_running";

export type Team = 0 | 1;

export interface Player {
  id: string;
  name: string;
  team: Team;
  score: number;
  goals: number;
  shots: number;
  assists: number;
  saves: number;
  demos: number;
  touches: number;
  boostAmount: number;
  speed: number;
  mmr?: number | null;
  kickoffGoals?: number;
}

export interface PlayerStats extends Player {
  mvp?: boolean;
  avgBoost?: number;
  maxSpeed?: number;
  avgSpeed?: number;
  timeInAir?: number;
  mmr?: number | null;
  head_to_head?: HeadToHeadRecord | null;
}

export interface GameState {
  timeRemaining: number;
  isOvertime: boolean;
  isReplay: boolean;
  arena: string | null;
  ballSpeed: number;
  ballPosition: {
    x: number;
    y: number;
    z: number;
  } | null;
}

export interface LiveMatchState {
  matchGuid: string | null;
  players: Player[];
  gameState: GameState;
  teamBlueScore: number;
  teamOrangeScore: number;
  playerCount?: number;
  matchType?: string | null;
}

export interface SessionSummary {
  match_guid: string;
  duration_seconds: number;
  score_blue: number;
  score_orange: number;
  winner: number | null;
  players: {
    id: number;
    primary_id: string;
    name: string;
    team_num: number;
    stats: Record<string, unknown>;
  }[];
}

export type RlEventType =
  | "UpdateState"
  | "BallHit"
  | "GoalScored"
  | "StatfeedEvent"
  | "MatchCreated"
  | "MatchEnded"
  | "GoalReplayStart"
  | "GoalReplayEnd"
  | "PlayerJoined"
  | "PlayerLeft"
  | "CountdownBegin"
  | "MatchPaused"
  | "MatchUnpaused"
  | "ClockUpdatedSeconds"
  | "RoundStarted";

export interface RlEvent {
  id: string;
  type: RlEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface MatchSummary {
  id: number;
  matchGuid: string | null;
  startTime: number;
  endTime: number | null;
  durationSeconds: number | null;
  arena: string | null;
  teamBlueScore: number;
  teamOrangeScore: number;
  winnerTeamNum: number | null;
  localTeamNum?: number | null;
  isOnline: boolean;
  isOvertime: boolean;
  matchType?: MatchType | null;
  playlist?: string | null;
}

export interface MatchDetail extends MatchSummary {
  players: PlayerStats[];
  events: RlEvent[];
  goals: Goal[];
}

export interface Goal {
  id: string;
  scorerId: string;
  scorerName: string;
  scorerTeam: Team;
  assisterId?: string;
  assisterName?: string;
  time: number;
  ballSpeed: number;
}

export interface MatchFilters {
  search?: string;
  result?: "win" | "loss" | null;
  mode?: string | null;
  matchType?: MatchType | null;
  dateFrom?: number | null;
  dateTo?: number | null;
  limit?: number;
  offset?: number;
}

export type AnalyticsPeriod =
  | "day"
  | "week"
  | "month"
  | "session"
  | "year"
  | "alltime";

export interface AnalyticsData {
  period: AnalyticsPeriod;
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  avgScore: number;
  avgGoals: number;
  avgAssists: number;
  avgSaves: number;
  avgShots: number;
  avgBoost: number;
  totalGoals: number;
  totalAssists: number;
  totalSaves: number;
  totalShots: number;
  totalDemos: number;
  totalKickoffGoalsScored: number;
  totalKickoffGoalsConceded: number;
  avgKickoffGoalsScored: number;
  avgKickoffGoalsConceded: number;
  bestStreak: number;
  currentStreak: number;
  peakSpeed: number;
  avgDuration: number;
}

export interface DailyRollup {
  date: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  avgScore: number;
  totalGoals: number;
  totalShots: number;
  totalSaves: number;
  totalDemos: number;
  totalAssists: number;
}

export interface MatchSession {
  id: number;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  match_count: number;
  wins: number;
  losses: number;
  unknown: number;
  goals_scored: number;
  goals_conceded: number;
  total_shots: number;
  total_saves: number;
  total_assists: number;
  total_demos: number;
  kickoff_goals_scored?: number;
  kickoff_goals_conceded?: number;
}

export interface SessionMatchPlayer {
  team_num: number;
  score: number;
  goals: number;
  shots: number;
  assists: number;
  saves: number;
  demos: number;
  speed: number;
  boost: number;
  touches: number;
  name: string;
  primary_id: string;
  kickoff_goals?: number;
}

export interface SessionMatch {
  id: number;
  guid: string;
  start_time: string;
  end_time: string | null;
  arena: string | null;
  score_blue: number;
  score_orange: number;
  winner: number | null;
  is_online: boolean;
  is_overtime: boolean;
  duration_seconds: number;
  match_type: string | null;
  playlist: string | null;
  players: SessionMatchPlayer[];
  local_team: number | null;
  is_win: boolean;
  goal_diff: number | null;
  kickoff_goals_scored?: number;
  kickoff_goals_conceded?: number;
}

export interface InsightsData {
  available: boolean;
  totalMatches?: number;
  playlists?: { name: string; played: number; won: number; winRate: number }[];
  bestPlaylist?: string;
  bestPlaylistWR?: number;
  byHour?: { hour: number; played: number; won: number; winRate: number }[];
  bestHour?: number;
  bestHourWR?: number;
  otGames?: number;
  otWinRate?: number;
  closeGames?: number;
  closeWinRate?: number;
  blowoutGames?: number;
  blowoutWinRate?: number;
  contrib?: {
    goalsPct: number;
    assistsPct: number;
    savesPct: number;
    shotsPct: number;
    demosPct: number;
  };
}

export interface OverlayServerStatus {
  running: boolean;
  port: number;
  connected_clients: number;
}

export interface OverlayUrl {
  name: string;
  url: string;
}

export type MatchType =
  | "ranked"
  | "casual"
  | "tournament"
  | "training"
  | "other";

export type PlaylistFilter =
  | "all"
  | "duel"
  | "doubles"
  | "standard"
  | "chaos"
  | "rumble"
  | "dropshot"
  | "hoops"
  | "snowday"
  | "other";

export type MatchTypeFilter = "all" | MatchType;

export type DataScope = "me" | "team";

export interface CloudConfig {
  enabled: boolean;
  supabase_url?: string | null;
  supabase_anon_key?: string | null;
  device_name?: string | null;
  cloud_profile_id?: string | null;
  cloud_profile_ids?: Record<string, string>;
  cloud_sync_enabled: boolean;
  plan_code?: string | null;
  plan_status?: string | null;
  last_sync_at?: string | null;
}

export interface CloudSyncStatus {
  configured: boolean;
  enabled: boolean;
  cloud_sync_enabled: boolean;
  plan_code?: string | null;
  plan_status?: string | null;
  device_id: string;
  pending_app_changes: number;
  failed_app_changes: number;
  last_sync_at?: string | null;
}

export interface SyncStatus {
  device_id: string;
  protocol_version: string;
  pending_changes: number;
  failed_changes: number;
  last_pulled_revision: number;
}

export interface CloudPushRequest {
  p_local_device_id: string;
  p_device_name?: string | null;
  p_platform: string;
  p_app_version: string;
  p_batch_idempotency_key: string;
  p_profile_id?: string | null;
  p_changes: Array<{
    local_outbox_id: number;
    entity_type: string;
    entity_key: string;
    operation: "upsert" | "delete";
    payload_json: unknown;
    idempotency_key: string;
  }>;
}

export interface AppSettings {
  playerName?: string;
  localPrimaryId?: string | null;
  autoStart: boolean;
  rlPath: string | null;
  platform: "steam" | "epic" | null;
  defaultMatchType: MatchType;
  trackerApiKey?: string | null;
  trackerPlatform?: string | null;
  trackerUsername?: string | null;
  rapidApiKey?: string | null;
  rapidApiEnabled?: boolean;
  trackerAutoRefresh?: boolean;
  trackerRefreshIntervalMin?: number;
  sessionGapMinutes?: number;
  kickoffGoalThresholdSeconds?: number;
  overlayEnabled?: boolean;
  overlayOpacity?: number;
  overlayPositionX?: number;
  overlayPositionY?: number;
  overlayWidth?: number;
  overlayHeight?: number;
  overlayShowScore?: boolean;
  overlayShowPlayers?: boolean;
  overlayShowStats?: boolean;
  overlayShowTimer?: boolean;
  overlayFontScale?: string;
  overlayClickthrough?: boolean;
  overlayPlayerScope?: "all" | "team";
  overlayShowNames?: boolean;
  overlayShowPlayerScore?: boolean;
  overlayShowBoost?: boolean;
  overlayShowMmr?: boolean;
  overlayShowSpeed?: boolean;
  gameRunning?: boolean;
  warnOnProfileMismatch?: boolean;
  autoSwitchProfileOnExactMatch?: boolean;
  autoSyncOnMatchEnd?: boolean;
}

// ─── Overlay Window ─────────────────────────────────────────────────────────

export interface OverlayWindowState {
  visible: boolean;
  clickthrough: boolean;
  opacity: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

export interface OverlayDisplaySettings {
  showScore: boolean;
  showPlayers: boolean;
  showStats: boolean;
  showTimer: boolean;
  fontScale: "small" | "medium" | "large";
  opacity: number;
  playerScope: "all" | "team";
  showNames: boolean;
  showPlayerScore: boolean;
  showBoost: boolean;
  showMmr: boolean;
  showSpeed: boolean;
}

export type OverlayPositionPreset =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "custom";

export interface OverlayConfigForm {
  enabled: boolean;
  opacity: number;
  positionPreset: OverlayPositionPreset;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  showScore: boolean;
  showPlayers: boolean;
  showStats: boolean;
  showTimer: boolean;
  fontScale: "small" | "medium" | "large";
  clickthrough: boolean;
  playerScope: "all" | "team";
  showNames: boolean;
  showPlayerScore: boolean;
  showBoost: boolean;
  showMmr: boolean;
  showSpeed: boolean;
}

export interface UpdateInfo {
  version: string;
  notes: string;
  date: string;
  mandatory: boolean;
}

export interface StorageStats {
  totalMatches: number;
  totalEvents: number;
  databaseSizeBytes: number;
  oldestMatchDate: number | null;
  dbPath?: string | null;
}

export interface ToastItem {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  duration?: number;
}

// ─── Tracker Network ─────────────────────────────────────────────────────────

export type TrackerPlatform = "epic" | "steam" | "psn" | "xbl" | "switch";

export interface RankTier {
  index: number;
  name: string;
}

export interface RankDivision {
  index: number;
  name: string;
}

export interface RankInfo {
  tier: RankTier;
  division: RankDivision;
  imageUrl: string | null;
}

export interface PlaylistStats {
  rank: RankInfo | null;
  mmr: number | null;
  matchesPlayed: number | null;
  winStreak: number | null;
  loseStreak: number | null;
}

export interface OverviewStats {
  assists: number | null;
  goals: number | null;
  goalShotRatio: number | null;
  mvps: number | null;
  saves: number | null;
  shots: number | null;
  wins: number | null;
  seasonRank: RankInfo | null;
}

export interface RankedPlaylists {
  duel: PlaylistStats | null;
  double: PlaylistStats | null;
  standard: PlaylistStats | null;
}

export interface ExtraPlaylists {
  dropshot: PlaylistStats | null;
  hoops: PlaylistStats | null;
  rumble: PlaylistStats | null;
  snowday: PlaylistStats | null;
}

export interface LinkedAccount {
  platform: string;
  username: string;
}

export interface TrackerStats {
  overview: OverviewStats;
  ranked: RankedPlaylists;
  extra: ExtraPlaylists;
  unranked: PlaylistStats | null;
  totalMatchesPlayed: number | null;
}

export interface TrackerProfile {
  platform: string;
  username: string;
  avatarUrl: string | null;
  countryCode: string | null;
  linkedAccounts: LinkedAccount[];
  stats: TrackerStats;
}

export interface TrackerSettings {
  apiKey: string;
  platform: TrackerPlatform;
  username: string;
  autoRefresh: boolean;
  refreshIntervalMin: number;
}

export interface LiveMmrPlayer {
  primaryId: string;
  playerName: string;
  platform: string;
  identifier: string;
  playlist: string | null;
  mmr: number | null;
  rankName: string | null;
  division: string | null;
  matchesPlayed: number | null;
  source: string | null;
  cached: boolean;
  estimated: boolean;
  stale: boolean;
  estimateMatchesSinceRefresh: number | null;
  updatedAt: string | null;
  error: string | null;
}

export interface LiveMmrSnapshot {
  playlist: string | null;
  playlistCandidates: string[];
  playlistConfidence: string;
  fetchedAt: string;
  players: LiveMmrPlayer[];
}

export interface RlInstallation {
  path: string;
  platform: "steam" | "epic";
  valid: boolean;
}

// ─── Player Directory ────────────────────────────────────────────────────────

export interface HeadToHeadRecord {
  wins_against: number;
  losses_against: number;
  wins_together: number;
  losses_together: number;
}

export interface PlayerDirectoryEntry {
  player_id: number;
  primary_id: string;
  name: string;
  total_matches: number;
  matches_as_teammate: number;
  matches_as_opponent: number;
  first_seen: string;
  last_seen: string;
  wins_together: number;
  losses_together: number;
  wins_against: number;
  losses_against: number;
  avg_score_teammate: number;
  avg_goals_teammate: number;
  avg_assists_teammate: number;
}

export interface PlayerDetailRecord {
  player_id: number;
  primary_id: string;
  name: string;
  total_matches: number;
  matches_as_teammate: number;
  matches_as_opponent: number;
  first_seen: string;
  last_seen: string;
  wins_together: number;
  losses_together: number;
  wins_against: number;
  losses_against: number;
  total_goals_together: number;
  total_assists_together: number;
  total_saves_together: number;
  total_shots_together: number;
  total_goals_against: number;
  total_assists_against: number;
  total_saves_against: number;
  total_shots_against: number;
  recent_matches: PlayerMatchEntry[];
}

export interface PlayerMatchEntry {
  match_id: number;
  match_guid: string;
  start_time: string;
  arena: string | null;
  playlist: string | null;
  relationship: "teammate" | "opponent";
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  score: number;
  demos: number;
}

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
}

// ─── Friends ─────────────────────────────────────────────────────────────────

export interface FriendRecord {
  id: number;
  player_id: number;
  primary_id: string;
  name: string;
  tag: string | null;
  created_at: string;
}

// ─── User Presets ────────────────────────────────────────────────────────────

export interface CameraSettings {
  fov: number;
  height: number;
  angle: number;
  distance: number;
  stiffness: number;
  swivelSpeed: number;
  transitionSpeed: number;
  ballCamera: string;
  cameraShake: string;
}

export interface ControlSettings {
  powerslide: string;
  airRollLeft: string;
  airRollRight: string;
  boost: string;
  jump: string;
  ballCam: string;
  brake: string;
  throttle: string;
}

export interface DeadzoneSettings {
  deadzoneShape: string;
  deadzone: number;
  dodgeDeadzone: number;
  aerialSensitivity: number;
  steeringSensitivity: number;
}

export interface HardwareSettings {
  controller: string;
  monitor: string;
  headset: string;
}

export interface UserPreset {
  id: number;
  name: string;
  description?: string | null;
  camera?: CameraSettings | null;
  controls?: ControlSettings | null;
  deadzone?: DeadzoneSettings | null;
  hardware?: HardwareSettings | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPresetInput {
  id?: number;
  name: string;
  description?: string | null;
  camera?: CameraSettings | null;
  controls?: ControlSettings | null;
  deadzone?: DeadzoneSettings | null;
  hardware?: HardwareSettings | null;
}

// ─── Share ───────────────────────────────────────────────────────────────────

export type ShareType = "match" | "session" | "day" | "week" | "config";

export interface ShareContext {
  type: ShareType;
  title: string;
  subtitle?: string;
  username?: string;
  stats: ShareStat[];
  friendsPresent?: string[];
  teamScore?: number;
  opponentScore?: number;
  win?: boolean;
  dateLabel: string;
  matchPlayers?: SharePlayer[];
}

export interface ShareStat {
  label: string;
  value: string;
  highlight?: boolean;
}

export interface SharePlayer {
  name: string;
  score: number;
  goals: number;
  assists: number;
  saves: number;
  isLocal: boolean;
}

export interface SharePlayer {
  name: string;
  score: number;
  goals: number;
  assists: number;
  saves: number;
  isLocal: boolean;
}

export interface ShareStat {
  label: string;
  value: string;
  highlight?: boolean;
}

export interface SharePlayer {
  name: string;
  score: number;
  goals: number;
  assists: number;
  saves: number;
  isLocal: boolean;
}
