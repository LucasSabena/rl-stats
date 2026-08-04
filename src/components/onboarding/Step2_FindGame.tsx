import { useState } from "react";
import { Search, FolderOpen, Gamepad2, Monitor, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { configureRlIni, detectRlPath } from "@/lib/api";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useSettingsStore } from "@/stores/settingsStore";

interface StepProps { onNext: () => void; onBack: () => void }

export default function Step2({ onNext, onBack }: StepProps) {
  const { t } = useTranslation(["onboarding", "common"]);
  const [detecting, setDetecting] = useState(false);
  const [detectedPath, setDetectedPath] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"steam" | "epic" | "auto" | "manual" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const setRlPath = useSettingsStore((s) => s.setRlPath);

  async function handleAutoDetect(source: "steam" | "epic" | "auto") {
    setDetecting(true);
    setPlatform(source);
    setError(null);
    setDetectedPath(null);

    try {
      const paths = await detectRlPath();

      if (paths.length > 0) {
        const installation = paths[0];
        await configureRlIni(installation.path);
        setDetectedPath(installation.path);
        setRlPath(installation.path);
        if (settings) {
          await updateSettings.mutateAsync({
            ...settings,
            rlPath: installation.path,
            platform:
              source === "steam" || source === "epic"
                ? source
                : installation.platform ?? settings.platform,
          });
        }
      } else {
        setError(t('onboarding:findGame.autoDetectError'));
      }
    } catch {
      setError(t('onboarding:findGame.autoDetectError'));
    } finally {
      setDetecting(false);
    }
  }

  const canProceed = detectedPath !== null;

  return (
    <div className="text-center animate-fade-in">
      <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-accent-primary-subtle">
        <Search className="h-10 w-10 text-accent-primary" />
      </div>
      <h2 className="font-display text-2xl font-bold text-text-primary mb-4">{t('onboarding:findGame.title')}</h2>
      <p className="text-text-secondary max-w-md mx-auto mb-10 leading-relaxed">
        {t('onboarding:findGame.description')}
      </p>

      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mb-8">
        <button
          onClick={() => handleAutoDetect("steam")}
          disabled={detecting}
          className="flex flex-col items-center gap-3 p-5 rounded-xl bg-bg-panel border border-border-subtle hover:border-border-highlight hover:bg-surface-hover transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Gamepad2 className="h-8 w-8 text-text-secondary" />
          <span className="text-sm font-semibold text-text-primary">{t('onboarding:findGame.steam')}</span>
        </button>

        <button
          onClick={() => handleAutoDetect("epic")}
          disabled={detecting}
          className="flex flex-col items-center gap-3 p-5 rounded-xl bg-bg-panel border border-border-subtle hover:border-border-highlight hover:bg-surface-hover transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Monitor className="h-8 w-8 text-text-secondary" />
          <span className="text-sm font-semibold text-text-primary">{t('onboarding:findGame.epic')}</span>
        </button>

        <button
          onClick={() => handleAutoDetect("auto")}
          disabled={detecting}
          className="flex flex-col items-center gap-3 p-5 rounded-xl bg-accent-primary-subtle border border-accent-primary/30 hover:border-accent-primary hover:bg-accent-primary/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed relative"
        >
          {detecting && platform === "auto" ? (
            <Loader2 className="h-8 w-8 text-accent-primary animate-spin" />
          ) : (
            <Search className="h-8 w-8 text-accent-primary" />
          )}
          <span className="text-sm font-semibold text-text-primary">{t('onboarding:findGame.autoDetect')}</span>
          <span className="text-[10px] font-semibold text-accent-primary">{t('onboarding:findGame.recommended')}</span>
        </button>

        <button
          onClick={() => {
            setPlatform("manual");
            setError(t('onboarding:findGame.manualHint'));
          }}
          disabled={detecting}
          className="flex flex-col items-center gap-3 p-5 rounded-xl bg-bg-panel border border-border-subtle hover:border-border-highlight hover:bg-surface-hover transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FolderOpen className="h-8 w-8 text-text-secondary" />
          <span className="text-sm font-semibold text-text-primary">{t('onboarding:findGame.manual')}</span>
        </button>
      </div>

      {detectedPath && (
        <div className="flex items-center justify-center gap-2 mb-8 text-accent-success">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <span className="truncate max-w-xs text-sm font-medium">{detectedPath}</span>
        </div>
      )}

      {error && !detectedPath && !detecting && (
        <div className="flex items-center justify-center gap-2 mb-8 text-accent-warning">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {detecting && (
        <div className="flex items-center justify-center gap-2 mb-8 text-accent-primary">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{t('onboarding:findGame.searching')}</span>
        </div>
      )}

      <div className="flex justify-center gap-3">
        <button
          onClick={onBack}
          className="px-6 py-2.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors font-medium"
        >
          {t('onboarding:findGame.back')}
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="bg-accent-primary hover:bg-accent-primary-hover disabled:bg-bg-panel disabled:text-text-muted text-white px-8 py-2.5 rounded-lg font-semibold transition-all duration-200"
        >
          {t('onboarding:findGame.next')}
        </button>
      </div>
    </div>
  );
}