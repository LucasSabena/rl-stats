import { useI18n } from "@/i18n";
import { DownloadButton } from "@/components/DownloadButton";
import { useRevealClass } from "@/useReveal";
import { cn } from "@/cn";

export function FinalCta() {
  const { copy } = useI18n();
  const box = useRevealClass<HTMLDivElement>();

  return (
    <section id="download" className="scroll-mt-24 px-5 py-16 sm:py-24">
      <div
        ref={box.ref}
        className={cn(
          "relative mx-auto w-full max-w-4xl overflow-hidden rounded-xl border border-border-strong bg-bg-surface px-6 py-12 text-center sm:px-12",
          box.className,
        )}
        style={box.style}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklch,var(--accent)_14%,transparent),transparent_70%)]"
        />
        <h2 className="relative text-balance text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          {copy.finalCta.title}
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-pretty text-sm leading-relaxed text-text-secondary sm:text-base">
          {copy.finalCta.body}
        </p>
        <div className="relative mt-8 flex justify-center">
          <DownloadButton size="lg" showVersion />
        </div>
        <p className="relative mt-4 font-mono text-xs text-text-muted">{copy.finalCta.note}</p>
      </div>
    </section>
  );
}
