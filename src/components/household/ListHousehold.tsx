import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { HouseholdAvatar, MemberStack } from '@/components/household/HouseholdAvatar';
import { Button } from '@/components/ui/Button';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { HAIRLINE, KitIcon } from '@/components/ui/tokens';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useHousehold } from '@/hooks/useHousehold';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { dismissHouseholdPromo, householdPromoDismissed } from '@/lib/householdDiscovery';
import { formatSendAgain, joinNames } from '@/lib/householdHelpers';
import { goingShoppingAvailableAt, isShared, otherMembers } from '@shared/lib/household';
import { HouseholdError, sendGoingShopping } from '@shared/lib/supabase/household';
import { showToast } from '@shared/lib/toast';

/**
 * "Shop together" on the list, for a signed-in person whose household has nobody else in it yet: what sharing does,
 * and the way to Settings → Household. "Not now" hides it on this phone for good.
 */
export function ShopTogetherPromo() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { household, status } = useHousehold();
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void householdPromoDismissed().then((dismissed) => {
      if (active) setHidden(dismissed);
    });
    return () => {
      active = false;
    };
  }, []);

  if (hidden !== false || status !== 'ready' || !household || isShared(household)) return null;

  return (
    <Tile padding={18} style={{ gap: 12 }} testID="household-promo">
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primarySoft,
          }}
        >
          <KitIcon icon="people-outline" size={22} color={colors.primaryText} />
        </View>
        {/* No × as well: "Not now" below dismisses, and the words get the whole width. */}
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text variant="h3">{t('household.promo.title')}</Text>
          <Text variant="caption" tone="muted">
            {t('household.promo.body')}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button
          trackId="household.promo.set_up"
          size="sm"
          icon={household.isSetUp ? 'person-add-outline' : 'home-outline'}
          onPress={() => router.push('/settings/household')}
        >
          {household.isSetUp ? t('household.manage.invite') : t('household.promo.button')}
        </Button>
        <Button
          trackId="household.promo.not_now"
          variant="ghost"
          size="sm"
          onPress={() => {
            setHidden(true);
            void dismissHouseholdPromo();
          }}
        >
          {t('household.promo.dismiss')}
        </Button>
      </View>
    </Tile>
  );
}

/**
 * The household on top of a shared list: its picture, who shares it (tap for Settings → Household), and "I'm going
 * shopping", which tells the others once in 20 hours so they can add last-minute things.
 */
export function HouseholdStrip() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { language } = useLanguagePreference();
  const { isMediumUp } = useBreakpoint();
  const { household, apply, refresh } = useHousehold();
  const [sending, setSending] = useState(false);
  // Re-render once the cool-down is over, so the button comes back by itself.
  const [now, setNow] = useState(() => new Date());
  const availableAt = goingShoppingAvailableAt(household?.goingShoppingSentAt, now);
  const availableMs = availableAt?.getTime() ?? null;
  useEffect(() => {
    if (availableMs == null) return;
    // At most an hour at a time, so "in 19 hours" counts down too.
    const wait = Math.min(availableMs - Date.now() + 1_000, 60 * 60_000);
    const timer = setTimeout(() => setNow(new Date()), Math.max(1_000, wait));
    return () => clearTimeout(timer);
  }, [availableMs, now]);

  if (!household || !isShared(household)) return null;

  const others = otherMembers(household);
  const names = joinNames(
    others.map((member) => member.displayName),
    language,
  );
  const live = t('household.live', { names });

  async function goShopping() {
    if (!household || sending) return;
    setSending(true);
    try {
      const result = await sendGoingShopping();
      apply({ ...household, goingShoppingSentAt: result.sentAt });
      const message = t('household.shopping.sent', { count: result.notified });
      showToast(message);
      announce(message);
    } catch (err) {
      if (err instanceof HouseholdError && err.code === 'already_sent_today') {
        showToast(t('household.shopping.alreadySent'));
        void refresh();
      } else if (err instanceof HouseholdError && err.code === 'alone') {
        void refresh();
      } else {
        showToast(t('household.shopping.failed'), 'error');
      }
    } finally {
      setSending(false);
    }
  }

  const action = availableAt ? (
    <View
      accessible
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}
    >
      <KitIcon icon="checkmark-circle" size={18} color={colors.success} />
      <Text variant="caption" tone="muted" style={{ flexShrink: 1 }}>
        {t('household.shopping.sentToday', { when: formatSendAgain(availableAt, now, language) })}
      </Text>
    </View>
  ) : (
    <Button
      trackId="household.going_shopping"
      variant="secondary"
      size="sm"
      icon="cart-outline"
      busy={sending}
      fullWidth={!isMediumUp}
      accessibilityHint={t('household.shopping.hint')}
      onPress={() => void goShopping()}
    >
      {sending ? t('household.shopping.sending') : t('household.shopping.button')}
    </Button>
  );

  return (
    <Tile style={{ paddingHorizontal: 8, paddingVertical: 8, gap: 4 }} testID="household-strip">
      <View style={{ flexDirection: isMediumUp ? 'row' : 'column', alignItems: isMediumUp ? 'center' : 'stretch', gap: 4 }}>
        <Pressable
          trackId="household.strip.open"
          onPress={() => router.push('/settings/household')}
          accessibilityRole="button"
          accessibilityLabel={`${household.name ?? t('household.title')}, ${live}`}
          style={({ pressed }) => ({
            flex: isMediumUp ? 1 : undefined,
            minWidth: 0,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderRadius: 18,
            backgroundColor: pressed ? colors.backgroundElement : 'transparent',
          })}
        >
          <HouseholdAvatar value={household.avatar} size={40} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="bodySmall" weight="semibold" numberOfLines={1}>
              {household.name ?? t('household.title')}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {live}
            </Text>
          </View>
          <MemberStack members={others} size={26} max={3} />
          <KitIcon icon="chevron-forward" size={16} color={colors.textSecondary} />
        </Pressable>
        {!isMediumUp ? (
          <View
            accessible={false}
            importantForAccessibility="no"
            style={{ height: HAIRLINE, backgroundColor: colors.border, marginHorizontal: 8 }}
          />
        ) : null}
        <View style={{ paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' }}>{action}</View>
      </View>
    </Tile>
  );
}
