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
  if (!languageChangeNeedsReload(previous, next)) return;

  applyRtlFlag(next);

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
