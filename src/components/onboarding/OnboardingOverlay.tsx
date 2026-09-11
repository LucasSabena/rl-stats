import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  configureRlIniAll,
  detectLocalAccounts,
  detectRlPath,
  getActiveProfile,
  getSettings,
  inspectRlPath,
  setSettings,
  updateProfilePlayerIdentity,
} from "@/lib/api";
import type { DetectedAccount, RlInstallation } from "@/lib/types";
import { useUIStore } from "@/stores/uiStore";
import { OnboardingWelcome } from "./OnboardingWelcome";
import { OnboardingSetup } from "./OnboardingSetup";
import { OnboardingTour } from "./OnboardingTour";
import type { TargetRect, TourStep } from "./OnboardingTour";

interface OnboardingOverlayProps {
  onComplete: () => void;
}

type Phase = "welcome" | "setup" | "tour";

export default function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const setSidebarExpanded = useUIStore((state) => state.setSidebarExpanded);

  const [phase, setPhase] = useState<Phase>("welcome");
  const [installations, setInstallations] = useState<RlInstallation[]>([]);
  const [accounts, setAccounts] = useState<DetectedAccount[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [manualPath, setManualPath] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [tourIndex, setTourIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  const tourSteps = useMemo<TourStep[]>(
    () => [
      {
        selector: "[data-tour='nav-live']",
        route: "/",
        title: t("tour.live.title"),
        description: t("tour.live.description"),
      },
      {
        selector: "[data-tour='connection']",
        route: "/",
        title: t("tour.connection.title"),
        description: t("tour.connection.description"),
      },
      {
        selector: "[data-tour='nav-history']",
        route: "/history",
        title: t("tour.history.title"),
        description: t("tour.history.description"),
      },
      {
        selector: "[data-tour='nav-analytics']",
        route: "/analytics",
        title: t("tour.analytics.title"),
        description: t("tour.analytics.description"),
      },
      {
        selector: "[data-tour='nav-players']",
        route: "/players",
        title: t("tour.players.title"),
        description: t("tour.players.description"),
      },
      {
        selector: "[data-tour='profiles']",
        route: "/",
        title: t("tour.profiles.title"),
        description: t("tour.profiles.description"),
      },
      {
        selector: "[data-tour='nav-settings']",
        route: "/settings",
        title: t("tour.settings.title"),
        description: t("tour.settings.description"),
      },
    ],
    [t],
  );

  const runDetection = useCallback(async () => {
    setDetecting(true);
    setSetupError("");
    const [installationResult, accountResult] = await Promise.allSettled([
      detectRlPath(),
      detectLocalAccounts(),
    ]);

    if (installationResult.status === "fulfilled") {
      const detectedInstallations = installationResult.value ?? [];
      setInstallations(detectedInstallations);
      const preferred = detectedInstallations.filter((item) => item.valid);
      setSelectedPaths(preferred.map((item) => item.path));
    }
    if (accountResult.status === "fulfilled") {
      const detectedAccounts = accountResult.value ?? [];
      setAccounts(detectedAccounts);
      const preferred =
        detectedAccounts.find((account) => account.active) ?? detectedAccounts[0];
      if (preferred) setSelectedAccount(preferred.primary_id);
    }
    if (installationResult.status === "rejected" && accountResult.status === "rejected") {
      setSetupError(t("setup.detectError"));
    }
    setDetecting(false);
  }, [t]);

  useEffect(() => {
    if (phase === "setup") void runDetection();
  }, [phase, runDetection]);

  const validateManualPath = async () => {
    if (!manualPath.trim()) return;
    setDetecting(true);
    setSetupError("");
    try {
      const detected = await inspectRlPath(manualPath.trim());
      setInstallations((current) => [
        detected,
        ...current.filter((item) => item.path.toLowerCase() !== detected.path.toLowerCase()),
      ]);
      setSelectedPaths((current) =>
        current.some((path) => path.toLowerCase() === detected.path.toLowerCase())
          ? current
          : [...current, detected.path],
      );
      setManualPath("");
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : t("setup.invalidPath"));
    } finally {
      setDetecting(false);
    }
  };

  const finishSetup = async () => {
    setSaving(true);
    setSetupError("");
    try {
      const selectedInstallations = installations.filter((item) =>
        selectedPaths.some((path) => path.toLowerCase() === item.path.toLowerCase()),
      );
      const account = accounts.find((item) => item.primary_id === selectedAccount);
      const currentSettings = await getSettings();

      const paths = selectedInstallations.map((item) => item.path);
      if (paths.length > 0) await configureRlIniAll(paths);

      await setSettings({
        ...currentSettings,
        rlPath: paths[0] ?? currentSettings.rlPath,
        rlPaths: paths.length > 0 ? paths : currentSettings.rlPaths,
        platform: selectedInstallations[0]?.platform ?? currentSettings.platform,
        playerName: account?.display_name || currentSettings.playerName,
        localPrimaryId: account?.primary_id ?? currentSettings.localPrimaryId,
        warnOnProfileMismatch: true,
      });

      if (account) {
        const profile = await getActiveProfile();
        await updateProfilePlayerIdentity(
          profile.id,
          account.primary_id,
          account.display_name,
        );
      }
      // No store mirror: the canonical values were just saved through
      // setSettings, and other screens read them from useSettings().

      setSidebarExpanded(true);
      navigate("/");
      setTourIndex(0);
      setPhase("tour");
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : t("setup.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const skipSetup = () => {
    setSidebarExpanded(true);
    navigate("/");
    setTourIndex(0);
    setPhase("tour");
  };

  useEffect(() => {
    if (phase !== "tour") return;
    const step = tourSteps[tourIndex];
    navigate(step.route);

    let cancelled = false;
    let attempt = 0;
    const locate = () => {
      if (cancelled) return;
      const target = document.querySelector(step.selector);
      if (target) {
        const rect = target.getBoundingClientRect();
        setTargetRect({
          top: Math.max(8, rect.top - 6),
          left: Math.max(8, rect.left - 6),
          width: rect.width + 12,
          height: rect.height + 12,
        });
        return;
      }
      setTargetRect(null);
      if (attempt++ < 12) window.setTimeout(locate, 80);
    };
    window.setTimeout(locate, 30);
    window.addEventListener("resize", locate);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", locate);
    };
  }, [navigate, phase, tourIndex, tourSteps]);

  const finishTour = () => {
    navigate("/");
    setSidebarExpanded(false);
    onComplete();
  };

  if (phase === "welcome") {
    return (
      <OnboardingWelcome
        t={t}
        onComplete={onComplete}
        onStart={() => setPhase("setup")}
      />
    );
  }

  if (phase === "setup") {
    return (
      <OnboardingSetup
        t={t}
        installations={installations}
        accounts={accounts}
        selectedPaths={selectedPaths}
        selectedAccount={selectedAccount}
        manualPath={manualPath}
        detecting={detecting}
        saving={saving}
        setupError={setupError}
        setManualPath={setManualPath}
        setSelectedPaths={setSelectedPaths}
        setSelectedAccount={setSelectedAccount}
        runDetection={runDetection}
        validateManualPath={validateManualPath}
        finishSetup={finishSetup}
        skipSetup={skipSetup}
        onBack={() => setPhase("welcome")}
        onComplete={onComplete}
      />
    );
  }

  return (
    <OnboardingTour
      t={t}
      tourSteps={tourSteps}
      tourIndex={tourIndex}
      targetRect={targetRect}
      setTourIndex={setTourIndex}
      finishTour={finishTour}
    />
  );
}
