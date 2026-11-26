import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, ScrollView, Share, View, useWindowDimensions } from 'react-native';

import { QrCode } from '@/components/household/QrCode';
import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { KitIcon, Radii } from '@/components/ui/tokens';
import { useHousehold } from '@/hooks/useHousehold';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { askConfirm } from '@/lib/dialog';
import { formatShortDate, inviteExpired, whatsappUrls } from '@/lib/householdHelpers';
import { isHouseholdFull } from '@shared/lib/household';
import {
  getHouseholdInvite,
  householdInviteUrl,
  renewHouseholdInvite,
  stopHouseholdInvite,
} from '@shared/lib/supabase/household';
import { showToast } from '@shared/lib/toast';
import { HOUSEHOLD_MAX_MEMBERS, type Household, type HouseholdInvite } from '@shared/types/household';

/** Invite links always open the website, which hands over to the app where it is installed. */
const INVITE_ORIGIN = 'https://pinch-app.io';

type LinkState =
  | { kind: 'loading' }
  | { kind: 'ready'; invite: HouseholdInvite }
  | { kind: 'stopped' }
  | { kind: 'failed' };

async function copyOnWeb(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

/**
 * Invite the people you live with (docs/adr/034-households.md): the link, sent on WhatsApp first, through the share
 * sheet, or (on the web) copied; and a QR code for someone standing next to you. The link works for a week; a new
 * one stops the old one, and it can be stopped. A full household shows that instead.
 *
 * There's no clipboard module in the mobile app (it would need a store build), so on a phone "Copy" is the share
 * sheet's own Copy.
 */
export function InviteSheet({
  visible,
  onClose,
  household,
  afterCreate = false,
}: {
  visible: boolean;
  onClose: () => void;
  household: Household;
  /** Opened right after setting up: the close button says "Later". */
  afterCreate?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { language } = useLanguagePreference();
  const { refresh } = useHousehold();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<LinkState>({ kind: 'loading' });
  const [busy, setBusy] = useState<'renew' | 'stop' | null>(null);
  const full = isHouseholdFull(household);
  const loadId = useRef(0);

  const load = useCallback(
    async (make: () => Promise<HouseholdInvite>) => {
      const id = ++loadId.current;
      setState({ kind: 'loading' });
      try {
        const invite = await make();
        if (id !== loadId.current) return;
        setState({ kind: 'ready', invite });
        void refresh();
      } catch {
        if (id === loadId.current) setState({ kind: 'failed' });
      }
    },
    [refresh],
  );

  // Each time it opens: the live link if there is one, else a new one.
  const existing = household.invite;
  useEffect(() => {
    if (!visible || full) return;
    if (existing && !inviteExpired(existing.expiresAt)) {
      setState({ kind: 'ready', invite: existing });
      return;
    }
    void load(getHouseholdInvite);
    // Only when it opens: the link changing while it is open is this sheet's own doing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, full]);

  const name = household.name ?? '';
  const url = state.kind === 'ready' ? householdInviteUrl(INVITE_ORIGIN, state.invite.token) : null;
  const shareText = url ? t('household.invite.shareText', { name, url }) : '';

  async function sendOnWhatsApp() {
    if (!url) return;
    const links = whatsappUrls(shareText);
    if (Platform.OS === 'web') {
      await Linking.openURL(links.web).catch(() => undefined);
      return;
    }
    try {
      await Linking.openURL(links.app);
    } catch {
      // No WhatsApp on this phone: the website asks which chat, or offers the app.
      await Linking.openURL(links.web).catch(() => showToast(t('household.saveError'), 'error'));
    }
  }

  async function shareLink() {
    if (!url) return;
    try {
      if (Platform.OS === 'web') {
        const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: Navigator['share'] }) : null;
        if (nav?.share) {
          await nav.share({ title: t('household.invite.shareTitle', { name }), text: shareText });
          return;
        }
        if (await copyOnWeb(url)) showToast(t('household.invite.copied'));
        return;
      }
      await Share.share({ title: t('household.invite.shareTitle', { name }), message: shareText });
    } catch {
      // Closing the share sheet without picking anything lands here on some platforms: nothing to say.
    }
  }

  async function copyLink() {
    if (!url) return;
    try {
      if (await copyOnWeb(url)) {
        showToast(t('household.invite.copied'));
        announce(t('household.invite.copied'));
      }
    } catch {
      showToast(t('household.saveError'), 'error');
    }
  }

  async function makeNewLink() {
    if (busy) return;
    const fresh = state.kind === 'stopped' || state.kind === 'failed';
    if (!fresh) {
      const ok = await askConfirm({
        trackId: 'household.invite.new_link_dialog',
        title: t('household.invite.newLinkTitle'),
        message: t('household.invite.newLinkBody'),
        confirmLabel: t('household.invite.newLinkConfirm'),
      });
      if (!ok) return;
    }
    setBusy('renew');
    try {
      // After a stop or a failed read there is no live link to replace: just make one.
      await load(fresh ? getHouseholdInvite : renewHouseholdInvite);
    } finally {
      setBusy(null);
    }
  }

  async function stopLink() {
    if (busy) return;
    const ok = await askConfirm({
      trackId: 'household.invite.stop_dialog',
      title: t('household.invite.stopTitle'),
      message: t('household.invite.stopBody'),
      confirmLabel: t('household.invite.stopConfirm'),
      destructive: true,
    });
    if (!ok) return;
    setBusy('stop');
    try {
      await stopHouseholdInvite();
      loadId.current += 1;
      setState({ kind: 'stopped' });
      showToast(t('household.invite.stopped'));
      announce(t('household.invite.stopped'));
      void refresh();
    } catch {
      showToast(t('household.saveError'), 'error');
    } finally {
      setBusy(null);
    }
  }

  const qrSize = Math.min(220, Math.max(160, width - 140));
  const closeLabel = afterCreate ? t('household.invite.later') : t('household.invite.done');

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title={t('household.invite.title')}
      trackId="household.invite_sheet"
      maxWidth={480}
      footer={
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
          <Button
            trackId={afterCreate ? 'household.invite.later' : 'household.invite.done'}
            variant={afterCreate ? 'ghost' : 'outline'}
            size="lg"
            fullWidth
            onPress={onClose}
          >
            {closeLabel}
          </Button>
        </View>
      }
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 18 }}>
        {full ? (
          <Tile padding={20} style={{ alignItems: 'center', gap: 12 }}>
            <KitIcon icon="people-outline" size={32} color={colors.textSecondary} />
            <Text variant="bodySmall" align="center" accessibilityLiveRegion="polite">
              {t('household.invite.full', { count: HOUSEHOLD_MAX_MEMBERS })}
            </Text>
          </Tile>
        ) : (
          <>
            <Text variant="bodySmall" tone="muted">
              {t('household.invite.body')}
            </Text>

            {state.kind === 'loading' ? (
              <View
                style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }}
                accessibilityLiveRegion="polite"
              >
                <ActivityIndicator color={colors.primary} />
                <Text variant="caption" tone="muted">
                  {t('household.invite.loading')}
                </Text>
              </View>
            ) : state.kind === 'failed' ? (
              <Tile padding={20} style={{ gap: 12 }}>
                <Text variant="bodySmall" tone="danger" accessibilityLiveRegion="polite">
                  {t('household.invite.failed')}
                </Text>
                <Button
                  trackId="household.invite.retry"
                  variant="secondary"
                  icon="refresh"
                  busy={busy === 'renew'}
                  onPress={() => void makeNewLink()}
                >
                  {t('common.tryAgainAction')}
                </Button>
              </Tile>
            ) : state.kind === 'stopped' ? (
              <Tile padding={20} style={{ gap: 12 }}>
                <Text variant="bodySmall" accessibilityLiveRegion="polite">
                  {t('household.invite.stopped')}
                </Text>
                <Button
                  trackId="household.invite.new_after_stop"
                  variant="secondary"
                  icon="link-outline"
                  busy={busy === 'renew'}
                  onPress={() => void makeNewLink()}
                >
                  {t('household.invite.newLink')}
                </Button>
              </Tile>
            ) : (
              <>
                <View
                  style={{
                    borderRadius: Radii.inner,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    backgroundColor: colors.backgroundElement,
                  }}
                >
                  {/* A link reads left to right in every language. */}
                  <Text
                    variant="caption"
                    selectable
                    // One line, shortened in the middle: a link broken at its hyphen reads as two things.
                    numberOfLines={1}
                    ellipsizeMode="middle"
                    style={{ writingDirection: 'ltr', textAlign: 'left' }}
                    accessibilityLabel={url ?? undefined}
                  >
                    {url}
                  </Text>
                </View>

                <View style={{ gap: 10 }}>
                  <Button
                    trackId="household.invite.whatsapp"
                    size="lg"
                    fullWidth
                    icon="logo-whatsapp"
                    onPress={() => void sendOnWhatsApp()}
                  >
                    {t('household.invite.whatsapp')}
                  </Button>
                  {/* Side by side when both labels fit, one under the other when they don't (Hebrew, Russian). */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <Button
                      trackId="household.invite.share"
                      variant="outline"
                      icon={Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline'}
                      onPress={() => void shareLink()}
                      style={{ flexGrow: 1, flexBasis: 'auto' }}
                    >
                      {t('household.invite.share')}
                    </Button>
                    {Platform.OS === 'web' ? (
                      <Button
                        trackId="household.invite.copy"
                        variant="outline"
                        icon="copy-outline"
                        onPress={() => void copyLink()}
                        style={{ flexGrow: 1, flexBasis: 'auto' }}
                      >
                        {t('household.invite.copy')}
                      </Button>
                    ) : null}
                  </View>
                </View>

                <Tile padding={20} style={{ alignItems: 'center', gap: 10 }}>
                  <Text variant="h3" align="center">
                    {t('household.invite.qrTitle')}
                  </Text>
                  <Text variant="caption" tone="muted" align="center">
                    {t('household.invite.qrHint')}
                  </Text>
                  {url ? (
                    <View style={{ marginTop: 6, padding: 8, borderRadius: Radii.inner, backgroundColor: colors.surface }}>
                      <QrCode value={url} size={qrSize} label={t('household.invite.qrLabel', { name })} />
                    </View>
                  ) : null}
                </Tile>

                {state.kind === 'ready' ? (
                  <Text variant="caption" tone="muted" align="center">
                    {t('household.invite.expires', { date: formatShortDate(state.invite.expiresAt, language) })}
                  </Text>
                ) : null}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16 }}>
                  <Button
                    trackId="household.invite.new_link"
                    variant="link"
                    busy={busy === 'renew'}
                    disabled={busy != null}
                    onPress={() => void makeNewLink()}
                  >
                    {t('household.invite.newLink')}
                  </Button>
                  <Button
                    trackId="household.invite.stop"
                    variant="link"
                    busy={busy === 'stop'}
                    disabled={busy != null}
                    onPress={() => void stopLink()}
                  >
                    {t('household.invite.stop')}
                  </Button>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SheetModal>
  );
}
