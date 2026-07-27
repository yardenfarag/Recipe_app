import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import type { AppLanguageCode } from '@/lib/appLanguages';
import ar from '@/i18n/locales/ar';
import en from '@/i18n/locales/en';
import es from '@/i18n/locales/es';
import he from '@/i18n/locales/he';
import ru from '@/i18n/locales/ru';

const resources = {
  en: { translation: en },
  es: { translation: es },
  he: { translation: he },
  ru: { translation: ru },
  ar: { translation: ar },
} as const;

let initialized = false;

export function initI18n(language: AppLanguageCode = 'en') {
  if (initialized) {
    void i18n.changeLanguage(language);
    return i18n;
  }

  void i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: 'en',
    compatibilityJSON: 'v4',
    interpolation: { escapeValue: false },
  });
  initialized = true;
  return i18n;
}

export async function changeAppLanguage(language: AppLanguageCode) {
  if (!initialized) {
    initI18n(language);
    return;
  }
  await i18n.changeLanguage(language);
}

export default i18n;
