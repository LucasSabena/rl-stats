import { useI18n } from "@/i18n";
import { Section } from "@/components/Section";
import { useRevealClass } from "@/useReveal";
import { cn } from "@/cn";

/** Asset map: overlay id → captured file. */
const OVERLAY_IMAGES: Record<string, string> = {
  Enhanced: "./media/overlays/enhanced.webp",
  Scoreboard: "./media/overlays/scoreboard.webp",
  "Player Stats": "./media/overlays/player-stats.webp",
  "Event Feed": "./media/overlays/event-feed.webp",
  Alerts: "./media/overlays/alerts.webp",
  "All-in-One": "./media/overlays/all-in-one.webp",
};

/** Overlays: broadcast-grade visuals, framed as OBS-ready modules. */
export function OverlaysSection() {
  const { copy } = useI18n();
  const header = useRevealClass<HTMLDivElement>();
  const grid = useRevealClass<HTMLDivElement>(60);

  return (
    <Section
      id="overlays"
      kicker={copy.overlays.kicker}
      title={copy.overlays.title}
      body={copy.overlays.body}
      headerExtra={
        <p ref={header.ref} className={cn("mt-4 text-xs text-text-muted", header.className)} style={header.style}>
          {copy.overlays.note}
        </p>
      }
    >
      <div
        ref={grid.ref}
        className={cn("grid items-start gap-4 sm:grid-cols-2", grid.className)}
        style={grid.style}
      >
        {copy.overlays.items.map((item, index) => {
          const src = OVERLAY_IMAGES[item.name];
          return (
            <article
              key={item.name}
              className={cn(
                "overflow-hidden rounded-lg border border-border-subtle bg-bg-surface",
                // The wide scorebug gets the full row; it is the hero overlay.
                index === 0 && "sm:col-span-2",
              )}
            >
              {/* Overlays have wildly different aspect ratios (8.7:1
                  scorebug, 0.65:1 feed). A fixed-height band gives the grid a
                  steady rhythm while `object-contain` keeps every asset
                  undistorted; the featured one gets a taller stage. */}
              <div
                className={cn(
                  "relative flex items-center justify-center border-b border-border-subtle bg-[oklch(0.128_0.007_265)] px-6",
                  index === 0 ? "h-[230px]" : "h-[170px]",
                )}
              >
                {src ? (
                  <img
                    src={src}
                    alt={`${item.name} — ${item.description}`}
                    loading="lazy"
                    decoding="async"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : null}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 p-4">
                <h3 className="text-sm font-semibold text-text-primary">{item.name}</h3>
                <p className="text-xs leading-relaxed text-text-muted">{item.description}</p>
              </div>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
