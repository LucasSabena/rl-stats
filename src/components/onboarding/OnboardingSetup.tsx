import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Gamepad2,
  LoaderCircle,
  LocateFixed,
  MonitorCog,
  PlugZap,
  Search,
  UserRoundCheck,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getConnectionStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TFunction } from "i18next";
import type { ConnectionStatus, DetectedAccount, RlInstallation } from "@/lib/types";

interface OnboardingSetupProps {
  t: TFunction;
  installations: RlInstallation[];
  accounts: DetectedAccount[];
  selectedPaths: string[];
  selectedAccount: string;
  manualPath: string;
  detecting: boolean;
  saving: boolean;
  setupError: string;
  setManualPath: (value: string) => void;
  setSelectedPaths: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedAccount: (value: string) => void;
  runDetection: () => void;
  validateManualPath: () => void;
  finishSetup: () => void;
  skipSetup: () => void;
  onBack: () => void;
  onComplete: () => void;
}

export function OnboardingSetup({
  t,
  installations,
  accounts,
  selectedPaths,
  selectedAccount,
  manualPath,
  detecting,
  saving,
  setupError,
  setManualPath,
  setSelectedPaths,
  setSelectedAccount,
  runDetection,
  validateManualPath,
  finishSetup,
  skipSetup,
  onBack,
  onComplete,
}: OnboardingSetupProps) {
  const selectedInstallations = installations.filter((item) =>
    selectedPaths.some((path) => path.toLowerCase() === item.path.toLowerCase()),
  );

  const [probe, setProbe] = useState<{ status: ConnectionStatus; at: number } | null>(null);
  const [probing, setProbing] = useState(false);

  const probeConnection = async () => {
    setProbing(true);
    try {
      const status = await getConnectionStatus();
      setProbe({ status, at: Date.now() });
    } catch {
      setProbe(null);
    } finally {
      setProbing(false);
    }
  };

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
          <SetupSection icon={Gamepad2} title={t("setup.gameTitle")} status={selectedInstallations.length > 0 ? t("setup.detected") : t("setup.pending")}>
            {detecting && installations.length === 0 ? (
              <LoadingLine label={t("setup.searchingGame")} />
            ) : installations.length > 0 ? (
              <div className="space-y-2">
                {installations.map((item) => {
                  const checked = selectedPaths.some((path) => path.toLowerCase() === item.path.toLowerCase());
                  return (
                    <button key={item.path} type="button" onClick={() => {
                      setSelectedPaths((current) =>
                        checked
                          ? current.filter((path) => path.toLowerCase() !== item.path.toLowerCase())
                          : [...current, item.path],
                      );
                    }} className={cn("w-full rounded-xl border p-3 text-left transition", checked ? "border-accent-primary bg-accent-primary-subtle" : "border-border-subtle bg-bg-base hover:border-border-highlight")}>
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <span className={cn("flex h-4 w-4 items-center justify-center rounded border", checked ? "border-accent-primary bg-accent-primary" : "border-border-highlight")}>
                            {checked && <Check size={11} className="text-accent-primary-fg" />}
                          </span>
                          <span className="text-sm font-semibold capitalize text-text-primary">{item.platform}</span>
                        </span>
                        {item.configured && <span className="rounded-full bg-accent-success/15 px-2 py-1 text-[10px] font-bold text-accent-success">{t("setup.alreadyConfigured")}</span>}
                      </span>
                      <span className="mt-1 block truncate pl-6 font-mono text-[11px] text-text-muted">{item.path}</span>
                    </button>
                  );
                })}
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

        {/* Connection test: closes the "did it actually connect?" loop without
            asking the user to leave the wizard and open a live match. */}
        <div className="px-8 pb-2">
          <SetupSection
            icon={PlugZap}
            title={t("setup.connectionTitle", { defaultValue: "Conexión con Rocket League" })}
            status={probe ? t("setup.checked", { defaultValue: "Verificado" }) : t("setup.pending")}
          >
            <p className="text-sm leading-5 text-text-muted">
              {t("setup.connectionDescription", {
                defaultValue:
                  "Abrí Rocket League (podés estar en el menú) y probá la conexión: la app lee el stream de estadísticas en el puerto configurado.",
              })}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm" onClick={() => void probeConnection()} isLoading={probing} disabled={probing}>
                <Wifi size={15} /> {t("setup.testConnection", { defaultValue: "Probar conexión" })}
              </Button>
              {probe && (
                <span
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                    probe.status === "connected"
                      ? "bg-accent-success/15 text-accent-success"
                      : "bg-accent-warning/15 text-accent-warning",
                  )}
                >
                  {probe.status === "connected" ? <Wifi size={13} /> : <WifiOff size={13} />}
                  {probe.status === "connected"
                    ? t("setup.connectionConnected", { defaultValue: "Conectado: recibiendo datos" })
                    : probe.status === "game_not_running"
                      ? t("setup.connectionNoGame", { defaultValue: "Rocket League no está abierto" })
                      : probe.status === "connecting"
                        ? t("setup.connectionConnecting", { defaultValue: "Conectando…" })
                        : t("setup.connectionDisconnected", {
                            defaultValue: "Sin conexión todavía. Revisá el puerto o reiniciá el juego.",
                          })}
                </span>
              )}
            </div>
          </SetupSection>
        </div>

        {setupError && <p role="alert" className="mx-8 mb-4 rounded-xl border border-accent-danger/25 bg-accent-danger/10 px-4 py-3 text-sm text-accent-danger">{setupError}</p>}

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-8 py-5">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"><ArrowLeft size={15} /> {t("actions.back")}</button>
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
