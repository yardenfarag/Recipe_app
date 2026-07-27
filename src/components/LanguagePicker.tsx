import { Pressable, Text, View } from 'react-native';

import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { APP_LANGUAGES, type AppLanguageCode } from '@/lib/appLanguages';
import { promptRtlReloadIfNeeded } from '@/lib/rtlLayout';

type LanguagePickerProps = {
  /**
   * When true, skip the RTL reload alert (e.g. during onboarding) so a
   * mid-flow reload does not kill the pager. Caller should prompt later.
   */
  skipRtlPrompt?: boolean;
};

/** Vertical list of app languages for Settings / onboarding. */
export function LanguagePicker({ skipRtlPrompt = false }: LanguagePickerProps) {
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
    <View className="gap-2">
      {APP_LANGUAGES.map((lang) => {
        const active = language === lang.code;
        return (
          <Pressable
            key={lang.code}
            onPress={() => handleSelect(lang.code)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="flex-row items-center justify-between rounded-[18px] border px-4 py-3 active:opacity-80"
            style={{
              backgroundColor: active ? colors.primarySoft : colors.surface,
              borderColor: active ? colors.primary : colors.border,
            }}
          >
            <View>
              <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                {lang.nativeLabel}
              </Text>
              <Text className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                {lang.label}
              </Text>
            </View>
            {active ? (
              <Text className="text-xs font-bold" style={{ color: colors.primary }}>
                ✓
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
