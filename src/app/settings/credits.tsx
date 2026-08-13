import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';

import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { TokenPurchaseSheet } from '@/components/TokenPurchaseSheet';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { FREE_MONTHLY_EXTRACT_LIMIT } from '@/lib/quotas';

export default function CreditSettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { freeExtractsRemaining, purchasedCredits, totalCredits } = useProfile();
  const [creditsOpen, setCreditsOpen] = useState(false);

  return (
    <>
      <SettingsDetailScreen>
        <Text className="mb-1 text-3xl font-bold" style={{ color: colors.text }}>
          {t('settings.recipeCredits')}
        </Text>
        <Text className="mb-3 text-sm" style={{ color: colors.accent }}>
          {t('settings.creditsTotal', { count: totalCredits ?? 0 })}
        </Text>
        <Text className="text-xs leading-5" style={{ color: colors.textSecondary }}>
          {t('settings.creditsFree', {
            remaining: freeExtractsRemaining ?? 0,
            limit: FREE_MONTHLY_EXTRACT_LIMIT,
          })}
        </Text>
        <Text className="mt-1 text-xs leading-5" style={{ color: colors.textSecondary }}>
          {t('settings.creditsPurchased', { count: purchasedCredits ?? 0 })}
        </Text>
        <Text className="mt-1 text-xs leading-5" style={{ color: colors.textSecondary }}>
          {t('settings.creditsReset')}
        </Text>
        <Pressable
          className="mt-4 self-start rounded-[18px] px-4 py-2.5 active:opacity-80"
          style={{ backgroundColor: colors.primary }}
          onPress={() => setCreditsOpen(true)}
          accessibilityRole="button"
        >
          <Text className="text-sm font-bold text-white">{t('credits.buyAction')}</Text>
        </Pressable>
      </SettingsDetailScreen>
      <TokenPurchaseSheet visible={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </>
  );
}
