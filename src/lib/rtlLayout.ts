import { Alert, DevSettings, I18nManager, Platform } from 'react-native';

import type { AppLanguageCode } from '@/lib/appLanguages';
import { isRtlAppLanguage } from '@/lib/appLanguages';
import i18n from '@/i18n/config';

/** Returns true when switching languages requires a native RTL direction flip. */
export function languageChangeNeedsReload(
  previous: AppLanguageCode,
  next: AppLanguageCode,
): boolean {
  return isRtlAppLanguage(previous) !== isRtlAppLanguage(next);
}

export function applyRtlFlag(language: AppLanguageCode) {
  const shouldRtl = isRtlAppLanguage(language);
  I18nManager.allowRTL(shouldRtl);
  I18nManager.forceRTL(shouldRtl);

  // NativeWind `flex-row` is CSS `flex-direction: row` on web — it only
  // mirrors when the document (or an ancestor) is `dir=rtl`.
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const dir = shouldRtl ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
    if (document.body) document.body.dir = dir;
  }
}

export function reloadForRtl(): void {
  if (__DEV__ && DevSettings?.reload) {
    DevSettings.reload();
    return;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.reload();
    return;
  }
  // Production native: user can background/reopen; Alert already explained why.
}

export function promptRtlReloadIfNeeded(
  previous: AppLanguageCode,
  next: AppLanguageCode,
): void {
  applyRtlFlag(next);
  if (!languageChangeNeedsReload(previous, next)) return;
  // Web mirrors immediately via `document.dir` + the root `direction` style.
  if (Platform.OS === 'web') return;

  Alert.alert(
    i18n.t('settings.rtlReloadTitle'),
    i18n.t('settings.rtlReloadBody'),
    [
      { text: i18n.t('settings.rtlReloadLater'), style: 'cancel' },
      {
        text: i18n.t('settings.rtlReloadConfirm'),
        onPress: () => reloadForRtl(),
      },
    ],
  );
}
