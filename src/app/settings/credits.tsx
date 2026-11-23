import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, View } from 'react-native';

import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { TokenPurchaseSheet } from '@/components/TokenPurchaseSheet';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Tile, TileLabel } from '@/components/ui/Tile';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { FREE_MONTHLY_EXTRACT_LIMIT } from '@shared/lib/quotas';
import { creditPurchasesOfferedOn } from '@/lib/purchases';
import { openAppStore } from '@/lib/appStore';

/** A count in the app language's digits and grouping ("1,200"). */
function formatCount(count: number, language: string): string {
  try {
    return new Intl.NumberFormat(language).format(count);
  } catch {
    return String(count);
  }
}

export default function CreditSettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const { totalCredits, refresh } = useProfile();
  const [creditsOpen, setCreditsOpen] = useState(false);
  const purchasesHere = creditPurchasesOfferedOn(Platform.OS);

  return (
    <>
      <SettingsDetailScreen>
        {/* The balance at a glance: the total as a big number, and where free credits come from. */}
        <Tile padding={20} style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
              <TileLabel accessibilityRole="header">{t('web.credits.available')}</TileLabel>
              {totalCredits == null ? (
                <ActivityIndicator color={colors.accentText} style={{ alignSelf: 'flex-start', height: 54 }} />
              ) : (
                <Text
                  variant="number"
                  accessibilityLabel={t('settings.creditsTotal', { count: totalCredits })}
                  accessibilityLiveRegion="polite"
                >
                  {formatCount(totalCredits, type.language)}
                </Text>
              )}
            </View>
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.accentSoft,
              }}
            >
              <Ionicons name="sparkles-outline" size={20} color={colors.accentText} />
            </View>
          </View>
          <View style={{ borderRadius: 16, padding: 14, gap: 4, backgroundColor: colors.backgroundElement }}>
            <Text variant="bodySmall" weight="semibold">
              {t('web.credits.freeThisMonth')}
            </Text>
            <Text variant="caption" tone="muted">
              {t('settings.creditsMonthlyNote', { limit: FREE_MONTHLY_EXTRACT_LIMIT })}
            </Text>
          </View>
          <Text variant="caption" tone="muted">
            {t('web.credits.spendOrder')}
          </Text>
        </Tile>

        {purchasesHere ? (
          <Tile padding={20} style={{ gap: 14 }}>
            <Text variant="h3">{t('credits.buyTitle')}</Text>
            <Text variant="bodySmall" tone="muted">
              {t('credits.buyHint')}
            </Text>
            <Button trackId="credits.buy" size="lg" fullWidth icon="add" onPress={() => setCreditsOpen(true)}>
              {t('credits.buyAction')}
            </Button>
          </Tile>
        ) : (
          <Tile padding={20} style={{ gap: 14 }}>
            <Text variant="h3">{t('web.credits.salesOffTitle')}</Text>
            <Text variant="bodySmall" tone="muted">
              {t('credits.webOnlyBody')}
            </Text>
            <Button
              trackId="credits.open_app_store"
              size="lg"
              fullWidth
              iconEnd="open-outline"
              onPress={() => void openAppStore()}
            >
              {t('credits.webOnlyAction')}
            </Button>
          </Tile>
        )}
      </SettingsDetailScreen>
      <TokenPurchaseSheet
        visible={creditsOpen}
        trigger="settings"
        onClose={() => setCreditsOpen(false)}
        onPurchased={() => refresh()}
      />
    </>
  );
}
