/**
 * Captures marketing screenshots of the real RL Stats UI.
 *
 * Run from `landing/`: `pnpm assets:capture`
 * Output: `landing/assets-src/screens/*.png` (2x), later optimized to webp.
 */
import { expect, test, type Page } from "@playwright/test";
import * as fx from "./fixtures";

const SCREENS_DIR = "assets-src/screens";

/**
 * Installs a Tauri IPC mock backed by the rich fixtures. Unlike the dev mock
 * in `src/dev/mockBackend.ts`, this returns populated analytics so every
 * screen shows real-looking content instead of empty states.
 */
async function installFixtureBackend(page: Page): Promise<void> {
  await page.addInitScript(
    ({ fixtures, settingsStore }) => {
      const f = fixtures as typeof import("./fixtures");
      window.localStorage.setItem("rl-theme", "dark");
      window.localStorage.setItem("rl-lang", "es");
      window.localStorage.setItem("settings-store", JSON.stringify(settingsStore));

      const callbacks = new Map<number, (data: unknown) => void>();
      let nextCallbackId = 1;
      let nextEventId = 1;
      // event name → callback ids registered through `plugin:event|listen`,
      // so the spec can emit real Tauri events after React mounts.
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
        get_session_matches: () => [],
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
        get_player_detail: () => null,
        get_player_detail_by_primary_id: () => null,
        get_player_analytics_matches: () => ({ matches: [] }),
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
      };

      const invoke = async (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "plugin:event|listen") {
          const event = String(args?.event ?? "");
          const handler = Number(args?.handler ?? 0);
          if (event && handler) {
            (eventListeners[event] ??= []).push(handler);
          }
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

      // Test helper: deliver an event exactly like the Rust core would.
      target.__emitTauriEvent = (event: string, payload: unknown) => {
        const handlers = eventListeners[event] ?? [];
        for (const handlerId of handlers) {
          callbacks.get(handlerId)?.({ event, id: nextEventId++, payload });
        }
        return handlers.length;
      };
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
        TRAINING_PACKS: fx.TRAINING_PACKS,
        OVERLAY_SERVER_STATUS: fx.OVERLAY_SERVER_STATUS,
        CLOUD_CONFIG: fx.CLOUD_CONFIG,
        CLOUD_SYNC_STATUS: fx.CLOUD_SYNC_STATUS,
        PROFILE_SYNC_STATUS: fx.PROFILE_SYNC_STATUS,
      },
      settingsStore: fx.SETTINGS_STORE,
    },
  );
}

async function settle(page: Page, ms = 650): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(ms);
}

/**
 * Scrolls the app's real scroll container (`<main>`, see AppShell) until an
 * element matching `pattern` is visible. Panels below the fold mount lazily
 * (LazyMount), so a single `scrollIntoView` on a not-yet-rendered node is a
 * no-op — this scrolls step by step and waits for the node to appear.
 */
async function scrollToText(page: Page, pattern: string, maxSteps = 24): Promise<boolean> {
  for (let step = 0; step < maxSteps; step += 1) {
    const found = await page.evaluate((source: string) => {
      const re = new RegExp(source, "i");
      // Prefer real headings: searching every span picks up sidebar/nav labels
      // and scrolls to the wrong place.
      const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4"));
      const fallback = Array.from(document.querySelectorAll("p, label"));
      const target =
        headings.find((node) => re.test(node.textContent ?? "")) ??
        fallback.find((node) => re.test(node.textContent ?? ""));
      if (!target) return false;
      const main = document.querySelector("main");
      if (main) {
        const rect = target.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();
        main.scrollTop += rect.top - mainRect.top - mainRect.height / 3;
      } else {
        target.scrollIntoView({ block: "center" });
      }
      return true;
    }, pattern);
    if (found) {
      await page.waitForTimeout(700);
      const visible = await page.evaluate((source: string) => {
        const re = new RegExp(source, "i");
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4"));
        const fallback = Array.from(document.querySelectorAll("p, label"));
        const target =
          headings.find((node) => re.test(node.textContent ?? "")) ??
          fallback.find((node) => re.test(node.textContent ?? ""));
        if (!target) return false;
        const rect = target.getBoundingClientRect();
        return rect.top >= 0 && rect.top < window.innerHeight * 0.85;
      }, pattern);
      if (visible) return true;
    }
    await page.evaluate(() => {
      const main = document.querySelector("main");
      if (main) main.scrollTop += Math.round(main.clientHeight * 0.75);
      else window.scrollBy(0, Math.round(window.innerHeight * 0.75));
    });
    await page.waitForTimeout(450);
  }
  return false;
}

async function shot(page: Page, name: string, options?: { fullPage?: boolean }): Promise<void> {
  await page.screenshot({
    path: `${SCREENS_DIR}/${name}.png`,
    fullPage: options?.fullPage ?? false,
    animations: "disabled",
  });
}

test.describe.configure({ mode: "serial" });

test("01 · live dashboard with MMR", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/");
  await expect(page.getByRole("navigation")).toBeVisible();
  await settle(page, 900);
  // Deliver a few real events so the event feed is not empty in the shot.
  await page.evaluate(() => {
    const emit = (window as unknown as {
      __emitTauriEvent: (event: string, payload: unknown) => number;
    }).__emitTauriEvent;
    const base = Math.floor(Date.now() / 1000);
    const events = [
      {
        id: "fx-evt-1",
        type: "GoalScored",
        timestamp: base - 96,
        data: {
          scorerName: "Kaze",
          assisterName: "Rulo",
          teamNum: 1,
        },
      },
      {
        id: "fx-evt-2",
        type: "StatfeedEvent",
        timestamp: base - 74,
        data: { eventName: "Save", mainTargetName: "Nico" },
      },
      {
        id: "fx-evt-3",
        type: "GoalScored",
        timestamp: base - 41,
        data: {
          scorerName: "Nico",
          assisterName: "Tomi",
          teamNum: 0,
        },
      },
      {
        id: "fx-evt-4",
        type: "StatfeedEvent",
        timestamp: base - 22,
        data: { eventName: "EpicSave", mainTargetName: "Tomi" },
      },
      {
        id: "fx-evt-5",
        type: "StatfeedEvent",
        timestamp: base - 8,
        data: { eventName: "Demolish", mainTargetName: "Nico" },
      },
    ];
    for (const event of events) emit("live-event", event);
  });
  await page.waitForTimeout(650);
  await shot(page, "01-live");
});

test("02 · history list", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/history");
  await settle(page);
  await shot(page, "02-history");
});

test("03 · match detail", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/history/1014");
  await settle(page, 900);
  await shot(page, "03-match-detail");
});

test("04 · analytics top (stats + performance + MMR)", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/analytics");
  await settle(page, 1400);
  await shot(page, "04-analytics-top");
});

test("05 · analytics insights", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/analytics");
  await settle(page, 1400);
  const ok = await scrollToText(page, "Análisis avanzado");
  expect(ok).toBe(true);
  await page.waitForTimeout(400);
  await shot(page, "05-analytics-insights");
});

test("06 · mood panel", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/analytics");
  await settle(page, 1400);
  const ok = await scrollToText(page, "El ánimo juega");
  expect(ok).toBe(true);
  await page.waitForTimeout(400);
  await shot(page, "06-mood-panel");
});

test("07 · session fatigue panel", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/analytics");
  await settle(page, 1400);
  const ok = await scrollToText(page, "Curva de sesión");
  expect(ok).toBe(true);
  await page.waitForTimeout(400);
  await shot(page, "07-fatigue-panel");
});

test("08 · players directory", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/players");
  await settle(page);
  await shot(page, "08-players");
});

test("09 · training packs", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/training-packs");
  await settle(page, 900);
  await shot(page, "09-training-packs");
});

test("10 · pro configs", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/pro-configs");
  await settle(page, 900);
  // The page opens with an empty detail pane and collapsed teams; expand one
  // and pick a player so the screenshot shows real camera/deadzone data.
  await page.getByRole("button", { name: /Team Vitality/i }).first().click({ timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  await page.getByText("zen", { exact: true }).first().click({ timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(900);
  await shot(page, "10-pro-configs");
});

test("11 · settings — MMR sources", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/settings?tab=game");
  await settle(page, 900);
  await shot(page, "11-settings-mmr");
});

test("12 · settings — OBS streaming", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/settings?tab=streaming");
  await settle(page, 1100);
  await shot(page, "12-settings-streaming");
});

test("13 · mood prompt modal (post-match)", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/");
  await settle(page, 800);
  // Fire the same event the Rust core emits when a match ends.
  await page.evaluate(() => {
    const emit = (window as unknown as {
      __emitTauriEvent: (event: string, payload: unknown) => number;
    }).__emitTauriEvent;
    emit("match-finished", {
      matchId: 1014,
      guid: "LND-1014-AA01",
      isTraining: false,
      winner: 0,
      scoreBlue: 4,
      scoreOrange: 2,
    });
  });
  await page.waitForTimeout(700);
  await shot(page, "13-mood-prompt");
});

test("14 · command palette", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/");
  await settle(page, 700);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(500);
  await shot(page, "14-command-palette");
});

test("15 · session summary modal", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/");
  await settle(page, 700);
  await page.evaluate(() => {
    const emit = (window as unknown as {
      __emitTauriEvent: (event: string, payload: unknown) => number;
    }).__emitTauriEvent;
    emit("session-summary", {
      matches: 9,
      wins: 6,
      losses: 3,
      streak: 3,
      goalsFor: 27,
      goalsAgainst: 19,
      durationSeconds: 5400,
      startedAt: new Date(Date.now() - 5400_000).toISOString(),
      bestHour: 18,
    });
  });
  await page.waitForTimeout(600);
  await shot(page, "15-session-summary");
});

test("16 · overlay window (in-app, always on top)", async ({ page }) => {
  await installFixtureBackend(page);
  await page.goto("/");
  await settle(page, 900);
  await page.evaluate(() => {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: string }; currentWebview: { label: string; windowLabel: string } };
        windows: unknown[];
        webviews: unknown[];
      };
    }).__TAURI_INTERNALS__;
    internals.metadata.currentWindow.label = "overlay";
    internals.metadata.currentWebview.label = "overlay";
    internals.metadata.currentWebview.windowLabel = "overlay";
  });
  await page.reload();
  await settle(page, 1200);
  await shot(page, "16-overlay-window");
});
