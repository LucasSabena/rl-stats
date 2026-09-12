import { Github, MessageCircle } from "lucide-react";
import { useI18n, LANGS, LANG_LABELS } from "@/i18n";
import { REPO_URL, RELEASES_URL } from "@/release";
import { cn } from "@/cn";

export function Footer() {
  const { copy, lang, setLang } = useI18n();

  return (
    <footer className="border-t border-border-subtle px-5 py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2.5">
            <img src="./brand/logo-64.png" alt="" width={24} height={24} className="rounded" />
            <span className="text-sm font-semibold text-text-primary">RL Stats</span>
          </div>
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-text-muted">
            {copy.footer.tagline}
          </p>
        </div>

        <nav aria-label={copy.footer.product}>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
            {copy.footer.product}
          </h2>
          <ul className="flex flex-col gap-2 text-xs">
            <li>
              <a href="#features" className="text-text-secondary transition-colors hover:text-text-primary">
                {copy.nav.features}
              </a>
            </li>
            <li>
              <a href="#overlays" className="text-text-secondary transition-colors hover:text-text-primary">
                {copy.nav.overlays}
              </a>
            </li>
            <li>
              <a href="#privacy" className="text-text-secondary transition-colors hover:text-text-primary">
                {copy.nav.privacy}
              </a>
            </li>
            <li>
              <a
                href={RELEASES_URL}
                className="text-text-secondary transition-colors hover:text-text-primary"
              >
                {copy.nav.download}
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-label={copy.footer.community}>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
            {copy.footer.community}
          </h2>
          <ul className="flex flex-col gap-2 text-xs">
            <li>
              <a
                href={REPO_URL}
                className="inline-flex items-center gap-1.5 text-text-secondary transition-colors hover:text-text-primary"
              >
                <Github size={12} aria-hidden="true" />
                GitHub
              </a>
            </li>
            <li>
              <a
                href={`${REPO_URL}/issues`}
                className="inline-flex items-center gap-1.5 text-text-secondary transition-colors hover:text-text-primary"
              >
                <MessageCircle size={12} aria-hidden="true" />
                Issues
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
            {copy.footer.languages}
          </h2>
          <ul className="flex flex-col gap-2 text-xs">
            {LANGS.map((code) => (
              <li key={code}>
                <button
                  type="button"
                  onClick={() => setLang(code)}
                  aria-pressed={code === lang}
                  className={cn(
                    "transition-colors",
                    code === lang
                      ? "text-text-primary"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  {LANG_LABELS[code]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-10 flex w-full max-w-6xl flex-col gap-3 border-t border-border-subtle pt-6 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>{copy.footer.madeBy} · MIT</p>
        <p className="max-w-xl leading-relaxed">{copy.footer.trademark}</p>
      </div>
    </footer>
  );
}
