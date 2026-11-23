import Ionicons from '@expo/vector-icons/Ionicons';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { HAIRLINE } from '@/components/ui/tokens';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { APP_LANGUAGES, type AppLanguageCode } from '@shared/lib/appLanguages';
import { promptRtlReloadIfNeeded } from '@/lib/rtlLayout';

type LanguagePickerProps = {
  /**
   * When true, skip the RTL reload alert (e.g. during onboarding) so a
   * mid-flow reload does not kill the pager. Caller should prompt later.
   */
  skipRtlPrompt?: boolean;
  /** Prefix for the admin Activity log id; the language code is appended. */
  trackId?: string;
};

/**
 * The app languages as rows on one tile (Night Market, PIN-177): each in its own script, with its name in the app
 * language under it, and a filled check on the chosen one.
 */
export function LanguagePicker({
  skipRtlPrompt = false,
  trackId = 'language.select',
}: LanguagePickerProps) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguagePreference();
  const { colors } = useThemePreference();

  function handleSelect(next: AppLanguageCode) {
    if (next === language) return;
    const previous = language;
    setLanguage(next);
    if (!skipRtlPrompt) {
      promptRtlReloadIfNeeded(previous, next);
    }
  }

  return (
    <Tile
      accessibilityRole="radiogroup"
      accessibilityLabel={t('settings.language')}
      style={{ paddingHorizontal: 8, paddingVertical: 4 }}
    >
      {APP_LANGUAGES.map((lang, index) => {
        const active = language === lang.code;
        const translated = t(`languages.${lang.code}`);
        const showTranslated = translated !== lang.nativeLabel;
        return (
          <Fragment key={lang.code}>
            {index > 0 ? (
              <View
                accessible={false}
                importantForAccessibility="no"
                style={{ height: HAIRLINE, backgroundColor: colors.border, marginHorizontal: 8 }}
              />
            ) : null}
            <Pressable
              trackId={`${trackId}.${lang.code}`}
              onPress={() => handleSelect(lang.code)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={showTranslated ? `${lang.nativeLabel}, ${translated}` : lang.nativeLabel}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                minHeight: 56,
                paddingHorizontal: 8,
                paddingVertical: 8,
                borderRadius: 18,
                backgroundColor: pressed ? colors.backgroundElement : 'transparent',
              })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodySmall" weight="semibold">
                  {lang.nativeLabel}
                </Text>
                {showTranslated ? (
                  <Text variant="caption" tone="muted">
                    {translated}
                  </Text>
                ) : null}
              </View>
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: active ? 0 : 2,
                  borderColor: colors.border,
                  backgroundColor: active ? colors.primary : 'transparent',
                }}
              >
                {active ? <Ionicons name="checkmark" size={15} color={colors.onPrimary} /> : null}
              </View>
            </Pressable>
          </Fragment>
        );
      })}
    </Tile>
  );
}
