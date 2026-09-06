import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import common from "./locales/es/common.json";
import live from "./locales/es/live.json";
import history from "./locales/es/history.json";
import analytics from "./locales/es/analytics.json";
import settings from "./locales/es/settings.json";
import onboarding from "./locales/es/onboarding.json";
import overlay from "./locales/es/overlay.json";
import tracker from "./locales/es/tracker.json";
import profiles from "./locales/es/profiles.json";
import players from "./locales/es/players.json";
import matchDetail from "./locales/es/match-detail.json";
import proConfigs from "./locales/es/pro-configs.json";
import share from "./locales/es/share.json";
import presets from "./locales/es/presets.json";
import trainingPacks from "./locales/es/training-packs.json";
import mood from "./locales/es/mood.json";

import commonEn from "./locales/en/common.json";
import liveEn from "./locales/en/live.json";
import historyEn from "./locales/en/history.json";
import analyticsEn from "./locales/en/analytics.json";
import settingsEn from "./locales/en/settings.json";
import onboardingEn from "./locales/en/onboarding.json";
import overlayEn from "./locales/en/overlay.json";
import trackerEn from "./locales/en/tracker.json";
import profilesEn from "./locales/en/profiles.json";
import playersEn from "./locales/en/players.json";
import matchDetailEn from "./locales/en/match-detail.json";
import proConfigsEn from "./locales/en/pro-configs.json";
import shareEn from "./locales/en/share.json";
import presetsEn from "./locales/en/presets.json";
import trainingPacksEn from "./locales/en/training-packs.json";
import moodEn from "./locales/en/mood.json";

import commonPt from "./locales/pt/common.json";
import livePt from "./locales/pt/live.json";
import historyPt from "./locales/pt/history.json";
import analyticsPt from "./locales/pt/analytics.json";
import settingsPt from "./locales/pt/settings.json";
import onboardingPt from "./locales/pt/onboarding.json";
import overlayPt from "./locales/pt/overlay.json";
import trackerPt from "./locales/pt/tracker.json";
import profilesPt from "./locales/pt/profiles.json";
import playersPt from "./locales/pt/players.json";
import matchDetailPt from "./locales/pt/match-detail.json";
import proConfigsPt from "./locales/pt/pro-configs.json";
import sharePt from "./locales/pt/share.json";
import presetsPt from "./locales/pt/presets.json";
import trainingPacksPt from "./locales/pt/training-packs.json";
import moodPt from "./locales/pt/mood.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: {
        common,
        live,
        history,
        analytics,
        settings,
        onboarding,
        overlay,
        tracker,
        profiles,
        players,
        matchDetail,
        proConfigs,
        share,
        presets,
        trainingPacks,
        mood,
      },
      en: {
        common: commonEn,
        live: liveEn,
        history: historyEn,
        analytics: analyticsEn,
        settings: settingsEn,
        onboarding: onboardingEn,
        overlay: overlayEn,
        tracker: trackerEn,
        profiles: profilesEn,
        players: playersEn,
        matchDetail: matchDetailEn,
        proConfigs: proConfigsEn,
        share: shareEn,
        presets: presetsEn,
        trainingPacks: trainingPacksEn,
        mood: moodEn,
      },
      pt: {
        common: commonPt,
        live: livePt,
        history: historyPt,
        analytics: analyticsPt,
        settings: settingsPt,
        onboarding: onboardingPt,
        overlay: overlayPt,
        tracker: trackerPt,
        profiles: profilesPt,
        players: playersPt,
        matchDetail: matchDetailPt,
        proConfigs: proConfigsPt,
        share: sharePt,
        presets: presetsPt,
        trainingPacks: trainingPacksPt,
        mood: moodPt,
      },
    },
    fallbackLng: "es",
    supportedLngs: ["es", "en", "pt"],
    ns: [
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
    ],
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

export default i18n;