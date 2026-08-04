import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gamepad2,
  LoaderCircle,
  LocateFixed,
  MonitorCog,
  Search,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  X,
} from "lucide-react";
import {
  configureRlIni,
  detectLocalAccounts,
  detectRlPath,
  getActiveProfile,
  getSettings,
  inspectRlPath,
  setSettings,
  updateProfilePlayerIdentity,
} from "@/lib/api";
import type { DetectedAccount, RlInstallation } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";

interface OnboardingOverlayProps {
  onComplete: () => void;
}

type Phase = "welcome" | "setup" | "tour";

interface TourStep {
  selector: string;
  route: string;
  title: string;
  description: string;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const setSidebarExpanded = useUIStore((state) => state.setSidebarExpanded);
  const setStorePlayerName = useSettingsStore((state) => state.setPlayerName);
  const setStorePath = useSettingsStore((state) => state.setRlPath);
  const setStorePlatform = useSettingsStore((state) => state.setPlatform);

  const [phase, setPhase] = useState<Phase>("welcome");
  const [installations, setInstallations] = useState<RlInstallation[]>([]);
  const [accounts, setAccounts] = useState<DetectedAccount[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
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
      setInstallations(installationResult.value);
      const preferred =
        installationResult.value.find((item) => item.configured) ??
        installationResult.value.find((item) => item.valid);
      if (preferred) setSelectedPath(preferred.path);
    }
    if (accountResult.status === "fulfilled") {
      setAccounts(accountResult.value);
      const preferred =
        accountResult.value.find((account) => account.active) ?? accountResult.value[0];
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
      setSelectedPath(detected.path);
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
      const installation = installations.find((item) => item.path === selectedPath);
      const account = accounts.find((item) => item.primary_id === selectedAccount);
      const currentSettings = await getSettings();

      if (installation) await configureRlIni(installation.path);

      await setSettings({
        ...currentSettings,
        rlPath: installation?.path ?? currentSettings.rlPath,
        platform: installation?.platform ?? currentSettings.platform,
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
        setStorePlayerName(account.display_name);
      }
      if (installation) {
        setStorePath(installation.path);
        setStorePlatform(installation.platform);
      }

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
      <div className="fixed inset-0 z-50 grid place-items-center bg-bg-base/88 p-8 backdrop-blur-xl">
        <section className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-accent-primary/25 bg-bg-panel p-10 shadow-2xl">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-accent-primary/20 blur-3xl" />
          <div className="relative">
            <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent-primary/30 bg-accent-primary-subtle text-accent-primary">
              <Sparkles size={30} />
            </div>
            <p className="text-xs font-bold tracking-[0.24em] text-accent-primary">
              {t("welcome.eyebrow")}
            </p>
            <h1 className="mt-3 max-w-xl font-display text-4xl font-bold leading-tight text-text-primary">
              {t("welcome.title")}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-text-secondary">
              {t("welcome.description")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-xs text-text-secondary">
              {["local", "automatic", "guided"].map((key) => (
                <span key={key} className="flex items-center gap-2 rounded-full border border-border-subtle bg-bg-base/70 px-3 py-2">
                  <ShieldCheck size={14} className="text-accent-success" />
                  {t(`welcome.${key}`)}
                </span>
              ))}
            </div>
            <div className="mt-10 flex items-center justify-between gap-4 border-t border-border-subtle pt-6">
              <button type="button" onClick={onComplete} className="text-sm text-text-muted transition hover:text-text-primary">
                {t("actions.skip")}
              </button>
              <Button onClick={() => setPhase("setup")}>
                {t("welcome.cta")}
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (phase === "setup") {
    const selectedInstallation = installations.find((item) => item.path === selectedPath);
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-bg-base/94 p-6 backdrop-blur-xl">
        <section className="mx-auto my-4 w-full max-w-4xl rounded-3xl border border-border-highlight/60 bg-bg-panel shadow-2xl">
          <header className="flex items-start justify-between border-b border-border-subtle px-8 py-6">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-accent-primary">{t("setup.eyebrow")}</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-text-primary">{t("setup.title")}</h2>
              <p className="mt-2 text-sm text-text-secondary">{t("setup.description")}</p>
            </div>
            <button type="button" onClick={onComplete} aria-label={t("actions.close")} className="rounded-lg p-2 text-text-muted hover:bg-bg-surface hover:text-text-primary">
              <X size={18} />
            </button>
          </header>

          <div className="grid gap-6 p-8 md:grid-cols-2">
            <SetupSection icon={Gamepad2} title={t("setup.gameTitle")} status={selectedInstallation ? t("setup.detected") : t("setup.pending")}>
              {detecting && installations.length === 0 ? (
                <LoadingLine label={t("setup.searchingGame")} />
              ) : installations.length > 0 ? (
                <div className="space-y-2">
                  {installations.map((item) => (
                    <button key={item.path} type="button" onClick={() => setSelectedPath(item.path)} className={cn("w-full rounded-xl border p-3 text-left transition", selectedPath === item.path ? "border-accent-primary bg-accent-primary-subtle" : "border-border-subtle bg-bg-base hover:border-border-highlight")}>
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold capitalize text-text-primary">{item.platform}</span>
                        {selectedPath === item.path && <Check size={16} className="text-accent-primary" />}
                      </span>
                      <span className="mt-1 block truncate font-mono text-[11px] text-text-muted">{item.path}</span>
                      <span className="mt-2 block text-[10px] text-accent-success">{item.configured ? t("setup.alreadyConfigured") : item.source}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-border-subtle bg-bg-base p-3 text-sm text-text-muted">{t("setup.noGame")}</p>
              )}

              <div className="mt-3 flex gap-2">
                <input value={manualPath} onChange={(event) => setManualPath(event.target.value)} placeholder={t("setup.pathPlaceholder")} className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary" />
                <Button variant="secondary" size="sm" onClick={validateManualPath} disabled={!manualPath.trim() || detecting} aria-label={t("setup.validatePath")}>
                  <Search size={15} />
                </Button>
              </div>
            </SetupSection>

            <SetupSection icon={UserRoundCheck} title={t("setup.accountTitle")} status={selectedAccount ? t("setup.detected") : t("setup.pending")}>
              {detecting && accounts.length === 0 ? (
                <LoadingLine label={t("setup.searchingAccount")} />
              ) : accounts.length > 0 ? (
                <div className="space-y-2">
                  {accounts.map((account) => (
                    <button key={account.primary_id} type="button" onClick={() => setSelectedAccount(account.primary_id)} className={cn("w-full rounded-xl border p-3 text-left transition", selectedAccount === account.primary_id ? "border-accent-primary bg-accent-primary-subtle" : "border-border-subtle bg-bg-base hover:border-border-highlight")}>
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-text-primary">{account.display_name}</span>
                        {account.active ? <span className="rounded-full bg-accent-success/15 px-2 py-1 text-[10px] font-bold text-accent-success">{t("setup.active")}</span> : selectedAccount === account.primary_id ? <Check size={16} className="text-accent-primary" /> : null}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] text-text-muted">{account.account_name} · {account.platform}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-border-subtle bg-bg-base p-3 text-sm leading-5 text-text-muted">{t("setup.noAccount")}</p>
              )}
              <button type="button" onClick={runDetection} disabled={detecting} className="mt-3 flex items-center gap-2 text-xs font-semibold text-accent-primary disabled:opacity-50">
                <LocateFixed size={14} /> {t("setup.detectAgain")}
              </button>
            </SetupSection>
          </div>

          {setupError && <p role="alert" className="mx-8 mb-4 rounded-xl border border-accent-danger/25 bg-accent-danger/10 px-4 py-3 text-sm text-accent-danger">{setupError}</p>}

          <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-8 py-5">
            <button type="button" onClick={() => setPhase("welcome")} className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"><ArrowLeft size={15} /> {t("actions.back")}</button>
            <div className="flex items-center gap-3">
              <button type="button" onClick={skipSetup} className="text-sm text-text-muted hover:text-text-primary">{t("setup.later")}</button>
              <Button onClick={finishSetup} isLoading={saving} disabled={saving}>
                <MonitorCog size={16} /> {t("setup.configure")}
              </Button>
            </div>
          </footer>
        </section>
      </div>
    );
  }

  const step = tourSteps[tourIndex];
  const tooltipTop = targetRect
    ? Math.min(window.innerHeight - 270, Math.max(24, targetRect.top + targetRect.height + 16))
    : Math.max(24, window.innerHeight / 2 - 130);
  const tooltipLeft = targetRect
    ? Math.min(window.innerWidth - 390, Math.max(88, targetRect.left))
    : Math.max(88, window.innerWidth / 2 - 180);

  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-live="polite">
      <div className="absolute inset-0 bg-black/72" />
      {targetRect && (
        <div className="absolute rounded-2xl border-2 border-accent-primary bg-transparent transition-all duration-300" style={targetRect} />
      )}
      <section role="dialog" aria-modal="true" aria-labelledby="tour-title" className="pointer-events-auto absolute w-[360px] rounded-2xl border border-accent-primary/30 bg-bg-panel p-5 shadow-2xl transition-all duration-300" style={{ top: tooltipTop, left: tooltipLeft }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[0.18em] text-accent-primary">{t("tour.progress", { current: tourIndex + 1, total: tourSteps.length })}</span>
          <button type="button" onClick={finishTour} className="rounded-md p-1 text-text-muted hover:bg-bg-surface hover:text-text-primary" aria-label={t("actions.close")}><X size={16} /></button>
        </div>
        <h2 id="tour-title" className="mt-3 font-display text-xl font-bold text-text-primary">{step.title}</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{step.description}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" disabled={tourIndex === 0} onClick={() => setTourIndex((index) => index - 1)}><ArrowLeft size={15} /> {t("actions.back")}</Button>
          {tourIndex === tourSteps.length - 1 ? (
            <Button size="sm" onClick={finishTour}><Check size={15} /> {t("tour.finish")}</Button>
          ) : (
            <Button size="sm" onClick={() => setTourIndex((index) => index + 1)}>{t("actions.next")} <ArrowRight size={15} /></Button>
          )}
        </div>
      </section>
    </div>
  );
}

function SetupSection({ icon: Icon, title, status, children }: { icon: typeof Gamepad2; title: string; status: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-surface/70 p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-base font-bold text-text-primary"><Icon size={18} className="text-accent-primary" /> {title}</h3>
        <span className="text-[10px] font-bold text-text-muted">{status}</span>
      </header>
      {children}
    </section>
  );
}

function LoadingLine({ label }: { label: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-base p-4 text-sm text-text-muted"><LoaderCircle size={17} className="animate-spin text-accent-primary" /> {label}</div>;
}
