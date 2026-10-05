import { useEffect, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { I18nextProvider } from 'react-i18next';

import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
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
  const { colors } = useThemePreference();
  const rtl = isRtlAppLanguage(language);
  // Non-English strings load on demand; hold the first paint until they are in
  // so the app doesn't flash English. Later switches keep the current UI up.
  const [firstLanguageApplied, setFirstLanguageApplied] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    applyRtlFlag(language);
    changeAppLanguage(language)
      .catch((error) => console.warn('[i18n] language load failed', error))
      .finally(() => {
        if (!cancelled) setFirstLanguageApplied(true);
      });
    return () => {
      cancelled = true;
    };
  }, [language, ready]);

  return (
    <I18nextProvider i18n={i18n}>
      <View
        style={{
          flex: 1,
          // Shows while stored preferences load, instead of a blank page.
          backgroundColor: colors.background,
          direction: rtl ? 'rtl' : 'ltr',
          ...(Platform.OS === 'web' ? { height: '100%' } : null),
        }}
      >
        {firstLanguageApplied ? children : null}
      </View>
    </I18nextProvider>
  );
}
