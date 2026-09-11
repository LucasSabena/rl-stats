import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

/**
 * Locale bundles are loaded on demand: the app ships three languages and
 * statically importing all of them put every namespace of all three in the
 * entry bundle. `i18nReady` resolves once the detected language (and the
 * Spanish fallback) are available; `languageChanged` loads on switch.
 */
const SUPPORTED = ["es", "en", "pt"] as const;
type Lang = (typeof SUPPORTED)[number];

export const NAMESPACES = [
  "common",
  "live",
  "history",
  "analytics",
  "settings",
  "onboarding",
  "overlay",
  "tracker",
  "profiles",
  "players",
  "matchDetail",
  "proConfigs",
  "share",
  "presets",
  "trainingPacks",
  "mood",
  "prompt",
] as const;

type Bundle = Partial<Record<(typeof NAMESPACES)[number], Record<string, unknown>>>;

const LOCALE_LOADERS: Record<Lang, () => Promise<Bundle>> = {
  es: async () => ({
    common: (await import("./locales/es/common.json")).default,
    live: (await import("./locales/es/live.json")).default,
    history: (await import("./locales/es/history.json")).default,
    analytics: (await import("./locales/es/analytics.json")).default,
    settings: (await import("./locales/es/settings.json")).default,
    onboarding: (await import("./locales/es/onboarding.json")).default,
    overlay: (await import("./locales/es/overlay.json")).default,
    tracker: (await import("./locales/es/tracker.json")).default,
    profiles: (await import("./locales/es/profiles.json")).default,
    players: (await import("./locales/es/players.json")).default,
    matchDetail: (await import("./locales/es/match-detail.json")).default,
    proConfigs: (await import("./locales/es/pro-configs.json")).default,
    share: (await import("./locales/es/share.json")).default,
    presets: (await import("./locales/es/presets.json")).default,
    trainingPacks: (await import("./locales/es/training-packs.json")).default,
    mood: (await import("./locales/es/mood.json")).default,
    prompt: (await import("./locales/es/prompt.json")).default,
  }),
  en: async () => ({
    common: (await import("./locales/en/common.json")).default,
    live: (await import("./locales/en/live.json")).default,
    history: (await import("./locales/en/history.json")).default,
    analytics: (await import("./locales/en/analytics.json")).default,
    settings: (await import("./locales/en/settings.json")).default,
    onboarding: (await import("./locales/en/onboarding.json")).default,
    overlay: (await import("./locales/en/overlay.json")).default,
    tracker: (await import("./locales/en/tracker.json")).default,
    profiles: (await import("./locales/en/profiles.json")).default,
    players: (await import("./locales/en/players.json")).default,
    matchDetail: (await import("./locales/en/match-detail.json")).default,
    proConfigs: (await import("./locales/en/pro-configs.json")).default,
    share: (await import("./locales/en/share.json")).default,
    presets: (await import("./locales/en/presets.json")).default,
    trainingPacks: (await import("./locales/en/training-packs.json")).default,
    mood: (await import("./locales/en/mood.json")).default,
    prompt: (await import("./locales/en/prompt.json")).default,
  }),
  pt: async () => ({
    common: (await import("./locales/pt/common.json")).default,
    live: (await import("./locales/pt/live.json")).default,
    history: (await import("./locales/pt/history.json")).default,
    analytics: (await import("./locales/pt/analytics.json")).default,
    settings: (await import("./locales/pt/settings.json")).default,
    onboarding: (await import("./locales/pt/onboarding.json")).default,
    overlay: (await import("./locales/pt/overlay.json")).default,
    tracker: (await import("./locales/pt/tracker.json")).default,
    profiles: (await import("./locales/pt/profiles.json")).default,
    players: (await import("./locales/pt/players.json")).default,
    matchDetail: (await import("./locales/pt/match-detail.json")).default,
    proConfigs: (await import("./locales/pt/pro-configs.json")).default,
    share: (await import("./locales/pt/share.json")).default,
    presets: (await import("./locales/pt/presets.json")).default,
    trainingPacks: (await import("./locales/pt/training-packs.json")).default,
    mood: (await import("./locales/pt/mood.json")).default,
    prompt: (await import("./locales/pt/prompt.json")).default,
  }),
};

function normalizeLang(lng: string | undefined): Lang {
  const base = (lng ?? "es").split("-")[0].toLowerCase();
  return (SUPPORTED as readonly string[]).includes(base) ? (base as Lang) : "es";
}

const loaded = new Set<Lang>();
const inFlight = new Map<Lang, Promise<void>>();

async function loadLanguage(lng: string | undefined): Promise<void> {
  const lang = normalizeLang(lng);
  if (loaded.has(lang)) return;

  const pending = inFlight.get(lang);
  if (pending) return pending;

  const promise = (async () => {
    const bundle = await LOCALE_LOADERS[lang]();
    for (const [namespace, resources] of Object.entries(bundle)) {
      if (resources) {
        i18n.addResourceBundle(lang, namespace, resources, true, true);
      }
    }
    loaded.add(lang);
    inFlight.delete(lang);
  })();

  inFlight.set(lang, promise);
  return promise;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {},
    fallbackLng: "es",
    supportedLngs: [...SUPPORTED],
    ns: [...NAMESPACES],
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "rl-lang",
      caches: ["localStorage"],
    },
  });

i18n.on("languageChanged", (lng) => {
  void loadLanguage(lng);
});

/**
 * Resolves once the detected language and the Spanish fallback are loaded.
 * `main.tsx` awaits it before the first render so the UI never flashes raw
 * keys; other entrypoints (overlay/prompt) share the same bundle instance.
 */
export const i18nReady: Promise<void> = (async () => {
  const detected = normalizeLang(i18n.language);
  await loadLanguage(detected);
  if (detected !== "es") {
    await loadLanguage("es");
  }
})();

export default i18n;
