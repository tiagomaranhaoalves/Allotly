import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";

export const SUPPORTED_LANGUAGES = ["en", "pt-BR", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  "pt-BR": "Português (BR)",
  es: "Español",
};

const LOCALE_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  "pt-BR": () => import("./locales/pt-BR.json"),
  es: () => import("./locales/es.json"),
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    load: "currentOnly",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "allotly-lang",
      caches: ["localStorage"],
    },
    react: { useSuspense: false },
  });

async function loadLanguage(lng: string) {
  const loader = LOCALE_LOADERS[lng];
  if (loader && !i18n.hasResourceBundle(lng, "translation")) {
    const mod = await loader();
    const translations = (mod as any).default ?? mod;
    i18n.addResourceBundle(lng, "translation", translations, true, true);
  }
}

function syncHtmlLang(lng: string) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
}

const initialLng = i18n.resolvedLanguage || i18n.language || "en";
syncHtmlLang(initialLng);
if (initialLng !== "en") {
  loadLanguage(initialLng);
}

i18n.on("languageChanged", (lng) => {
  syncHtmlLang(lng);
  loadLanguage(lng);
});

export default i18n;
