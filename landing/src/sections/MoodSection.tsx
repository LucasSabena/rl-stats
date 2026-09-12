import { Annoyed, Angry, Laugh, Meh, Smile } from "lucide-react";
import { useI18n } from "@/i18n";
import { Section } from "@/components/Section";
import { AppWindow } from "@/components/AppWindow";
import { useRevealClass } from "@/useReveal";
import { cn } from "@/cn";

const MOOD_ICONS = [Laugh, Smile, Meh, Annoyed, Angry];
// Mirrors `moodTone()` in the app so the colours mean the same thing here.
const MOOD_TONES = [
  "text-success",
  "text-accent",
  "text-text-muted",
  "text-warning",
  "text-danger",
];

/**
 * Mood tracking — the feature no competitor has. Presented as a question the
 * player answers in one keypress, then proven with the win-rate-by-mood panel.
 */
export function MoodSection() {
  const { copy } = useI18n();
  const left = useRevealClass<HTMLDivElement>();
  const right = useRevealClass<HTMLDivElement>(90);

  return (
    <Section>
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-14">
        <div ref={left.ref} className={left.className} style={left.style}>
          <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {copy.mood.kicker}
          </p>
          <h2 className="text-balance text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            {copy.mood.title}
          </h2>
          <p className="mt-4 text-pretty text-sm leading-relaxed text-text-secondary sm:text-base">
            {copy.mood.body}
          </p>

          <div className="mt-6 flex flex-wrap gap-2" role="list" aria-label={copy.mood.kicker}>
            {copy.mood.levels.map((level, index) => {
              const Icon = MOOD_ICONS[index];
              return (
                <span
                  key={level}
                  role="listitem"
                  className="inline-flex items-center gap-2 rounded-md border border-border-subtle bg-bg-surface px-3 py-1.5 text-xs text-text-secondary"
                >
                  <Icon size={14} className={MOOD_TONES[index]} aria-hidden="true" />
                  {level}
                </span>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="tabular font-mono text-sm font-semibold text-success">
              {copy.mood.quote}
            </span>
            <span className="tabular font-mono text-sm font-semibold text-danger">
              {copy.mood.quoteDetail}
            </span>
          </div>
        </div>

        <div ref={right.ref} className={cn("flex flex-col gap-4", right.className)} style={right.style}>
          <AppWindow
            src="./media/screens/06-mood-panel.webp"
            alt={copy.screenshotAlts.mood}
          />
          <AppWindow
            src="./media/screens/13-mood-prompt.webp"
            alt={copy.screenshotAlts.moodPrompt}
            chrome={false}
            className="sm:max-w-md"
          />
        </div>
      </div>
    </Section>
  );
}
