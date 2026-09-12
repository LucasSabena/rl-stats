/**
 * Minimal i18n for the landing: three locales, no runtime dependency on
 * react-i18next. The copy lives in `copy.ts` as typed objects, which keeps
 * missing translations a compile error instead of a runtime fallback.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { COPY, type Copy } from "./copy";

export const LANGS = ["es", "en", "pt"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_LABELS: Record<Lang, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
};

const STORAGE_KEY = "rl-landing-lang";

function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/**
 * Language resolution order:
 *   1. `?lang=` in the URL — this is what makes each translation shareable and
 *      crawlable as its own address (`/?lang=en`, `/?lang=pt`).
 *   2. The stored preference from a previous visit.
 *   3. The browser's languages.
 *   4. Spanish, the product's primary language.
 */
function detectLang(): Lang {
  if (typeof window === "undefined") return "es";

  const fromUrl = new URLSearchParams(window.location.search).get("lang");
  if (isLang(fromUrl)) return fromUrl;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isLang(stored)) return stored;

  const navigatorLangs = [...(window.navigator.languages ?? []), window.navigator.language];
  for (const tag of navigatorLangs) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (isLang(base)) return base;
  }
  return "es";
}

interface I18nValue {
  lang: Lang;
  copy: Copy;
  setLang: (lang: Lang) => void;
  /** Interpolates `{{name}}` placeholders in a copy string. */
  format: (template: string, vars: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: language preference simply won't persist.
    }
    // Keep the URL in sync so the current translation is shareable and the
    // canonical/hreflang set stays truthful for crawlers.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "es") url.searchParams.delete("lang");
      else url.searchParams.set("lang", next);
      window.history.replaceState({}, "", url);
    }
  }, []);

  const format = useCallback(
    (template: string, vars: Record<string, string | number>) =>
      template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
        key in vars ? String(vars[key]) : match,
      ),
    [],
  );

  const value = useMemo<I18nValue>(
    () => ({ lang, copy: COPY[lang], setLang, format }),
    [lang, setLang, format],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}
