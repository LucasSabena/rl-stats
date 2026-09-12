import { useEffect } from "react";
import { I18nProvider, useI18n } from "@/i18n";
import { Header } from "@/components/Header";
import { Hero } from "@/sections/Hero";
import { LiveSection } from "@/sections/LiveSection";
import { OverlaysSection } from "@/sections/OverlaysSection";
import { HistorySection } from "@/sections/HistorySection";
import { AnalyticsSection } from "@/sections/AnalyticsSection";
import { MoodSection } from "@/sections/MoodSection";
import { PrivacySection } from "@/sections/PrivacySection";
import { FreeSection } from "@/sections/FreeSection";
import { FaqSection } from "@/sections/FaqSection";
import { FinalCta } from "@/sections/FinalCta";
import { Footer } from "@/sections/Footer";
import { AppWindow } from "@/components/AppWindow";
import { Section } from "@/components/Section";
import { useRevealClass } from "@/useReveal";
import { cn } from "@/cn";

/**
 * Extras: what else ships in the box. Kept visually quieter than the main
 * narrative (smaller screens, tighter copy) so it reads as a bonus, not a
 * second feature dump.
 */
function ExtrasSection() {
  const { copy } = useI18n();
  const grid = useRevealClass<HTMLDivElement>();

  const images = [
    { src: "./media/screens/10-pro-configs.webp", alt: copy.screenshotAlts.proConfigs },
    { src: "./media/screens/09-training-packs.webp", alt: copy.screenshotAlts.trainingPacks },
    { src: "./media/screens/08-players.webp", alt: copy.screenshotAlts.players },
    { src: "./media/screens/14-command-palette.webp", alt: copy.screenshotAlts.commandPalette },
  ];

  return (
    <Section title={copy.extras.title}>
      <div ref={grid.ref} className={cn("grid gap-5 sm:grid-cols-2", grid.className)} style={grid.style}>
        {copy.extras.items.map((item, index) => (
          <div key={item.title} className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{item.body}</p>
            </div>
            <AppWindow src={images[index].src} alt={images[index].alt} />
          </div>
        ))}
      </div>
    </Section>
  );
}

/** Keeps <title>, meta description and the canonical URL in sync with the language. */
function DocumentMeta() {
  const { copy, lang } = useI18n();

  useEffect(() => {
    document.title = copy.meta.title;
    document.documentElement.lang = lang;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute("content", copy.meta.description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", copy.meta.title);
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.setAttribute("content", copy.meta.description);
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute("content", copy.meta.title);
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    if (twitterDescription) twitterDescription.setAttribute("content", copy.meta.description);

    // Canonical must point at the address a crawler would index: the language
    // variant actually being shown, not the root.
    const origin = window.location.origin + window.location.pathname;
    const canonical = lang === "es" ? `${origin}` : `${origin}?lang=${lang}`;
    const link = document.querySelector('link[rel="canonical"]');
    if (link) link.setAttribute("href", canonical);
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", canonical);
  }, [copy, lang]);

  return null;
}

export default function App() {
  return (
    <I18nProvider>
      <DocumentMeta />
      <a
        href="#features"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-bg-elevated focus:px-3 focus:py-2 focus:text-sm focus:text-text-primary"
      >
        Saltar al contenido
      </a>
      <Header />
      <main>
        <Hero />
        <LiveSection />
        <div className="border-y border-border-subtle bg-bg-sunken">
          <OverlaysSection />
        </div>
        <HistorySection />
        <AnalyticsSection />
        <div className="border-y border-border-subtle bg-bg-sunken">
          <MoodSection />
        </div>
        <PrivacySection />
        <FreeSection />
        <ExtrasSection />
        <FaqSection />
        <FinalCta />
      </main>
      <Footer />
    </I18nProvider>
  );
}
