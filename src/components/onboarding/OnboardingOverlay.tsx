import { useState } from "react";
import { cn } from "@/lib/utils";
import Step1 from "./Step1_Welcome";
import Step2 from "./Step2_PlayerIdentity";
import Step3 from "./Step2_FindGame";
import Step4 from "./Step2_Connection";
import Step5 from "./Step3_Features";
import Step6 from "./Step4_CloudSync";
import Step7 from "./OnboardingComplete";

interface OnboardingOverlayProps {
  onComplete: () => void;
}

export default function OnboardingOverlay({
  onComplete,
}: OnboardingOverlayProps) {
  const [step, setStep] = useState(1);
  const totalSteps = 7;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--color-bg-base)" }}
    >
      <div className="w-full max-w-2xl px-8">
        {/* Step indicator dots */}
        <div className="flex justify-center gap-2 mb-12">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={cn(
                "h-2.5 w-2.5 rounded-full transition-all duration-300",
                i + 1 === step
                  ? "bg-accent-primary w-6"
                  : "bg-border-highlight",
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-75">
          {step === 1 && <Step1 onNext={() => setStep(2)} />}
          {step === 2 && (
            <Step2 onNext={() => setStep(3)} onBack={() => setStep(1)} />
          )}
          {step === 3 && (
            <Step3 onNext={() => setStep(4)} onBack={() => setStep(2)} />
          )}
          {step === 4 && (
            <Step4 onNext={() => setStep(5)} onBack={() => setStep(3)} />
          )}
          {step === 5 && (
            <Step5 onNext={() => setStep(6)} onBack={() => setStep(4)} />
          )}
          {step === 6 && (
            <Step6 onNext={() => setStep(7)} onBack={() => setStep(5)} />
          )}
          {step === 7 && <Step7 onComplete={onComplete} />}
        </div>
      </div>
    </div>
  );
}
