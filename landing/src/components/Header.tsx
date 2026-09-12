import { useEffect, useState } from "react";
import { Menu, X, Star } from "lucide-react";
import { useI18n, LANGS, LANG_LABELS, type Lang } from "@/i18n";
import { DownloadButton } from "@/components/DownloadButton";
import { REPO_URL } from "@/release";
import { cn } from "@/cn";

const SECTIONS = [
  { id: "features", key: "features" as const },
  { id: "overlays", key: "overlays" as const },
  { id: "privacy", key: "privacy" as const },
  { id: "faq", key: "faq" as const },
];

export function Header() {
  const { copy, lang, setLang } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile sheet when growing past the breakpoint so the layout
  // never keeps a hidden menu mounted over the desktop header.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = () => setMobileOpen(false);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-200",
        scrolled
          ? "border-b border-border-subtle bg-[color-mix(in_oklch,var(--canvas)_88%,transparent)] backdrop-blur-md"
          : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-5">
        <a href="#top" className="flex shrink-0 items-center gap-2.5">
          <img src="./brand/logo-64.png" alt="" width={28} height={28} className="rounded" />
          <span className="text-sm font-semibold tracking-tight text-text-primary">RL Stats</span>
        </a>

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Secciones">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-md px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              {copy.nav[section.key]}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <GithubButton />
          <LangPicker lang={lang} setLang={setLang} />
          <div className="hidden sm:block">
            <DownloadButton />
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-strong text-text-secondary md:hidden"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-border-subtle bg-bg-base md:hidden">
          <nav className="mx-auto flex w-full max-w-6xl flex-col px-5 py-3" aria-label="Secciones">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              >
                {copy.nav[section.key]}
              </a>
            ))}
            <div className="px-2 pt-2 pb-1">
              <DownloadButton className="w-full" />
            </div>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-2 rounded-md px-2 py-2.5 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              <GithubMark className="h-4 w-4" />
              GitHub
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

/**
 * The official GitHub mark as an inline SVG. `lucide-react` ships a generic
 * cat silhouette rather than the Octocat mark, and the real mark is what
 * people recognise in a nav bar.
 */
export function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/**
 * Repo link with a live star count. The count is fetched once from the
 * unauthenticated GitHub API; if it fails the button still works, just
 * without the number — the link is the point, the count is a bonus.
 */
function GithubButton() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("https://api.github.com/repos/LucasSabena/rl-stats", {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!controller.signal.aborted && data && typeof data.stargazers_count === "number") {
          setStars(data.stargazers_count);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const label =
    stars !== null && stars > 0
      ? `${stars.toLocaleString()}`
      : null;

  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="RL Stats en GitHub"
      className="hidden h-9 items-center gap-1.5 rounded-md border border-border-subtle px-2.5 text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary sm:inline-flex"
    >
      <GithubMark className="h-4 w-4" />
      {label && (
        <span className="inline-flex items-center gap-1 font-mono text-xs tabular">
          <Star size={11} className="text-warning" aria-hidden="true" />
          {label}
        </span>
      )}
    </a>
  );
}

function LangPicker({ lang, setLang }: { lang: Lang; setLang: (lang: Lang) => void }) {
  return (
    <div
      className="flex items-center rounded-md border border-border-subtle p-0.5"
      role="group"
      aria-label="Idioma / Language"
    >
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={code === lang}
          title={LANG_LABELS[code]}
          className={cn(
            "rounded px-2 py-1 font-mono text-[11px] font-semibold uppercase transition-colors",
            code === lang
              ? "bg-bg-active text-text-primary"
              : "text-text-muted hover:text-text-primary",
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
