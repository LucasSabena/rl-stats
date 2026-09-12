import { useI18n } from "@/i18n";
import { Section } from "@/components/Section";
import { AppWindow } from "@/components/AppWindow";
import { useRevealClass } from "@/useReveal";
import { cn } from "@/cn";

/**
 * Analytics: the story-telling section. Each card pairs a claim with the real
 * panel that proves it, so the page never asserts a capability it cannot show.
 */
export function AnalyticsSection() {
  const { copy } = useI18n();
  const top = useRevealClass<HTMLDivElement>();
  const middle = useRevealClass<HTMLDivElement>(80);
  const bottom = useRevealClass<HTMLDivElement>(140);

  const CARDS = [
    {
      ...copy.analytics.cards[0],
      image: "./media/screens/07-fatigue-panel.webp",
      alt: copy.screenshotAlts.fatigue,
    },
    {
      ...copy.analytics.cards[1],
      image: "./media/screens/06-mood-panel.webp",
      alt: copy.screenshotAlts.mood,
    },
    {
      ...copy.analytics.cards[2],
      image: "./media/screens/05-analytics-insights.webp",
      alt: copy.screenshotAlts.insights,
    },
    {
      ...copy.analytics.cards[3],
      image: "./media/screens/04-analytics-top.webp",
      alt: copy.screenshotAlts.analytics,
    },
  ];

  return (
    <Section
      kicker={copy.analytics.kicker}
      title={copy.analytics.title}
      body={copy.analytics.body}
    >
      <div className="flex flex-col gap-6">
        {/* Breakpoint first: it is the most surprising, most shareable insight. */}
        <div ref={top.ref} className={cn("grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]", top.className)} style={top.style}>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">{CARDS[0].title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{CARDS[0].body}</p>
            <p className="mt-4 inline-flex items-baseline gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
              <span className="tabular font-mono text-sm font-semibold text-warning">68% → 31%</span>
              <span className="text-xs text-text-secondary">{copy.analytics.cards[0].title}</span>
            </p>
          </div>
          <AppWindow src={CARDS[0].image} alt={CARDS[0].alt} />
        </div>

        <div ref={middle.ref} className={cn("grid gap-6 lg:grid-cols-2", middle.className)} style={middle.style}>
          {[CARDS[1], CARDS[2]].map((card) => (
            <div key={card.title} className="flex flex-col gap-4">
              <div>
                <h3 className="text-base font-semibold text-text-primary">{card.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{card.body}</p>
              </div>
              <AppWindow src={card.image} alt={card.alt} />
            </div>
          ))}
        </div>

        <div ref={bottom.ref} className={cn(bottom.className)} style={bottom.style}>
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <AppWindow src={CARDS[3].image} alt={CARDS[3].alt} />
            <div>
              <h3 className="text-base font-semibold text-text-primary">{CARDS[3].title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{CARDS[3].body}</p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
