import { lazy, Suspense, useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppShell } from "@/components/layout/AppShell";
import { AccountMismatchDialog } from "@/components/AccountMismatchDialog";
import { useSettingsStore } from "@/stores/settingsStore";
import { CURRENT_ONBOARDING_VERSION } from "@/stores/settingsStore";
import { useAutoUpdateCheck } from "@/hooks/useAutoUpdateCheck";
import { useAccountMismatch } from "@/hooks/useAccountMismatch";
import { useCloudAutoSync } from "@/hooks/useCloudAutoSync";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { reportFrontendError } from "@/lib/api";

const OverlayView = lazy(() =>
  import("@/components/overlay/OverlayView").then((module) => ({
    default: module.OverlayView,
  })),
);
const LivePage = lazy(() =>
  import("@/pages/LivePage").then((module) => ({ default: module.LivePage })),
);
const HistoryPage = lazy(() =>
  import("@/pages/HistoryPage").then((module) => ({
    default: module.HistoryPage,
  })),
);
const MatchDetailPage = lazy(() =>
  import("@/pages/MatchDetailPage").then((module) => ({
    default: module.MatchDetailPage,
  })),
);
const AnalyticsPage = lazy(() =>
  import("@/pages/AnalyticsPage").then((module) => ({
    default: module.AnalyticsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const ProfilePage = lazy(() =>
  import("@/pages/ProfilePage").then((module) => ({
    default: module.ProfilePage,
  })),
);
const ProConfigsPage = lazy(() =>
  import("@/pages/ProConfigsPage").then((module) => ({
    default: module.ProConfigsPage,
  })),
);
const PlayerDirectoryPage = lazy(() =>
  import("@/pages/PlayerDirectoryPage").then((module) => ({
    default: module.PlayerDirectoryPage,
  })),
);
const PlayerDetailPage = lazy(() =>
  import("@/pages/PlayerDetailPage").then((module) => ({
    default: module.PlayerDetailPage,
  })),
);
const TrainingPacksPage = lazy(() =>
  import("@/pages/TrainingPacksPage").then((module) => ({
    default: module.TrainingPacksPage,
  })),
);
const OnboardingOverlay = lazy(
  () => import("@/components/onboarding/OnboardingOverlay"),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function AppFallback({ transparent = false }: { transparent?: boolean }) {
  return (
    <div
      className={`min-h-screen ${transparent ? "bg-transparent" : "bg-bg-base"}`}
    />
  );
}

function AppContent() {
  const hasCompletedOnboarding = useSettingsStore(
    (s) =>
      s.hasCompletedOnboarding &&
      s.onboardingVersion >= CURRENT_ONBOARDING_VERSION,
  );
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
  const [isOverlayWindow, setIsOverlayWindow] = useState(false);
  const [detecting, setDetecting] = useState(true);

  useAutoUpdateCheck();
  useAccountMismatch();
  useCloudAutoSync();

  useEffect(() => {
    try {
      const win = getCurrentWindow();
      if (win.label === "overlay") {
        setIsOverlayWindow(true);
        document.documentElement.style.backgroundColor = "transparent";
        document.body.style.backgroundColor = "transparent";
        document.documentElement.classList.add("overlay-window");
      }
    } catch {
      // Running outside Tauri (dev mode in browser) — not an overlay window
    }
    setDetecting(false);
  }, []);

  useEffect(() => {
    const reportWindowError = (event: ErrorEvent) => {
      void reportFrontendError(
        event.message || "Unhandled browser error",
        event.error instanceof Error ? event.error.stack : undefined,
      ).catch(() => undefined);
    };
    const reportRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      void reportFrontendError(
        reason instanceof Error ? reason.message : String(reason),
        reason instanceof Error ? reason.stack : undefined,
      ).catch(() => undefined);
    };
    window.addEventListener("error", reportWindowError);
    window.addEventListener("unhandledrejection", reportRejection);
    return () => {
      window.removeEventListener("error", reportWindowError);
      window.removeEventListener("unhandledrejection", reportRejection);
    };
  }, []);

  // Show nothing while detecting window type to avoid flash
  if (detecting) return null;

  // Overlay window: render only the overlay widget (no sidebar, no routing)
  if (isOverlayWindow) {
    return (
      <Suspense fallback={<AppFallback transparent />}>
        <OverlayView />
      </Suspense>
    );
  }

  return (
    <BrowserRouter>
      <>
        <Suspense fallback={<AppFallback />}>
          <Routes>
            <Route
              element={
                <AppShell>
                  <Outlet />
                </AppShell>
              }
            >
              <Route path="/" element={<LivePage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/history/:matchId" element={<MatchDetailPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/pro-configs" element={<ProConfigsPage />} />
              <Route path="/training-packs" element={<TrainingPacksPage />} />
              <Route path="/players" element={<PlayerDirectoryPage />} />
              <Route path="/players/:playerId" element={<PlayerDetailPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>

        {!hasCompletedOnboarding && (
          <Suspense fallback={null}>
            <OnboardingOverlay onComplete={completeOnboarding} />
          </Suspense>
        )}

        <AccountMismatchDialog />
      </>
    </BrowserRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <AppContent />
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;
