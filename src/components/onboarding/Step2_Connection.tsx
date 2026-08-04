import { Plug2 } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";

interface StepProps { onNext: () => void; onBack: () => void }

export default function Step2({ onNext, onBack }: StepProps) {
  const { t } = useTranslation(["onboarding", "common"]);

  return (
    <div className="text-center animate-fade-in">
      <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-accent-success-subtle">
        <Plug2 className="h-10 w-10 text-accent-success" />
      </div>
      <h2 className="font-display text-2xl font-bold text-text-primary mb-4">{t('onboarding:connection.title')}</h2>
      <p className="text-text-secondary max-w-md mx-auto mb-8 leading-relaxed">
        <Trans i18nKey="onboarding:connection.description" components={{ port: <span className="text-accent-primary font-mono font-semibold">49123</span> }} />
      </p>
      <div className="bg-bg-panel rounded-xl p-6 max-w-md mx-auto mb-12 text-left border border-border-subtle">
        <h3 className="font-display text-sm font-semibold text-text-primary mb-3">{t('onboarding:connection.howItWorks')}</h3>
        <ul className="space-y-3 text-sm text-text-secondary">
          <li className="flex items-start gap-2">
            <span className="text-accent-success mt-0.5 font-bold">&#10003;</span>
            {t('onboarding:connection.bullet1')}
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent-success mt-0.5 font-bold">&#10003;</span>
            {t('onboarding:connection.bullet2')}
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent-success mt-0.5 font-bold">&#10003;</span>
            {t('onboarding:connection.bullet3')}
          </li>
        </ul>
      </div>
      <div className="flex justify-center gap-3">
        <button
          onClick={onBack}
          className="px-6 py-2.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors font-medium"
        >
          {t('onboarding:connection.back')}
        </button>
        <button
          onClick={onNext}
          className="bg-accent-primary hover:bg-accent-primary-hover text-white px-8 py-2.5 rounded-lg font-semibold transition-all duration-200"
        >
          {t('onboarding:connection.understood')}
        </button>
      </div>
    </div>
  );
}