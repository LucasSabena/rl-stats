import { expect, test, type Page } from "@playwright/test";

async function installTauriMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "settings-store",
      JSON.stringify({
        state: {
          autoStart: false,
          playerName: "Smoke Tester",
          hasCompletedOnboarding: true,
          onboardingVersion: 2,
          rlPath: null,
          platform: "steam",
          defaultMatchType: "ranked",
        },
        version: 0,
      }),
    );

    const callbacks = new Map<number, (data: unknown) => void>();
    let nextCallbackId = 1;
    let nextEventId = 1;

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

    const zeroSummary = {
      totalMatches: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      avgScore: 0,
      avgGoals: 0,
      avgAssists: 0,
      avgSaves: 0,
      avgShots: 0,
      avgBoost: 0,
      totalGoals: 0,
      totalAssists: 0,
      totalSaves: 0,
      totalShots: 0,
      totalDemos: 0,
      totalConceded: 0,
      totalKickoffGoalsScored: 0,
      totalKickoffGoalsConceded: 0,
      avgKickoffGoalsScored: 0,
      avgKickoffGoalsConceded: 0,
      bestStreak: 0,
      currentStreak: 0,
      peakSpeed: 0,
      avgDuration: 0,
    };

    const settings = {
      player_name: "Smoke Tester",
      local_primary_id: "76561198000000000",
      auto_start: false,
      port: 49123,
      data_retention_days: 90,
      rl_path: null,
      rl_paths: [],
      platform: "steam",
      active_platform: "steam",
      theme: "dark",
      language: "es",
      default_match_type: "ranked",
      game_running: false,
      overlay_enabled: false,
      warn_on_profile_mismatch: false,
      auto_switch_profile_on_exact_match: false,
      auto_sync_on_match_end: false,
    };

    const profile = {
      id: "smoke-profile",
      name: "Principal",
      createdAt: new Date(0).toISOString(),
      player_name: "Smoke Tester",
      local_primary_id: "76561198000000000",
    };

    const comparisonSide = {
      totalMatches: 0,
      wins: 0,
      losses: 0,
      totalGoals: 0,
      totalConceded: 0,
      totalShots: 0,
      totalSaves: 0,
      totalAssists: 0,
      totalDemos: 0,
      avgScore: 0,
      avgDuration: 0,
      peakSpeed: 0,
      totalKickoffGoals: 0,
      totalKickoffConceded: 0,
    };

    const responses: Record<string, () => unknown> = {
      get_settings_cmd: () => settings,
      set_settings_cmd: () => null,
      get_connection_status: () => ({
        connected: false,
        address: "127.0.0.1:49123",
        last_error: null,
        reconnect_attempts: 0,
        game_running: false,
      }),
      get_live_state: () => null,
      get_live_head_to_head: () => ({}),
      fetch_live_mmr_snapshot: () => ({
        playlist: "Ranked Standard",
        playlistCandidates: [],
        playlistConfidence: "low",
        fetchedAt: new Date(0).toISOString(),
        players: [],
        exactCount: 0,
        historicalCount: 0,
        estimatedCount: 0,
        unavailableCount: 0,
      }),
      set_session_mmr_snapshot: () => null,
      set_local_mmr: () => null,
      get_mmr_provider_health: () => [],
      test_mmr_provider: () => ({
        provider: "rlstats-webview",
        ok: false,
        message: "",
        latencyMs: null,
        entries: [],
      }),
      get_matches: () => ({ matches: [] }),
      get_match_detail: () => ({
        match: null,
        players: [],
        events: [],
        goals: [],
      }),
      get_match_detail_by_primary_id: () => null,
      get_friends_cmd: () => [],
      is_friend_cmd: () => false,
      add_friend_cmd: () => null,
      remove_friend_cmd: () => null,
      list_profiles_cmd: () => [profile],
      get_active_profile_cmd: () => profile,
      create_profile_cmd: () => profile,
      delete_profile_cmd: () => null,
      switch_profile_cmd: () => null,
      rename_profile_cmd: () => null,
      update_profile_player_identity_cmd: () => null,
      find_matching_profile_cmd: () => null,
      get_daily_rollups: () => ({ rollups: [] }),
      get_sessions: () => [],
      get_session_matches: () => [],
      get_analytics: () => ({
        summary: zeroSummary,
        rollups: [],
        sessions: [],
      }),
      get_insights: () => ({ available: false, totalMatches: 0 }),
      get_session_curve: () => ({ available: false }),
      get_teammate_stats: () => ({
        available: false,
        teammates: [],
        byTeamSize: [],
      }),
      get_custom_breakdown: () => ({ available: false, buckets: [] }),
      get_training_analytics: () => ({
        totalSessions: 0,
        totalSeconds: 0,
        avgSessionSeconds: 0,
        days: [],
        byHour: [],
      }),
      get_mmr_history: () => ({
        available: false,
        points: [],
        playlists: [],
      }),
      get_analytics_comparison: () => ({
        available: false,
        mode: "players",
        a: comparisonSide,
        b: comparisonSide,
      }),
      get_storage_stats_cmd: () => ({
        total_matches: 0,
        total_events: 0,
        database_size_bytes: 0,
        oldest_match_date: null,
        db_path: null,
      }),
      get_player_directory: () => ({ players: [] }),
      get_player_detail: () => null,
      get_player_detail_by_primary_id: () => null,
      get_player_analytics_matches: () => ({ matches: [] }),
      get_player_analytics_summary: () => zeroSummary,
      detect_local_accounts_cmd: () => [],
      detect_rl_path: () => [],
      inspect_rl_path: () => null,
      configure_rl_ini_cmd: () => null,
      configure_rl_ini_all_cmd: () => [],
      get_pending_prompt: () => null,
      get_prompt_state: () => null,
      hide_prompt: () => null,
      report_frontend_error: () => null,
      get_cloud_config_cmd: () => ({
        enabled: false,
        cloud_sync_enabled: false,
        device_name: null,
      }),
      get_cloud_sync_status_cmd: () => ({
        configured: false,
        enabled: false,
        cloud_sync_enabled: false,
        device_id: "smoke-device",
        pending_app_changes: 0,
        failed_app_changes: 0,
      }),
      get_profile_sync_status_cmd: () => ({
        device_id: "smoke-device",
        protocol_version: "1",
        pending_changes: 0,
        failed_changes: 0,
        last_pulled_revision: 0,
      }),
      recompute_kickoff_goals: () => ({
        goalsScanned: 0,
        kickoffFound: 0,
        matchesUpdated: 0,
        unattributed: 0,
        estimatedMatches: 0,
        matchesWithoutData: 0,
      }),
    };

    const invoke = async (cmd: string): Promise<unknown> => {
      if (cmd === "plugin:event|listen") return nextEventId++;
      const responder = responses[cmd];
      return responder ? responder() : null;
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
  });
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("app shell renders", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await installTauriMock(page);

  await page.goto("/");

  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.locator("header h1")).toHaveText(/\S+/);
  await expect(page.locator('[data-tour="nav-analytics"]')).toBeVisible();
  await expect(
    page.getByText(/Esperando partida|Waiting for match/),
  ).toBeVisible();

  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test("navigates to Analytics", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await installTauriMock(page);

  await page.goto("/");
  await page.locator('[data-tour="nav-analytics"]').click();

  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.locator('[data-tour="nav-analytics"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByText(/No hay datos para este periodo|No data for this period/),
  ).toBeVisible();
  await expect(
    page.getByText(/La interfaz tuvo un problema/),
  ).toHaveCount(0);

  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});
