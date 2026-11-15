import { useSegments } from 'expo-router';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { runButtonAction } from '@/components/inAppMessages/actions';
import { createMessagesController, type FetchParams } from '@/components/inAppMessages/controller';
import { useAuth } from '@/hooks/useAuth';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { appVersion, platform } from '@/lib/interactionLog';
import type { ButtonAction, ClickedButton, InAppMessage } from '@/lib/inAppMessages';
import { fetchInAppMessages, recordInAppMessageEvent } from '@/lib/supabase/inAppMessages';

/**
 * One controller for the whole app, so the host (modals) and the banner slot
 * (inside the tabs layout) show the same message.
 */
export const inAppMessagesController = createMessagesController({
  fetchMessages: fetchInAppMessages,
  recordEvent: recordInAppMessageEvent,
});

/** The message on screen now, from anywhere. Read-only; use `useInAppMessages` to drive it. */
export function useActiveInAppMessage(): InAppMessage | null {
  return useSyncExternalStore(
    inAppMessagesController.subscribe,
    () => inAppMessagesController.getSnapshot().active,
    () => null,
  );
}

/** What a presenter calls when the user acts on the message on screen. */
export function useInAppMessageActions(message: InAppMessage | null) {
  const id = message?.id ?? null;
  const onClose = useCallback(() => {
    if (id) inAppMessagesController.dismiss(id);
  }, [id]);
  const onAction = useCallback(
    (kind: ClickedButton, action: ButtonAction) => {
      if (!id) return;
      if (action.type === 'dismiss') {
        inAppMessagesController.dismiss(id);
        return;
      }
      // Start the action first, with nothing awaited: a browser blocks a new tab opened after an await.
      runButtonAction(action);
      inAppMessagesController.press(id, kind);
    },
    [id],
  );
  return { onClose, onAction };
}

/**
 * Drives in-app messages. Mount it once (the host in the root layout does):
 * it fetches the messages that target the signed-in user on sign-in, when the
 * app returns to the foreground and when the language changes, tells the
 * controller which screen is showing, and clears everything on sign-out.
 * Nothing is fetched or shown while nobody is signed in. A failed fetch is
 * silent. Returns the message to show now.
 */
export function useInAppMessages(): InAppMessage | null {
  const { user } = useAuth();
  const { language } = useLanguagePreference();
  const segments = useSegments();
  const route = `/${segments.join('/')}`;
  const userId = user?.id ?? null;

  const params = useMemo<FetchParams>(
    () => ({ platform, appVersion, language }),
    [language],
  );

  // Sign-in or sign-out: a new user starts clean, nobody clears what is held.
  useEffect(() => {
    inAppMessagesController.setUser(userId);
  }, [userId]);

  // Launch, sign-in and language change.
  useEffect(() => {
    if (userId) void inAppMessagesController.refresh(params, { force: true });
  }, [userId, params]);

  // Back to the foreground (on web: the tab becomes visible again).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void inAppMessagesController.refresh(params);
    });
    return () => subscription.remove();
  }, [params]);

  useEffect(() => {
    inAppMessagesController.setRoute(route);
  }, [route]);

  return useActiveInAppMessage();
}
