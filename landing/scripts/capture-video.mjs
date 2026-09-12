/**
 * Records a short, silent screen capture of the LIVE dashboard with match
 * events arriving in real time. Used as the hero's ambient loop.
 *
 * Run from `landing/`: `node scripts/capture-video.mjs`
 * Output: `landing/assets-src/video/*.webm` (+ optimized mp4 via ffmpeg).
 */
import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(__dirname, "../assets-src/video");
const RAW_DIR = path.join(OUT_DIR, "_raw");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });

const VIEWPORT = { width: 1440, height: 860 };

// The fixture state mirrors the screenshot fixtures so the video and the
// stills tell the same story.
const state = {
  match_guid: "LND-LIVE-7F3A9C21",
  arena: "DFH Stadium",
  is_online: true,
  is_overtime: false,
  time_remaining: 184,
  score_blue: 1,
  score_orange: 1,
  ball_speed: 1412,
  player_count: 4,
  match_type: "online",
  training_elapsed_seconds: null,
  players: [
    { id: "76561198000000042", name: "Nico", team: 0, score: 318, goals: 1, shots: 3, assists: 1, saves: 2, touches: 48, demos: 1, speed: 2201, boost: 68 },
    { id: "76561198000000117", name: "Tomi", team: 0, score: 355, goals: 1, shots: 2, assists: 1, saves: 1, touches: 41, demos: 0, speed: 2140, boost: 52 },
    { id: "76561198000000231", name: "Kaze", team: 1, score: 388, goals: 1, shots: 4, assists: 0, saves: 3, touches: 52, demos: 2, speed: 2288, boost: 44 },
    { id: "76561198000000345", name: "Rulo", team: 1, score: 290, goals: 0, shots: 1, assists: 1, saves: 1, touches: 37, demos: 0, speed: 2105, boost: 71 },
  ],
};

const LIVE_MMR = {
  playlist: "Ranked Doubles",
  playlistCandidates: ["Ranked Doubles"],
  playlistConfidence: "high",
  fetchedAt: new Date().toISOString(),
  players: state.players.map((p, index) => ({
    primaryId: p.id,
    playerName: p.name,
    platform: index % 2 === 0 ? "steam" : "epic",
    identifier: p.id,
    playlist: "Ranked Doubles",
    mmr: [1187, 1204, 1241, 1152][index],
    rankName: ["Diamond III", "Diamond III", "Champion I", "Diamond II"][index],
    division: ["Division III", "Division IV", "Division I", "Division I"][index],
    matchesPlayed: [428, 391, 512, 233][index],
    source: "rlstats-webview",
    cached: false,
    estimated: false,
    stale: false,
    estimateMatchesSinceRefresh: null,
    updatedAt: new Date().toISOString(),
    warning: null,
    error: null,
  })),
  exactCount: 4,
  historicalCount: 0,
  estimatedCount: 0,
  unavailableCount: 0,
  averageMmr: 1196,
};

const BACKGROUND = path.join(REPO, "public/arenas/cs_p.webp");

let backdropDataUrl = null;
async function getBackdrop() {
  if (backdropDataUrl) return backdropDataUrl;
  const buffer = await sharp(BACKGROUND)
    .resize(VIEWPORT.width, VIEWPORT.height, { fit: "cover" })
    .modulate({ brightness: 0.3, saturation: 0.8 })
    .blur(10)
    .webp({ quality: 60 })
    .toBuffer();
  backdropDataUrl = `data:image/webp;base64,${buffer.toString("base64")}`;
  return backdropDataUrl;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1.5,
    colorScheme: "dark",
    locale: "es-ES",
    recordVideo: { dir: RAW_DIR, size: VIEWPORT },
  });

  await context.addInitScript(
    ({ initialState, mmr, backdrop }) => {
      window.localStorage.setItem("rl-theme", "dark");
      window.localStorage.setItem("rl-lang", "es");
      window.localStorage.setItem(
        "settings-store",
        JSON.stringify({
          state: {
            autoStart: true,
            playerName: "Nico",
            hasCompletedOnboarding: true,
            onboardingVersion: 2,
            rlPath: "C:/RocketLeague",
            platform: "steam",
            defaultMatchType: "ranked",
          },
          version: 0,
        }),
      );

      const callbacks = new Map();
      const eventListeners = {};
      let nextCallbackId = 1;
      let nextEventId = 1;

      const registerCallback = (callback, once = false) => {
        const id = nextCallbackId++;
        callbacks.set(id, (data) => {
          if (once) callbacks.delete(id);
          if (typeof callback === "function") callback(data);
        });
        return id;
      };

      const responses = {
        get_settings_cmd: () => ({
          player_name: "Nico",
          local_primary_id: "76561198000000042",
          auto_start: true,
          port: 49123,
          data_retention_days: 0,
          rl_path: "C:/RocketLeague",
          rl_paths: ["C:/RocketLeague"],
          platform: "steam",
          active_platform: "steam",
          theme: "dark",
          language: "es",
          default_match_type: "ranked",
          game_running: true,
          overlay_enabled: true,
        }),
        set_settings_cmd: () => null,
        get_connection_status: () => ({
          connected: true,
          address: "127.0.0.1:49123",
          last_error: null,
          reconnect_attempts: 0,
          game_running: true,
        }),
        get_live_state: () => initialState,
        get_live_head_to_head: () => ({}),
        fetch_live_mmr_snapshot: () => mmr,
        set_session_mmr_snapshot: () => null,
        set_local_mmr: () => null,
        get_mmr_provider_health: () => [],
        list_profiles_cmd: () => [
          {
            id: "landing-profile",
            name: "Principal",
            createdAt: new Date().toISOString(),
            player_name: "Nico",
            local_primary_id: "76561198000000042",
          },
        ],
        get_active_profile_cmd: () => ({
          id: "landing-profile",
          name: "Principal",
          createdAt: new Date().toISOString(),
          player_name: "Nico",
          local_primary_id: "76561198000000042",
        }),
        get_matches: () => ({ matches: [] }),
        get_friends_cmd: () => [],
        get_daily_rollups: () => ({ rollups: [] }),
        get_analytics: () => ({ summary: null, rollups: [], sessions: [] }),
        get_storage_stats_cmd: () => ({}),
        get_player_directory: () => ({ players: [] }),
        get_cloud_config_cmd: () => ({ enabled: false, cloud_sync_enabled: false }),
        get_cloud_sync_status_cmd: () => ({ configured: false, enabled: false, cloud_sync_enabled: false, device_id: "d", pending_app_changes: 0, failed_app_changes: 0 }),
        get_profile_sync_status_cmd: () => ({ device_id: "d", protocol_version: "1", pending_changes: 0, failed_changes: 0, last_pulled_revision: 0 }),
        get_overlay_server_status: () => ({ running: true, port: 9528, connected_clients: 1, token: "t" }),
        get_overlay_urls: () => [],
        get_overlay_window_state: () => ({ visible: false, clickthrough: true, opacity: 0.9, position_x: 0, position_y: 0, width: 520, height: 220 }),
        report_frontend_error: () => null,
      };

      const invoke = async (cmd, args) => {
        if (cmd === "plugin:event|listen") {
          const event = String(args?.event ?? "");
          const handler = Number(args?.handler ?? 0);
          if (event && handler) (eventListeners[event] ??= []).push(handler);
          return nextEventId++;
        }
        if (cmd === "plugin:event|unlisten") return null;
        const responder = responses[cmd];
        return responder ? responder(args) : null;
      };

      const target = window;
      target.__TAURI_INTERNALS__ = {
        invoke,
        transformCallback: registerCallback,
        unregisterCallback: (id) => callbacks.delete(id),
        runCallback: (id, data) => callbacks.get(id)?.(data),
        callbacks,
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { windowLabel: "main", label: "main" },
          windows: [],
          webviews: [],
        },
        convertFileSrc: (p) => p,
        plugins: {},
      };
      target.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };

      target.__emitTauriEvent = (event, payload) => {
        const handlers = eventListeners[event] ?? [];
        for (const handlerId of handlers) {
          callbacks.get(handlerId)?.({ event, id: nextEventId++, payload });
        }
        return handlers.length;
      };

      // Backdrop behind a slightly transparent app frame gives the recording
      // depth without pretending to be gameplay.
      const style = document.createElement("style");
      style.textContent = `
        body { background: #0a0a0d url("${backdrop}") center/cover no-repeat fixed; }
        #root { background: transparent; }
        #root > div { background: color-mix(in oklch, var(--canvas) 88%, transparent) !important; }
      `;
      document.addEventListener("DOMContentLoaded", () => {
        document.head.appendChild(style);
      });
    },
    { initialState: state, mmr: LIVE_MMR, backdrop: await getBackdrop() },
  );

  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4183/", { waitUntil: "load" });
  await page.waitForTimeout(1800);

  const emit = (event, payload) =>
    page.evaluate(
      ([name, data]) => window.__emitTauriEvent(name, data),
      [event, payload],
    );

  const pushState = (patch = {}) => {
    Object.assign(state, patch);
    return emit("live-update", state);
  };

  // Chronology: a save, a goal for blue, the crowd-pleasing demo, then a
  // late equalizer — enough movement for a ~12 s loop.
  const script = [
    {
      delay: 1200,
      run: async () => {
        await emit("live-event", {
          id: "v1",
          type: "StatfeedEvent",
          timestamp: Math.floor(Date.now() / 1000),
          data: { eventName: "Save", mainTargetName: "Nico" },
        });
      },
    },
    {
      delay: 1400,
      run: async () => {
        state.score_blue = 2;
        state.players[0].goals = 2;
        state.players[0].score = 412;
        state.players[0].shots = 4;
        state.players[1].assists = 2;
        await emit("live-event", {
          id: "v2",
          type: "GoalScored",
          timestamp: Math.floor(Date.now() / 1000),
          data: { scorerName: "Nico", assisterName: "Tomi", teamNum: 0 },
        });
        await pushState({});
      },
    },
    {
      delay: 1600,
      run: async () => {
        state.players[0].demos = 2;
        state.players[0].score = 436;
        await emit("live-event", {
          id: "v3",
          type: "StatfeedEvent",
          timestamp: Math.floor(Date.now() / 1000),
          data: { eventName: "Demolish", mainTargetName: "Kaze" },
        });
        await pushState({});
      },
    },
    {
      delay: 1600,
      run: async () => {
        state.score_orange = 2;
        state.players[2].goals = 2;
        state.players[2].score = 431;
        await emit("live-event", {
          id: "v4",
          type: "GoalScored",
          timestamp: Math.floor(Date.now() / 1000),
          data: { scorerName: "Kaze", teamNum: 1 },
        });
        await pushState({});
      },
    },
    {
      delay: 1600,
      run: async () => {
        await emit("live-event", {
          id: "v5",
          type: "StatfeedEvent",
          timestamp: Math.floor(Date.now() / 1000),
          data: { eventName: "EpicSave", mainTargetName: "Tomi" },
        });
      },
    },
    {
      delay: 1500,
      run: async () => {
        await pushState({ time_remaining: 96 });
      },
    },
  ];

  for (const step of script) {
    await page.waitForTimeout(step.delay);
    await step.run();
    // Tick the clock between beats so the timer looks alive.
    await pushState({ time_remaining: Math.max(40, state.time_remaining - 14) });
  }

  await page.waitForTimeout(1500);
  await page.close();

  await context.close();
  await browser.close();

  // Playwright writes a random filename; normalize it.
  const files = readdirSync(RAW_DIR).filter((name) => name.endsWith(".webm"));
  const newest = files
    .map((name) => ({ name, mtime: Number(readdirSync(RAW_DIR).length) }))
    .slice(-1)[0];
  void newest;
  const source = path.join(RAW_DIR, files[files.length - 1]);
  const target = path.join(OUT_DIR, "live-dashboard.webm");
  renameSync(source, target);
  console.log(`[video] wrote ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
