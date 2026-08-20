import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import {
  BEST_VALUE_PACK_ID,
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
}

export function TokenPurchaseSheet({ visible, onClose }: TokenPurchaseSheetProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { refresh } = useProfile();
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const livePurchases = purchasesEnabled();

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    loadCreditPacks()
      .then(setPacks)
      .catch(() => setError(t('credits.loadFailed')))
      .finally(() => setLoading(false));
  }, [t, visible]);

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
      if (result === 'purchased') {
        setTimeout(() => void refresh(), 1_500);
        setTimeout(() => void refresh(), 4_000);
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
      setMessage(t('credits.syncComplete'));
    } catch {
      setError(t('credits.syncFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SheetModal visible={visible} onClose={onClose} title={t('credits.buyTitle')} maxWidth={520}>
      <ScrollView className="flex-1 px-5 pb-6" showsVerticalScrollIndicator={false}>
        <Text className="mb-4 text-sm leading-5" style={{ color: colors.textSecondary }}>
          {t('credits.buyHint')}
        </Text>

        {loading ? (
          <ActivityIndicator className="py-10" color={colors.primary} />
        ) : (
          packs.map((pack) => {
            const featured = pack.id === BEST_VALUE_PACK_ID;
            return (
              <Pressable
                key={pack.id}
                onPress={() => void handlePurchase(pack)}
                disabled={Boolean(busyId)}
                accessibilityRole="button"
                accessibilityState={{ disabled: Boolean(busyId) }}
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
                    <Text className="text-base font-bold" style={{ color: colors.text }}>
                      {t('credits.packRecipes', { count: pack.credits })}
                    </Text>
                    {featured ? (
                      <View
                        className="rounded-full px-2 py-0.5"
                        style={{ backgroundColor: colors.primarySoft }}
                      >
                        <Text className="text-[10px] font-bold" style={{ color: colors.primary }}>
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

        {livePurchases ? (
          <Pressable
            onPress={() => void handleSync()}
            disabled={Boolean(busyId)}
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
