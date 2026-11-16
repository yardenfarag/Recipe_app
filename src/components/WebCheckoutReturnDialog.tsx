import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Platform, Text, View } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { useAuth } from '@/hooks/useAuth';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import {
  announceCreditsChanged,
  checkoutIdFrom,
  checkoutStartedSince,
  clearCheckoutStarted,
  purchasedCreditsSince,
  withoutCheckoutId,
} from '@/lib/webCheckoutReturn';

const POLL_EVERY_MS = 2_000;
const GIVE_UP_AFTER_MS = 40_000;

type State = { kind: 'waiting' } | { kind: 'added'; credits: number } | { kind: 'slow' };

/**
 * Website only: after paying on Polar's checkout the buyer lands back here with ?checkout_id=….
 * Shows "Payment received" while polar-webhook adds the credits, then how many were added.
 */
export function WebCheckoutReturnDialog() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { writingDirection } = useRtl();
  const { user } = useAuth();
  const [state, setState] = useState<State | null>(null);
  // Closed while waiting: keep checking so the balance updates, but don't pop up again.
  const dismissed = useRef(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !userId) return;
    if (!checkoutIdFrom(window.location.href)) return;
    // A reload shouldn't show the dialog again.
    window.history.replaceState(window.history.state, '', withoutCheckoutId(window.location.href));

    const since = checkoutStartedSince();
    const startedAt = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    dismissed.current = false;
    setState({ kind: 'waiting' });

    const check = async () => {
      let credits: number | null = null;
      try {
        credits = await purchasedCreditsSince(userId, since);
      } catch {
        // Try again on the next tick.
      }
      if (cancelled) return;
      if (credits) {
        clearCheckoutStarted();
        announceCreditsChanged();
        if (!dismissed.current) setState({ kind: 'added', credits });
      } else if (Date.now() - startedAt >= GIVE_UP_AFTER_MS) {
        if (!dismissed.current) setState({ kind: 'slow' });
      } else {
        timer = setTimeout(() => void check(), POLL_EVERY_MS);
      }
    };
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [userId]);

  if (!state) return null;
  const close = () => {
    dismissed.current = true;
    setState(null);
  };
  const waiting = state.kind === 'waiting';
  const message =
    state.kind === 'added'
      ? t('credits.webPurchaseAdded', { count: state.credits })
      : state.kind === 'slow'
        ? t('credits.webPurchaseSlow')
        : t('credits.webPurchaseWaiting');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View
          className="w-full max-w-sm items-center rounded-[28px] p-6"
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.frostedBorder }}
        >
          <View
            className="mb-3 h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.successSoft }}
          >
            {waiting ? (
              <ActivityIndicator color={colors.success} />
            ) : (
              <Ionicons name="checkmark" size={30} color={colors.success} accessible={false} />
            )}
          </View>
          <Text
            className="text-center text-lg font-bold"
            style={{ color: colors.text, writingDirection }}
            accessibilityRole="header"
          >
            {t('credits.webPurchaseTitle')}
          </Text>
          <Text
            className="mt-2 text-center text-sm leading-5"
            style={{ color: colors.textSecondary, writingDirection }}
            accessibilityLiveRegion="polite"
          >
            {message}
          </Text>
          <Pressable
            trackId="credits.web_purchase_done"
            onPress={close}
            className="mt-5 min-h-[48px] w-full items-center justify-center rounded-[22px] px-4 py-3 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
            accessibilityRole="button"
          >
            <Text className="text-center text-sm font-bold" style={{ color: colors.onPrimary }}>
              {waiting ? t('common.close') : t('credits.webPurchaseDone')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
