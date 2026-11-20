import i18next from "i18next";

import en from "@shared/i18n/locales/en";

// The app's own strings, from the files the mobile app uses. English only for now: choosing a language
// and right-to-left layout arrive with the app shell (PIN-130).
const i18n = i18next.createInstance();

void i18n.init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
  // The strings are already in memory, so `t` works as soon as this module has loaded.
  initAsync: false,
});

export const t = i18n.t.bind(i18n);
export default i18n;
