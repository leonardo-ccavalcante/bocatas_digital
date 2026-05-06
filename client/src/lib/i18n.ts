import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import es from "../locales/es.json";
import ca from "../locales/ca.json";
import gl from "../locales/gl.json";
import eu from "../locales/eu.json";
import fr from "../locales/fr.json";
import wo from "../locales/wo.json";
import ar from "../locales/ar.json";
import ptBr from "../locales/pt-br.json";
import en from "../locales/en.json";
import ff from "../locales/ff.json";
import bm from "../locales/bm.json";
import da from "../locales/da.json";

export const SUPPORTED_LANGUAGES = [
  { code: "es", name: "Español", dir: "ltr" as const },
  { code: "ca", name: "Català", dir: "ltr" as const },
  { code: "gl", name: "Galego", dir: "ltr" as const },
  { code: "eu", name: "Euskara", dir: "ltr" as const },
  { code: "fr", name: "Français", dir: "ltr" as const },
  { code: "wo", name: "Wolof", dir: "ltr" as const },
  { code: "ar", name: "العربية", dir: "rtl" as const },
  { code: "pt-br", name: "Português (BR)", dir: "ltr" as const },
  { code: "en", name: "English", dir: "ltr" as const },
  { code: "ff", name: "Fulfulde", dir: "ltr" as const },
  { code: "bm", name: "Bamanankan", dir: "ltr" as const },
  { code: "da", name: "الدارجة", dir: "rtl" as const },
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const RTL_LANGUAGES: SupportedLanguageCode[] = ["ar", "da"];

export function isRTL(lang: string): boolean {
  return RTL_LANGUAGES.includes(lang as SupportedLanguageCode);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      ca: { translation: ca },
      gl: { translation: gl },
      eu: { translation: eu },
      fr: { translation: fr },
      wo: { translation: wo },
      ar: { translation: ar },
      "pt-br": { translation: ptBr },
      en: { translation: en },
      ff: { translation: ff },
      bm: { translation: bm },
      da: { translation: da },
    },
    fallbackLng: "es",
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "bocatas_language",
      caches: ["localStorage"],
    },
  });

export default i18n;
