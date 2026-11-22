import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { notificationPath } from '@/lib/notificationPath';
import { supabase } from '@/lib/supabase/client';

/**
 * Push notifications for the two reminders new accounts get (supabase/functions/nudges). The app
 * only registers the phone's Expo push token; the server decides what to send and when.
 *
 * - `registerForPushNotifications` shows the system permission prompt, so call it only right after
 *   the person chose to turn reminders on.
 * - `refreshPushRegistration` never prompts: on start-up and sign-in it re-saves the token when
 *   permission was already given (tokens can change, and the phone may now be another account's).
 * - `unregisterPushNotifications` on sign-out, so the old account's reminders stop on this phone.
 * - `usePushNotificationRouting` opens the screen a tapped notification points at.
 */

const TOKEN_KEY = 'pinch.pushToken';
const ANDROID_CHANNEL = 'default';

export type PushRegistration = 'registered' | 'denied' | 'unavailable' | 'failed';
/** `undetermined`: never asked, so asking will show the prompt. `blocked`: only Settings can change it. */
export type PushPermissionState = 'granted' | 'undetermined' | 'blocked' | 'unavailable';

// A reminder that arrives while Pinch is open still shows as a banner.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Expo Go can't get push tokens, and simulators have no push. */
function pushSupported(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  return Device.isDevice;
}

function projectId(): string | null {
  const id = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id ? id : null;
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (!pushSupported()) return 'unavailable';
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    return current.canAskAgain ? 'undetermined' : 'blocked';
  } catch {
    return 'unavailable';
  }
}

async function saveToken(): Promise<PushRegistration> {
  const id = projectId();
  if (!id) return 'unavailable';
  if (Platform.OS === 'android') {
    // Android 13+ needs a channel before it can show anything.
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  if (error) throw error;
  await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
  return 'registered';
}

/** Asks for permission (shows the system prompt if it was never answered) and saves the token. */
export async function registerForPushNotifications(userId: string): Promise<PushRegistration> {
  if (!userId || !pushSupported()) return 'unavailable';
  try {
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) return 'denied';
    return await saveToken();
  } catch (error) {
    console.warn('[push] registration failed', error);
    return 'failed';
  }
}

/** Re-saves the token for the signed-in account when permission was already given. Never prompts. */
export async function refreshPushRegistration(userId: string): Promise<PushRegistration> {
  if (!userId || !pushSupported()) return 'unavailable';
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return 'denied';
    return await saveToken();
  } catch (error) {
    console.warn('[push] refresh failed', error);
    return 'failed';
  }
}

/** Call before signing out, while the session still exists. */
export async function unregisterPushNotifications(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await supabase.rpc('unregister_push_token', { p_token: token });
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    console.warn('[push] unregister failed', error);
  }
}

/**
 * Opens the screen of a tapped notification: the one that cold-started the app, and any tapped
 * while it runs. Mount once, inside the router (root layout).
 */
export function usePushNotificationRouting(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    function open(response: Notifications.NotificationResponse | null) {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const path = notificationPath(response.notification.request.content.data);
      if (!path) return;
      router.push(path as Href);
      // So a later remount doesn't open it again.
      Notifications.clearLastNotificationResponse();
    }

    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);
}
