import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Tile, TileBadge } from '@/components/ui/Tile';
import { useTypography } from '@/hooks/useTypography';
import { CHROME_MAX_FONT_SCALE, announce } from '@/lib/a11y';
import { capturePaywallViewed, type PaywallTrigger } from '@/lib/analytics';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { openAppStore } from '@/lib/appStore';
import {
  BEST_VALUE_PACK_ID,
  creditPurchasesOfferedHere,
  loadCreditPacks,
  packIsPurchasable,
  purchaseCreditPack,
  purchasesEnabled,
  syncPurchases,
  type CreditPack,
} from '@/lib/purchases';

interface TokenPurchaseSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Where the person was when the credit sheet opened. */
  trigger?: PaywallTrigger;
  /** Refreshes the screen that is showing the balance. */
  onPurchased?: () => void;
}

export function TokenPurchaseSheet({
  visible,
  onClose,
  trigger = 'out_of_credits',
  onPurchased,
}: TokenPurchaseSheetProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const { refresh } = useProfile();
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const livePurchases = purchasesEnabled();
  const purchasesHere = creditPurchasesOfferedHere();

  useEffect(() => {
    if (!visible || !purchasesHere) return;
    capturePaywallViewed(trigger);
  }, [purchasesHere, trigger, visible]);

  useEffect(() => {
    if (!visible || !purchasesHere) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    loadCreditPacks()
      .then(setPacks)
      .catch(() => setError(t('credits.loadFailed')))
      .finally(() => setLoading(false));
  }, [purchasesHere, t, visible]);

  // Purchase/sync results appear below the packs without moving focus.
  useEffect(() => {
    if (message) announce(message, { liveRegion: true });
  }, [message]);

  useEffect(() => {
    if (error) announce(error, { liveRegion: true });
  }, [error]);

  async function handlePurchase(pack: CreditPack) {
    if (busyId) return;
    if (!packIsPurchasable(pack)) {
      if (livePurchases) setError(t('credits.purchaseFailed'));
      return;
    }
    setBusyId(pack.id);
    setError(null);
    setMessage(null);
    try {
      const result = await purchaseCreditPack(pack);
      if (result === 'cancelled') return;
      setMessage(
        result === 'opened_web_checkout'
          ? t('credits.webCheckoutOpened')
          : t('credits.purchasePending'),
      );
      await refresh();
      onPurchased?.();
      if (result === 'purchased') {
        setTimeout(() => {
          void refresh();
          onPurchased?.();
        }, 1_500);
        setTimeout(() => {
          void refresh();
          onPurchased?.();
        }, 4_000);
      }
    } catch {
      setError(t('credits.purchaseFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSync() {
    if (busyId) return;
    setBusyId('sync');
    setError(null);
    try {
      await syncPurchases();
      await refresh();
      onPurchased?.();
      setMessage(t('credits.syncComplete'));
    } catch {
      setError(t('credits.syncFailed'));
    } finally {
      setBusyId(null);
    }
  }

  if (!purchasesHere) {
    return (
      <SheetModal trackId="credits.sheet" visible={visible} onClose={onClose} title={t('credits.buyTitle')} maxWidth={520}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <Text variant="bodySmall" tone="muted">
            {t('credits.webOnlyBody')}
          </Text>
          <Button trackId="credits.open_app_store" fullWidth iconEnd="open-outline" onPress={() => void openAppStore()}>
            {t('credits.webOnlyAction')}
          </Button>
        </ScrollView>
      </SheetModal>
    );
  }

  return (
    <SheetModal trackId="credits.sheet" visible={visible} onClose={onClose} title={t('credits.buyTitle')} maxWidth={520}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="bodySmall" tone="muted" style={{ marginBottom: 4 }}>
          {t('credits.buyHint')}
        </Text>

        {loading ? (
          <ActivityIndicator
            style={{ paddingVertical: 40 }}
            color={colors.primary}
            accessibilityLabel={t('a11y.loading')}
          />
        ) : (
          packs.map((pack) => {
            const featured = pack.id === BEST_VALUE_PACK_ID;
            const busy = busyId === pack.id;
            const packLabel = [
              t('credits.packRecipes', { count: pack.credits }),
              featured ? t('credits.bestValue') : null,
              t('credits.neverExpire'),
              pack.price,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <Tile
                key={pack.id}
                size="md"
                trackId="credits.pack.buy"
                onPress={() => void handlePurchase(pack)}
                disabled={Boolean(busyId) && !busy}
                accessibilityLabel={packLabel}
                accessibilityState={{ disabled: Boolean(busyId), busy }}
                style={[
                  { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, minHeight: 76 },
                  featured ? { borderWidth: 2, borderColor: colors.primary } : null,
                ]}
              >
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.accentSoft,
                  }}
                >
                  <Ionicons name="sparkles-outline" size={22} color={colors.accentText} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  {featured ? <TileBadge>{t('credits.bestValue')}</TileBadge> : null}
                  <Text variant="h3">{t('credits.packRecipes', { count: pack.credits })}</Text>
                  <Text variant="caption" tone="muted">
                    {t('credits.neverExpire')}
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text
                    tone="primary"
                    maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
                    style={{ ...type.font('display', 'bold'), fontSize: 20, lineHeight: 24, fontVariant: ['tabular-nums'] }}
                  >
                    {pack.price}
                  </Text>
                )}
              </Tile>
            );
          })
        )}

        <View accessibilityLiveRegion="polite">
          {message ? (
            <Text variant="bodySmall" weight="semibold" tone="primary">
              {message}
            </Text>
          ) : null}
          {error ? (
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          ) : null}
        </View>

        {livePurchases ? (
          <Button
            trackId="credits.sync_purchases"
            variant="ghost"
            fullWidth
            busy={busyId === 'sync'}
            disabled={Boolean(busyId) && busyId !== 'sync'}
            accessibilityLabel={t('credits.syncPurchases')}
            onPress={() => void handleSync()}
          >
            {t('credits.syncPurchases')}
          </Button>
        ) : null}
      </ScrollView>
    </SheetModal>
  );
}
