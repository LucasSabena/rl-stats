import { Database, EyeOff, HardDrive, UserX } from "lucide-react";
import { useI18n } from "@/i18n";
import { Section } from "@/components/Section";
import { AppWindow } from "@/components/AppWindow";
import { useRevealClass } from "@/useReveal";
import { cn } from "@/cn";

const ICONS = [UserX, EyeOff, HardDrive, Database];

/** Privacy + local-first: the trust section, argued with evidence. */
export function PrivacySection() {
  const { copy } = useI18n();
  const grid = useRevealClass<HTMLDivElement>();
  const shot = useRevealClass<HTMLDivElement>(100);

  return (
    <Section
      id="privacy"
      className="border-y border-border-subtle bg-bg-sunken"
      kicker={copy.privacy.kicker}
      title={copy.privacy.title}
      body={copy.privacy.body}
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
        <div
          ref={grid.ref}
          // `content-start` matters: the outer two-column grid stretches this
          // column to match the taller screenshot column, and without it the
          // inner auto rows absorb that extra height as gaps.
          className={cn("grid content-start items-start gap-4 sm:grid-cols-2", grid.className)}
          style={grid.style}
        >
          {copy.privacy.items.map((item, index) => {
            const Icon = ICONS[index];
            return (
              <div
                key={item.title}
                className="rounded-lg border border-border-subtle bg-bg-surface p-4"
              >
                <Icon size={16} className="mb-3 text-accent" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{item.body}</p>
              </div>
            );
          })}

          <div className="rounded-lg border border-border-subtle bg-bg-surface p-4 sm:col-span-2">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
              {copy.privacy.pathLabel}
            </p>
            <code className="block overflow-x-auto font-mono text-xs text-text-secondary">
              {copy.privacy.path}
            </code>
          </div>
        </div>

        <div ref={shot.ref} className={cn("flex flex-col gap-4", shot.className)} style={shot.style}>
          <AppWindow
            src="./media/screens/12-settings-streaming.webp"
            alt={copy.screenshotAlts.streaming}
          />
          <AppWindow
            src="./media/screens/16-overlay-window.webp"
            alt={copy.screenshotAlts.overlayWindow}
          />
        </div>
      </div>
    </Section>
  );
}
