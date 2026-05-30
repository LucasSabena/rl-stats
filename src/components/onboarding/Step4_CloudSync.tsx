import { Cloud, CreditCard, LockKeyhole, RefreshCw } from "lucide-react";

interface StepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function Step4CloudSync({ onNext, onBack }: StepProps) {
  const items = [
    {
      icon: LockKeyhole,
      title: "Local-first by default",
      desc: "Your match history stays on this device unless you explicitly connect an account and start sync.",
    },
    {
      icon: RefreshCw,
      title: "Cloud backup and multi-device sync",
      desc: "Upload profiles, matches, players and settings through the secure Supabase sync API.",
    },
    {
      icon: CreditCard,
      title: "Optional paid plan",
      desc: "Basic and Supporter unlock the same sync features; Supporter just helps fund development.",
    },
  ];

  return (
    <div className="animate-fade-in text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-primary-subtle shadow-glow-blue">
        <Cloud className="h-8 w-8 text-accent-primary" />
      </div>
      <h2 className="font-display mb-3 text-2xl font-bold text-text-primary">Cloud Sync is optional</h2>
      <p className="mx-auto mb-8 max-w-lg text-sm leading-relaxed text-text-secondary">
        RL Stats now has the foundation for account login, billing and encrypted-in-transit sync. You can finish setup later from Settings → Cloud Sync.
      </p>

      <div className="mx-auto mb-10 grid max-w-xl gap-3 text-left">
        {items.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-start gap-4 rounded-xl border border-border-subtle bg-bg-panel p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-primary-subtle">
              <Icon className="h-5 w-5 text-accent-primary" />
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-text-primary">{title}</h3>
              <p className="text-sm text-text-tertiary">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-3">
        <button
          onClick={onBack}
          className="rounded-lg px-6 py-2.5 font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="rounded-lg bg-accent-primary px-8 py-2.5 font-semibold text-white transition-all duration-200 hover:bg-accent-primary-hover"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
