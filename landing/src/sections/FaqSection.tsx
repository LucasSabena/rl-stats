import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n";
import { Section } from "@/components/Section";
import { cn } from "@/cn";

/** FAQ: native <details> so it works without JS and stays accessible. */
export function FaqSection() {
  const { copy } = useI18n();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section id="faq" title={copy.faq.title}>
      <div className="mx-auto max-w-3xl divide-y divide-border-subtle border-y border-border-subtle">
        {copy.faq.items.map((item, index) => {
          const isOpen = open === index;
          return (
            <div key={item.q}>
              <h3>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left"
                >
                  <span className="text-sm font-medium text-text-primary sm:text-base">
                    {item.q}
                  </span>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={cn(
                      "shrink-0 text-text-muted transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
              </h3>
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-250 ease-out",
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <p className="pb-5 pr-8 text-sm leading-relaxed text-text-secondary">
                    {item.a}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
