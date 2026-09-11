import {
  ArrowLeft,
  ArrowRight,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { TFunction } from "i18next";

export interface TourStep {
  selector: string;
  route: string;
  title: string;
  description: string;
}

export interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface OnboardingTourProps {
  t: TFunction;
  tourSteps: TourStep[];
  tourIndex: number;
  targetRect: TargetRect | null;
  setTourIndex: React.Dispatch<React.SetStateAction<number>>;
  finishTour: () => void;
}

export function OnboardingTour({ t, tourSteps, tourIndex, targetRect, setTourIndex, finishTour }: OnboardingTourProps) {
  const step = tourSteps[tourIndex];
  const tooltipTop = targetRect
    ? Math.min(window.innerHeight - 270, Math.max(24, targetRect.top + targetRect.height + 16))
    : Math.max(24, window.innerHeight / 2 - 130);
  const tooltipLeft = targetRect
    ? Math.min(window.innerWidth - 390, Math.max(88, targetRect.left))
    : Math.max(88, window.innerWidth / 2 - 180);

  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-live="polite">
      <div className="pointer-events-auto absolute inset-0 bg-black/72" />
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
