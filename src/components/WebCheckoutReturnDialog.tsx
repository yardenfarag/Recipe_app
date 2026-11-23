import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Platform, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { Radii } from '@/components/ui/tokens';
import { useAuth } from '@/hooks/useAuth';
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
 * Shows "Payment received" while polar-webhook adds the credits, then how many were added. One flat tile over the
 * pack's overlay (Night Market, PIN-177).
 */
export function WebCheckoutReturnDialog() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
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
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
          backgroundColor: colors.overlay,
        }}
      >
        <Tile
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          style={{ width: '100%', maxWidth: 384, alignItems: 'center', padding: 24 }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              marginBottom: 14,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: Radii.inner,
              backgroundColor: colors.successSoft,
            }}
          >
            {waiting ? (
              <ActivityIndicator color={colors.success} />
            ) : (
              <Ionicons name="checkmark" size={30} color={colors.success} accessible={false} />
            )}
          </View>
          <Text variant="h2" align="center">
            {t('credits.webPurchaseTitle')}
          </Text>
          <Text
            variant="bodySmall"
            tone="muted"
            align="center"
            style={{ marginTop: 8 }}
            accessibilityLiveRegion="polite"
          >
            {message}
          </Text>
          <Button trackId="credits.web_purchase_done" onPress={close} size="lg" fullWidth style={{ marginTop: 20 }}>
            {waiting ? t('common.close') : t('credits.webPurchaseDone')}
          </Button>
        </Tile>
      </View>
    </Modal>
  );
}
