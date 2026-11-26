import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui/Text';
import { useThemePreference } from '@/hooks/useThemePreference';

/**
 * Shown while a recipe written in another language than the app's is translated for the first time, so the reader
 * doesn't see it in its own language and then watch it change (ADR 012). `back` is the screen's own way back, as on
 * its other states before the recipe.
 */
export function RecipeTranslatingScreen({ back }: { back: ReactNode }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  return (
    <Screen edges={['top', 'bottom']}>
      {back}
      <View
        accessibilityLiveRegion="polite"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}
      >
        <ActivityIndicator color={colors.primary} size="large" />
        <Text variant="body" tone="muted" align="center">
          {t('recipe.translating')}
        </Text>
      </View>
    </Screen>
  );
}
