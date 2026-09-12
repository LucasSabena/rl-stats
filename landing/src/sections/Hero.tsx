import { useEffect, useState } from "react";
import { Download, ShieldCheck, HardDrive, EyeOff } from "lucide-react";
import { useI18n } from "@/i18n";
import { DownloadButton } from "@/components/DownloadButton";
import { useParallax } from "@/components/Section";
import { fetchLatestRelease } from "@/release";

/** Hero: product promise, the download CTA, and one real screenshot. */
export function Hero() {
  const { copy, format } = useI18n();
  const parallax = useParallax(10);
  // The badge must never disagree with the button, so both read the same
  // resolved release instead of hardcoding a version.
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchLatestRelease(controller.signal).then((info) => {
      if (!controller.signal.aborted) setVersion(info.version || null);
    });
    return () => controller.abort();
  }, []);

  return (
    <section id="top" className="relative overflow-hidden px-5 pt-28 pb-16 sm:pt-32 lg:pb-24">
      <div className="hero-glow" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-surface px-3 py-1 font-mono text-[11px] text-text-secondary">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
            {version
              ? format(copy.hero.badge, { version })
              : copy.hero.platform}
          </p>

          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.08] tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
            {copy.hero.title}{" "}
            <span className="text-accent">{copy.hero.titleAccent}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-text-secondary sm:text-lg">
            {copy.hero.subtitle}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <DownloadButton size="lg" showVersion />
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-md px-4 py-3 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              {copy.hero.ctaSecondary}
              <span aria-hidden="true">↓</span>
            </a>
          </div>

          <ul className="mt-10 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
            {[
              { icon: Download, title: copy.hero.free, detail: copy.hero.freeDetail },
              { icon: HardDrive, title: copy.hero.local, detail: copy.hero.localDetail },
              { icon: EyeOff, title: copy.hero.noAccount, detail: copy.hero.noAccountDetail },
            ].map((item) => (
              <li
                key={item.title}
                className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-surface/60 p-4"
              >
                <item.icon size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-text-muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-text-muted">
            <ShieldCheck size={13} aria-hidden="true" />
            {copy.hero.platform} · {copy.free.license}
          </p>
        </div>

        {/* The recording is the proof: the real dashboard, live, in motion. */}
        <div
          className="relative mx-auto mt-14 max-w-5xl"
          style={{ transform: `translateY(-${parallax}px)` }}
        >
          <div className="overflow-hidden rounded-lg border border-border-strong bg-bg-surface shadow-[var(--shadow-4)]">
            <div className="flex h-8 items-center gap-2 border-b border-border-subtle bg-bg-elevated px-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.66_0.2_25)]" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.79_0.16_75)]" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.74_0.17_157)]" aria-hidden="true" />
              <span className="ml-2 font-mono text-[10px] text-text-muted">RL Stats</span>
              <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] text-success">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                EN VIVO
              </span>
            </div>
            <video
              className="block w-full"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              poster="./media/video/live-dashboard-poster.webp"
              aria-label={copy.screenshotAlts.live}
            >
              <source src="./media/video/live-dashboard.mp4" type="video/mp4" />
              <img src="./media/screens/01-live.webp" alt={copy.screenshotAlts.live} />
            </video>
          </div>
          <p className="mt-3 text-center text-xs text-text-muted">{copy.live.hint}</p>
        </div>
      </div>
    </section>
  );
}
