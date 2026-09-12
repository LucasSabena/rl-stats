import { Check, Lock } from "lucide-react";
import { useI18n } from "@/i18n";
import { Section } from "@/components/Section";
import { DownloadButton } from "@/components/DownloadButton";
import { useRevealClass } from "@/useReveal";
import { REPO_URL, RELEASES_URL } from "@/release";
import { cn } from "@/cn";

/** Pricing: everything free, with the optional cloud tier stated honestly. */
export function FreeSection() {
  const { copy } = useI18n();
  const left = useRevealClass<HTMLDivElement>();
  const right = useRevealClass<HTMLDivElement>(80);

  return (
    <Section
      kicker={copy.free.kicker}
      title={copy.free.title}
      body={copy.free.body}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div
          ref={left.ref}
          className={cn(
            "rounded-lg border border-accent/30 bg-bg-surface p-6",
            left.className,
          )}
          style={left.style}
        >
          <ul className="grid gap-3 sm:grid-cols-2">
            {copy.free.included.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-text-secondary">
                <Check size={15} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-border-subtle pt-5">
            <DownloadButton size="lg" showVersion />
          </div>
        </div>

        <div
          ref={right.ref}
          className={cn(
            "rounded-lg border border-border-subtle bg-bg-sunken p-6",
            right.className,
          )}
          style={right.style}
        >
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-text-muted" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-text-primary">{copy.free.optionalTitle}</h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            {copy.free.optionalBody}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
            <a
              href={`${REPO_URL}#cloud-sync`}
              className="underline decoration-border-strong underline-offset-4 transition-colors hover:text-text-primary"
            >
              {copy.free.optionalCta}
            </a>
            <a
              href={RELEASES_URL}
              className="underline decoration-border-strong underline-offset-4 transition-colors hover:text-text-primary"
            >
              GitHub Releases
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}
