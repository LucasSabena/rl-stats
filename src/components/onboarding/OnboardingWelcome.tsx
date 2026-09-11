import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { TFunction } from "i18next";

interface OnboardingWelcomeProps {
  t: TFunction;
  onComplete: () => void;
  onStart: () => void;
}

export function OnboardingWelcome({ t, onComplete, onStart }: OnboardingWelcomeProps) {
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
            <Button onClick={onStart}>
              {t("welcome.cta")}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
