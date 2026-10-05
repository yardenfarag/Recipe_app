import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import type { AppLanguageCode } from '@/lib/appLanguages';
import en from '@/i18n/locales/en';

// English is the fallback, so it ships in the main bundle. The others load
// when picked, which keeps ~300 KB of strings out of the initial web download.
const localeLoaders: Record<Exclude<AppLanguageCode, 'en'>, () => Promise<{ default: object }>> = {
  es: () => import('@/i18n/locales/es'),
  he: () => import('@/i18n/locales/he'),
  ru: () => import('@/i18n/locales/ru'),
  ar: () => import('@/i18n/locales/ar'),
};

async function loadLocale(language: AppLanguageCode) {
  if (language === 'en' || i18n.hasResourceBundle(language, 'translation')) return;
  const { default: strings } = await localeLoaders[language]();
  i18n.addResourceBundle(language, 'translation', strings);
}

let initialized = false;
let requestedLanguage: AppLanguageCode = 'en';

export function initI18n(language: AppLanguageCode = 'en') {
  if (initialized) {
    void changeAppLanguage(language);
    return i18n;
  }

  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: 'en',
    fallbackLng: 'en',
    compatibilityJSON: 'v4',
    interpolation: { escapeValue: false },
  });
  initialized = true;
  if (language !== 'en') void changeAppLanguage(language);
  return i18n;
}

export async function changeAppLanguage(language: AppLanguageCode) {
  if (!initialized) initI18n();
  requestedLanguage = language;
  await loadLocale(language);
  // A newer pick may have landed while this one was loading.
  if (requestedLanguage !== language) return;
  await i18n.changeLanguage(language);
}

export default i18n;
