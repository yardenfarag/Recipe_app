import { useEffect, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { I18nextProvider } from 'react-i18next';

import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { isRtlAppLanguage } from '@/lib/appLanguages';
import { applyRtlFlag } from '@/lib/rtlLayout';
import i18n, { changeAppLanguage, initI18n } from '@/i18n/config';

initI18n('en');

/**
 * Syncs i18next + layout direction with the user's language preference.
 * Native stack headers may still ask for a reload; in-app rows flip immediately
 * via the root `direction` style (and `document.dir` on web).
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { language, ready } = useLanguagePreference();
  const rtl = isRtlAppLanguage(language);

  useEffect(() => {
    if (!ready) return;
    void changeAppLanguage(language);
    applyRtlFlag(language);
  }, [language, ready]);

  return (
    <I18nextProvider i18n={i18n}>
      <View
        style={{
          flex: 1,
          direction: rtl ? 'rtl' : 'ltr',
          ...(Platform.OS === 'web' ? { height: '100%' } : null),
        }}
      >
        {children}
      </View>
    </I18nextProvider>
  );
}
