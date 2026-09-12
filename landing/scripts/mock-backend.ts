/**
 * Shared Tauri IPC mock, used by both the marketing screenshot spec
 * (`capture.spec.ts`) and the demo recorder (`record-demos.ts`).
 *
 * Keeps the two in sync: adding a command here fixes both tools at once, and
 * neither can silently drift into rendering empty states.
 *
 * The mock intercepts `plugin:event|listen` and records the registered handler
 * ids so the caller can later deliver real events (`match-finished`,
 * `live-event`, ...) exactly as the Rust core would.
 */
import type { Page } from "@playwright/test";
import * as fx from "./fixtures.ts";

/** Shape installed on `window` for the specs to drive the app. */
export interface MockBridge {
  emit: (event: string, payload: unknown) => void;
  listenerCount: (event: string) => number;
}

declare global {
  interface Window {
    __emitTauriEvent?: (event: string, payload: unknown) => number;
    __tauriMockListenerCount?: (event: string) => number;
  }
}

interface InstallOptions {
  /** UI language; the app reads `rl-lang` from localStorage. */
  lang?: "es" | "en" | "pt";
  /** Theme applied before first paint. */
  theme?: "dark" | "light";
  /** Overrides merged over the default fixtures before install. */
  overrides?: Record<string, unknown>;
}

export async function installFixtureBackend(
  page: Page,
  options: InstallOptions = {},
): Promise<void> {
  const { lang = "es", theme = "dark", overrides = {} } = options;

  await page.addInitScript(
    ({ fixtures, settingsStore, lang: chosenLang, theme: chosenTheme, overrides: extra }) => {
      const f = fixtures as typeof fx;
      window.localStorage.setItem("rl-theme", chosenTheme);
      window.localStorage.setItem("rl-lang", chosenLang);
      window.localStorage.setItem("settings-store", JSON.stringify(settingsStore));

      const callbacks = new Map<number, (data: unknown) => void>();
      let nextCallbackId = 1;
      let nextEventId = 1;
      const eventListeners: Record<string, number[]> = {};

      const registerCallback = (
        callback: (data: unknown) => void,
        once = false,
      ): number => {
        const id = nextCallbackId++;
        callbacks.set(id, (data) => {
          if (once) callbacks.delete(id);
          if (typeof callback === "function") callback(data);
        });
        return id;
      };

      const responses: Record<string, (args?: Record<string, unknown>) => unknown> = {
        get_settings_cmd: () => f.SETTINGS,
        set_settings_cmd: () => null,
        get_connection_status: () => f.CONNECTION_STATUS,
        get_live_state: () => f.LIVE_STATE,
        get_live_head_to_head: () => f.LIVE_HEAD_TO_HEAD,
        fetch_live_mmr_snapshot: () => f.LIVE_MMR_SNAPSHOT,
        set_session_mmr_snapshot: () => null,
        set_local_mmr: () => null,
        get_mmr_provider_health: () => [
          {
            provider: "rlstats-webview",
            lastStatus: "ok",
            lastError: null,
            lastOkAt: new Date().toISOString(),
            lastAttemptAt: new Date().toISOString(),
            latencyMs: 1720,
            successCount: 34,
            failureCount: 2,
          },
        ],
        test_mmr_provider: () => ({
          provider: "rlstats-webview",
          ok: true,
          message: "6 playlists leídas en 1720 ms",
          latencyMs: 1720,
          entries: [],
        }),
        get_matches: () => ({ matches: f.MATCHES }),
        get_match_detail: () => f.MATCH_DETAIL,
        delete_match_cmd: () => null,
        update_match_cmd: () => null,
        set_match_mood_cmd: () => null,
        get_friends_cmd: () => f.FRIENDS,
        is_friend_cmd: () => true,
        add_friend_cmd: () => null,
        remove_friend_cmd: () => null,
        list_profiles_cmd: () => [f.PROFILE],
        get_active_profile_cmd: () => f.PROFILE,
        create_profile_cmd: () => f.PROFILE,
        delete_profile_cmd: () => null,
        switch_profile_cmd: () => null,
        rename_profile_cmd: () => null,
        update_profile_player_identity_cmd: () => null,
        find_matching_profile_cmd: () => null,
        get_profile_comparison_cmd: () => ({ available: false }),
        get_daily_rollups: () => ({ rollups: f.ROLLUPS }),
        get_analytics: () => ({
          summary: f.ANALYTICS_SUMMARY,
          rollups: f.ROLLUPS,
          sessions: f.SESSIONS,
        }),
        get_sessions: () => f.SESSIONS,
        get_session_matches: () => f.MATCHES.map(toSessionMatch),
        get_insights: () => f.INSIGHTS,
        get_session_curve: () => f.SESSION_CURVE,
        get_teammate_stats: () => f.TEAMMATE_STATS,
        get_custom_breakdown: (args?: Record<string, unknown>) => {
          const dimension = (args?.dimension as string) ?? "hour";
          if (dimension === "mood") return f.MOOD_BREAKDOWN;
          return f.HOUR_BREAKDOWN;
        },
        get_training_analytics: () => f.TRAINING_ANALYTICS,
        get_mmr_history: () => f.MMR_HISTORY,
        get_analytics_comparison: () => f.COMPARISON,
        get_storage_stats_cmd: () => f.STORAGE_STATS,
        get_player_directory: () => f.PLAYER_DIRECTORY,
        get_player_detail: (args?: Record<string, unknown>) =>
          f.PLAYER_DETAILS[String(args?.playerId ?? "")] ?? null,
        get_player_detail_by_primary_id: (args?: Record<string, unknown>) => {
          const primaryId = String(args?.primaryId ?? "");
          const match = Object.values(f.PLAYER_DETAILS).find(
            (entry) =>
              (entry as { primary_id?: string }).primary_id === primaryId,
          );
          return match ?? null;
        },
        get_player_analytics_matches: () => ({ matches: f.PLAYER_ANALYTICS_MATCHES }),
        get_player_analytics_summary: () => f.ANALYTICS_SUMMARY,
        list_training_packs: () => f.TRAINING_PACKS,
        upsert_training_pack: () => null,
        delete_training_pack: () => null,
        get_cached_profile: () => null,
        get_cached_rlstats_profile: () => null,
        fetch_tracker_profile: () => null,
        refresh_tracker_profile: () => null,
        detect_local_accounts_cmd: () => [],
        detect_rl_path: () => [
          {
            path: f.SETTINGS.rl_path,
            platform: "steam",
            valid: true,
            source: "steam-library",
            configured: true,
          },
        ],
        inspect_rl_path: () => null,
        configure_rl_ini_cmd: () => null,
        configure_rl_ini_all_cmd: () => [],
        get_overlay_server_status: () => f.OVERLAY_SERVER_STATUS,
        get_overlay_urls: () => [
          { id: "enhanced", name: "Enhanced", description: "Paquete broadcast completo", url: "http://127.0.0.1:9528/overlays/enhanced?token=lnd0demo" },
          { id: "scoreboard", name: "Scoreboard", description: "Marcador con reloj y OT", url: "http://127.0.0.1:9528/overlays/scoreboard?token=lnd0demo" },
          { id: "player-stats", name: "Player Stats", description: "Tablas por jugador", url: "http://127.0.0.1:9528/overlays/player-stats?token=lnd0demo" },
          { id: "event-feed", name: "Event Feed", description: "Feed de eventos en vivo", url: "http://127.0.0.1:9528/overlays/event-feed?token=lnd0demo" },
          { id: "alerts", name: "Alerts", description: "Alertas de gol/atajada/demo", url: "http://127.0.0.1:9528/overlays/alerts?token=lnd0demo" },
          { id: "all-in-one", name: "All-in-One", description: "Scoreboard + equipos + feed", url: "http://127.0.0.1:9528/overlays/all-in-one?token=lnd0demo" },
        ],
        get_overlay_state: () => ({}),
        get_overlay_window_state: () => ({
          visible: true,
          clickthrough: true,
          opacity: 0.9,
          position_x: 24,
          position_y: 24,
          width: 520,
          height: 220,
        }),
        start_overlay_server: () => f.OVERLAY_SERVER_STATUS,
        stop_overlay_server: () => null,
        create_overlay_window: () => ({
          visible: true,
          clickthrough: true,
          opacity: 0.9,
          position_x: 24,
          position_y: 24,
          width: 520,
          height: 220,
        }),
        destroy_overlay_window: () => null,
        toggle_overlay_enabled: () => null,
        update_overlay_position: () => null,
        update_overlay_size: () => null,
        update_overlay_opacity: () => null,
        set_overlay_clickthrough: () => null,
        set_overlay_interactive: () => null,
        notify_overlay_settings_changed: () => null,
        get_cloud_config_cmd: () => f.CLOUD_CONFIG,
        get_cloud_sync_status_cmd: () => f.CLOUD_SYNC_STATUS,
        get_profile_sync_status_cmd: () => f.PROFILE_SYNC_STATUS,
        get_last_pulled_revision_cmd: () => 0,
        set_last_pulled_revision_cmd: () => null,
        get_pending_prompt: () => null,
        get_prompt_state: () => null,
        hide_prompt: () => null,
        report_frontend_error: () => null,
        recompute_kickoff_goals: () => ({
          goalsScanned: 0,
          kickoffFound: 0,
          matchesUpdated: 0,
          unattributed: 0,
          estimatedMatches: 0,
          matchesWithoutData: 0,
        }),
        preview_data_retention_cmd: () => ({ matches_to_delete: 0 }),
        list_database_backups_cmd: () => [],
        prune_sync_outbox_cmd: () => null,
        ...extra,
      };

      const invoke = async (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "plugin:event|listen") {
          const event = String(args?.event ?? "");
          const handler = Number(args?.handler ?? 0);
          if (event && handler) (eventListeners[event] ??= []).push(handler);
          return nextEventId++;
        }
        if (cmd === "plugin:event|unlisten") return null;
        const responder = responses[cmd];
        if (!responder) return null;
        return responder(args);
      };

      const target = window as unknown as Record<string, unknown>;
      target.__TAURI_INTERNALS__ = {
        invoke,
        transformCallback: registerCallback,
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
        runCallback: (id: number, data: unknown) => {
          callbacks.get(id)?.(data);
        },
        callbacks,
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { windowLabel: "main", label: "main" },
          windows: [],
          webviews: [],
        },
        convertFileSrc: (path: string) => path,
        plugins: {},
      };
      target.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: () => undefined,
      };

      window.__emitTauriEvent = (event: string, payload: unknown) => {
        const handlers = eventListeners[event] ?? [];
        for (const handlerId of handlers) {
          callbacks.get(handlerId)?.({ event, id: nextEventId++, payload });
        }
        return handlers.length;
      };
      window.__tauriMockListenerCount = (event: string) =>
        (eventListeners[event] ?? []).length;
    },
    {
      fixtures: {
        SETTINGS: fx.SETTINGS,
        CONNECTION_STATUS: fx.CONNECTION_STATUS,
        LIVE_STATE: fx.LIVE_STATE,
        LIVE_HEAD_TO_HEAD: fx.LIVE_HEAD_TO_HEAD,
        LIVE_MMR_SNAPSHOT: fx.LIVE_MMR_SNAPSHOT,
        MATCHES: fx.MATCHES,
        MATCH_DETAIL: fx.MATCH_DETAIL,
        FRIENDS: fx.FRIENDS,
        PROFILE: fx.PROFILE,
        ROLLUPS: fx.ROLLUPS,
        ANALYTICS_SUMMARY: fx.ANALYTICS_SUMMARY,
        SESSIONS: fx.SESSIONS,
        INSIGHTS: fx.INSIGHTS,
        SESSION_CURVE: fx.SESSION_CURVE,
        TEAMMATE_STATS: fx.TEAMMATE_STATS,
        MOOD_BREAKDOWN: fx.MOOD_BREAKDOWN,
        HOUR_BREAKDOWN: fx.HOUR_BREAKDOWN,
        TRAINING_ANALYTICS: fx.TRAINING_ANALYTICS,
        MMR_HISTORY: fx.MMR_HISTORY,
        COMPARISON: fx.COMPARISON,
        STORAGE_STATS: fx.STORAGE_STATS,
        PLAYER_DIRECTORY: fx.PLAYER_DIRECTORY,
        PLAYER_DETAILS: fx.PLAYER_DETAILS,
        PLAYER_ANALYTICS_MATCHES: fx.PLAYER_ANALYTICS_MATCHES,
        TRAINING_PACKS: fx.TRAINING_PACKS,
        OVERLAY_SERVER_STATUS: fx.OVERLAY_SERVER_STATUS,
        CLOUD_CONFIG: fx.CLOUD_CONFIG,
        CLOUD_SYNC_STATUS: fx.CLOUD_SYNC_STATUS,
        PROFILE_SYNC_STATUS: fx.PROFILE_SYNC_STATUS,
      },
      settingsStore: fx.SETTINGS_STORE,
      lang,
      theme,
      overrides,
    },
  );
}

/** Maps a fixture match into the `SessionMatch` shape the session detail expects. */
function toSessionMatch(match: (typeof fx.MATCHES)[number]) {
  return {
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
    local_team: match.local_team_num,
    is_win: match.winner === match.local_team_num,
    goal_diff: match.score_blue - match.score_orange,
    mood: match.mood,
    players: [],
  };
}
