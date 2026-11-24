import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TFunction } from 'i18next';

import { askConfirm } from '@/lib/dialog';
import { getPushPermissionState, registerForPushNotifications } from '@/lib/pushNotifications';

const ASKED_KEY = 'pinch.pushPromptAsked';

/**
 * Right after someone's first recipes are saved (the picker, or a Snap saved for them), offers the cooking
 * reminders: our own question first, then the system prompt only on "Turn on reminders", so a "Not now" doesn't
 * use up the one system prompt iOS allows. Asked once per install; never on web, Expo Go or a simulator.
 */
export async function offerRemindersOnce(userId: string, t: TFunction): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(ASKED_KEY)) === '1') return;
    if ((await getPushPermissionState()) !== 'undetermined') return;
    await AsyncStorage.setItem(ASKED_KEY, '1');
    const yes = await askConfirm({
      trackId: 'push.reminders_offer_dialog',
      title: t('push.promptTitle'),
      message: t('push.promptBody'),
      confirmLabel: t('push.allow'),
      cancelLabel: t('push.notNow'),
    });
    if (yes) await registerForPushNotifications(userId);
  } catch (error) {
    console.warn('[push] reminder offer failed', error);
  }
}
