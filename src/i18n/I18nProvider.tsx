import { useEffect, type ReactNode } from 'react';
import { I18nManager } from 'react-native';
import { I18nextProvider } from 'react-i18next';

import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { isRtlAppLanguage } from '@/lib/appLanguages';
import i18n, { changeAppLanguage, initI18n } from '@/i18n/config';

initI18n('en');

/**
 * Syncs i18next + native RTL flag with the user's language preference.
 * Full RTL layout flips may require a reload (prompted from LanguagePicker).
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { language, ready } = useLanguagePreference();

  useEffect(() => {
    if (!ready) return;
    void changeAppLanguage(language);

    const shouldRtl = isRtlAppLanguage(language);
    if (I18nManager.isRTL !== shouldRtl) {
      I18nManager.allowRTL(shouldRtl);
      I18nManager.forceRTL(shouldRtl);
    }
  }, [language, ready]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
