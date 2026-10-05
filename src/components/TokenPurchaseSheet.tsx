import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';
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
      <SheetModal visible={visible} onClose={onClose} title={t('credits.buyTitle')} maxWidth={520}>
        <ScrollView className="flex-1 px-5 pb-6" showsVerticalScrollIndicator={false}>
          <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
            {t('credits.webOnlyBody')}
          </Text>
          <Pressable
            className="mt-4 self-start rounded-[18px] px-4 py-2.5 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
            onPress={() => void openAppStore()}
            accessibilityRole="link"
          >
            <Text className="text-sm font-bold" style={{ color: colors.onPrimary }}>
              {t('credits.webOnlyAction')}
            </Text>
          </Pressable>
        </ScrollView>
      </SheetModal>
    );
  }

  return (
    <SheetModal visible={visible} onClose={onClose} title={t('credits.buyTitle')} maxWidth={520}>
      <ScrollView className="flex-1 px-5 pb-6" showsVerticalScrollIndicator={false}>
        <Text className="mb-4 text-sm leading-5" style={{ color: colors.textSecondary }}>
          {t('credits.buyHint')}
        </Text>

        {loading ? (
          <ActivityIndicator
            className="py-10"
            color={colors.primary}
            accessibilityLabel={t('a11y.loading')}
          />
        ) : (
          packs.map((pack) => {
            const featured = pack.id === BEST_VALUE_PACK_ID;
            const packLabel = [
              t('credits.packRecipes', { count: pack.credits }),
              featured ? t('credits.bestValue') : null,
              t('credits.neverExpire'),
              pack.price,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <Pressable
                key={pack.id}
                onPress={() => void handlePurchase(pack)}
                disabled={Boolean(busyId)}
                accessibilityRole="button"
                accessibilityLabel={packLabel}
                accessibilityState={{ disabled: Boolean(busyId), busy: busyId === pack.id }}
                className="mb-3 flex-row items-center rounded-3xl border p-4 active:opacity-80"
                style={{
                  borderColor: featured ? colors.primary : colors.border,
                  backgroundColor: colors.surface,
                }}
              >
                <View
                  className="me-3 h-11 w-11 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: colors.primarySoft }}
                >
                  <Ionicons name="restaurant-outline" size={22} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="shrink text-base font-bold" style={{ color: colors.text }}>
                      {t('credits.packRecipes', { count: pack.credits })}
                    </Text>
                    {featured ? (
                      <View
                        className="rounded-full px-2 py-0.5"
                        style={{ backgroundColor: colors.primarySoft }}
                      >
                        <Text
                          className="text-[10px] font-bold"
                          style={{ color: colors.primary }}
                          maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
                        >
                          {t('credits.bestValue')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                    {t('credits.neverExpire')}
                  </Text>
                </View>
                {busyId === pack.id ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text className="text-sm font-bold" style={{ color: colors.primary }}>
                    {pack.price}
                  </Text>
                )}
              </Pressable>
            );
          })
        )}

        <View accessibilityLiveRegion="polite">
          {message ? (
            <Text className="mt-2 text-sm" style={{ color: colors.accent }}>
              {message}
            </Text>
          ) : null}
          {error ? (
            <Text className="mt-2 text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}
        </View>

        {livePurchases ? (
          <Pressable
            onPress={() => void handleSync()}
            disabled={Boolean(busyId)}
            accessibilityRole="button"
            accessibilityLabel={t('credits.syncPurchases')}
            accessibilityState={{ disabled: Boolean(busyId), busy: busyId === 'sync' }}
            className="mt-5 items-center py-3 active:opacity-70"
          >
            {busyId === 'sync' ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                {t('credits.syncPurchases')}
              </Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </SheetModal>
  );
}
