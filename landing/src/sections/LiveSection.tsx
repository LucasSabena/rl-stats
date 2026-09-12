import { Check } from "lucide-react";
import { useI18n } from "@/i18n";
import { Section } from "@/components/Section";
import { AppWindow } from "@/components/AppWindow";
import { useRevealClass } from "@/useReveal";

/** Live MMR: the single most distinctive feature, so it leads the story. */
export function LiveSection() {
  const { copy } = useI18n();
  const intro = useRevealClass<HTMLDivElement>();
  const shot = useRevealClass<HTMLDivElement>(80);

  return (
    <Section id="features">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:gap-14">
        <div ref={intro.ref} className={intro.className} style={intro.style}>
          <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {copy.live.kicker}
          </p>
          <h2 className="text-balance text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            {copy.live.title}
          </h2>
          <p className="mt-4 text-pretty text-sm leading-relaxed text-text-secondary sm:text-base">
            {copy.live.body}
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {copy.live.points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-text-secondary">
                <Check size={15} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                <span className="leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div ref={shot.ref} className={shot.className} style={shot.style}>
          <AppWindow
            src="./media/screens/01-live.webp"
            alt={copy.screenshotAlts.live}
            priority
          />
        </div>
      </div>
    </Section>
  );
}
