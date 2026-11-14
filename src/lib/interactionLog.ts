import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { getInstallId } from '@/lib/installId';
import { createInteractionQueue, type InteractionEvent } from '@/lib/interactionQueue';

/**
 * Screen views and taps for the admin Activity page (admin/activity).
 *
 * Call `logTap('area.action')` from any handler, or use the Pressable from
 * '@/components/ui/Pressable', which does it for you via `trackId`. Names must
 * be fixed ids: never put a recipe title, email, or anything typed into a name
 * or property.
 */

function newSessionId(): string {
  const cryptoObj = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  // RFC 4122 v4 shape, for runtimes without randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
const appVersion = (() => {
  const version = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '';
  return (__DEV__ ? `${version}-dev` : version).slice(0, 24) || null;
})();

let installId: string | null = null;

async function sendBatch(sessionId: string, events: InteractionEvent[]): Promise<void> {
  installId ??= await getInstallId();
  // Loaded on first send so every button doesn't import the Supabase client.
  const { supabase } = await import('@/lib/supabase/client');
  const { error } = await supabase.rpc('log_interaction_events', {
    p_session_id: sessionId,
    p_guest_install_id: installId,
    p_platform: platform,
    p_app_version: appVersion,
    p_events: events.map(({ kind, name, screen, at, properties }) => ({
      kind,
      name,
      screen,
      at,
      properties: properties ?? {},
    })),
  });
  if (error) {
    // A rejected payload won't succeed on retry; only network errors are worth one.
    if (error.code === '22023' || error.code === '23514') return;
    throw error;
  }
}

const queue = createInteractionQueue({ send: sendBatch, newSessionId });

let lifecycleStarted = false;
function startLifecycle() {
  if (lifecycleStarted) return;
  lifecycleStarted = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') queue.onForeground();
    else queue.onBackground();
  });
}

export function logScreen(route: string): void {
  startLifecycle();
  queue.screen(route);
}

/** 'auth.login', 'auth.signup', 'auth.logout', 'auth.signin_failed', ... */
export function logAuth(name: string, properties?: InteractionEvent['properties']): void {
  startLifecycle();
  queue.auth(name, properties);
}

/** Sends whatever is queued now, e.g. before signing out changes who the rows belong to. */
export function flushInteractions(): Promise<void> {
  return queue.flush();
}

export function logTap(id: string, properties?: InteractionEvent['properties']): void {
  startLifecycle();
  queue.tap(id, properties);
}
