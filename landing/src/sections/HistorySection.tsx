import { useI18n } from "@/i18n";
import { Section } from "@/components/Section";
import { AppWindow } from "@/components/AppWindow";
import { useRevealClass } from "@/useReveal";
import { cn } from "@/cn";

/** History + match detail: two real screens side by side. */
export function HistorySection() {
  const { copy } = useI18n();
  const left = useRevealClass<HTMLDivElement>();
  const right = useRevealClass<HTMLDivElement>(90);

  return (
    <Section
      kicker={copy.history.kicker}
      title={copy.history.title}
      body={copy.history.body}
    >
      <ul className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {copy.history.points.map((point, index) => (
          <li
            key={point}
            className="rounded-lg border border-border-subtle bg-bg-surface p-4 text-sm leading-relaxed text-text-secondary"
          >
            <span className="mb-1.5 block font-mono text-[10px] text-accent">
              {String(index + 1).padStart(2, "0")}
            </span>
            {point}
          </li>
        ))}
      </ul>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div ref={left.ref} className={left.className} style={left.style}>
          <AppWindow src="./media/screens/02-history.webp" alt={copy.screenshotAlts.history} />
        </div>
        <div ref={right.ref} className={cn("lg:pt-10", right.className)} style={right.style}>
          <AppWindow
            src="./media/screens/03-match-detail.webp"
            alt={copy.screenshotAlts.matchDetail}
          />
        </div>
      </div>
    </Section>
  );
}
