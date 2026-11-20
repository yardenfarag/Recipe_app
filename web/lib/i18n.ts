import i18next from "i18next";

import { isRtlAppLanguage, resolveAppLanguageFromDevice, type AppLanguageCode } from "@shared/lib/appLanguages";
import en from "@shared/i18n/locales/en";

// The app's own strings, from the files the mobile app uses (shared/i18n/locales). English ships with the page;
// the other languages load when needed, as on mobile.
const i18n = i18next.createInstance();

void i18n.init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
  // English is already in memory, so `t` works as soon as this module has loaded.
  initAsync: false,
});

const loaders: Record<Exclude<AppLanguageCode, "en">, () => Promise<{ default: object }>> = {
  es: () => import("@shared/i18n/locales/es"),
  he: () => import("@shared/i18n/locales/he"),
  ru: () => import("@shared/i18n/locales/ru"),
  ar: () => import("@shared/i18n/locales/ar"),
};

let requested: AppLanguageCode = "en";

/** Loads a language if needed and switches to it. A later call wins when two overlap. */
export async function changeLanguage(language: AppLanguageCode): Promise<void> {
  requested = language;
  if (language !== "en" && !i18n.hasResourceBundle(language, "translation")) {
    const { default: strings } = await loaders[language]();
    i18n.addResourceBundle(language, "translation", strings);
  }
  if (requested !== language) return;
  await i18n.changeLanguage(language);
}

/** The language to show: the account's saved one when signed in, else the browser's. */
export function pickLanguage(accountLocale: unknown, browserLanguage: string | undefined): AppLanguageCode {
  if (typeof accountLocale === "string") {
    const fromAccount = resolveAppLanguageFromDevice(accountLocale);
    if (fromAccount !== "en" || accountLocale.toLowerCase().startsWith("en")) return fromAccount;
  }
  return resolveAppLanguageFromDevice(browserLanguage);
}

export function textDirection(language: AppLanguageCode): "rtl" | "ltr" {
  return isRtlAppLanguage(language) ? "rtl" : "ltr";
}

export const t = i18n.t.bind(i18n);
export default i18n;
