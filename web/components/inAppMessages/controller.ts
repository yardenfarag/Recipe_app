"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import type { ClickedButton, InAppMessage } from "@shared/lib/inAppMessages";
import { webClosedStore, webLaunchStartedAt, type TabStorage } from "@shared/lib/inAppMessageLaunch";
import {
  createMessagesController,
  isSignedOutRoute,
  type FetchParams,
  type MessagesController,
} from "@shared/lib/inAppMessagesController";
import { fetchInAppMessages, recordInAppMessageEvent } from "@shared/lib/supabase/inAppMessages";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { ACTIVITY_PLATFORM, APP_VERSION } from "@/lib/activity/appInfo";
import { useScreenName } from "@/lib/activity/screenName";
import { getSupabase } from "@/lib/supabase";

/**
 * In-app messages on the new web app (ADR 023), with the mobile app's rules: the same controller
 * (shared/lib/inAppMessagesController.ts) decides what shows, when it counts as seen, and what is recorded.
 *
 * - Fetched after sign-in, when the tab becomes visible again (at most every 30 s) and when the language changes;
 *   nothing before sign-in, nothing kept after sign-out.
 * - A launch is the browser tab (shared/lib/inAppMessageLaunch.ts): a reload or the way back from checkout doesn't
 *   bring back a message that was closed.
 * - A banner may show on any signed-in page (the slot is in the app shell), not only the main tabs as on mobile.
 */

function tabStorage(): TabStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

let controller: MessagesController | null = null;

/** One controller for the tab, so the host (dialogs) and the banner slot show the same message. Browser only. */
export function messagesController(): MessagesController {
  if (!controller) {
    const store = tabStorage();
    controller = createMessagesController({
      fetchMessages: (params) => {
        getSupabase();
        return fetchInAppMessages(params);
      },
      recordEvent: recordInAppMessageEvent,
      launchedAt: webLaunchStartedAt(Date.now(), store),
      closedStore: webClosedStore(store),
      canShowBanner: (route) => route !== null && !isSignedOutRoute(route),
    });
  }
  return controller;
}

/** What the mounted host fetches with; null until it mounts with a signed-in user. */
let currentParams: FetchParams | null = null;

/**
 * Fetch now, skipping the 30 s pause. The admin messages screen calls it after a change, so a message sent to
 * yourself shows in this tab straight away.
 */
export function refreshInAppMessagesNow(): void {
  if (currentParams) void messagesController().refresh(currentParams, { force: true });
}

const noSubscription = () => () => {};

/** The message on screen now, from anywhere. Read-only; the host drives it. */
export function useActiveInAppMessage(): InAppMessage | null {
  return useSyncExternalStore(
    typeof window === "undefined" ? noSubscription : (listener) => messagesController().subscribe(listener),
    () => messagesController().getSnapshot().active,
    () => null,
  );
}

/** What a presenter calls when the person acts on the message on screen. The control itself opens the page. */
export function useInAppMessageActions(message: InAppMessage | null) {
  const id = message?.id ?? null;
  /** Close button, Escape, the backdrop, a "dismiss" button: records dismissed. Ignored for a required message. */
  const onClose = useCallback(() => {
    if (id) messagesController().dismiss(id);
  }, [id]);
  /** A button or the link that leads somewhere was used: records clicked, and closes an optional message. */
  const onPress = useCallback(
    (kind: ClickedButton) => {
      if (id) messagesController().press(id, kind);
    },
    [id],
  );
  /** The message is really on screen: only then is it recorded as seen (once). */
  const onShown = useCallback(() => {
    if (id) messagesController().reportShown(id);
  }, [id]);
  /** Admin-only way out of a required message until the tab closes (a reload keeps it hidden); records nothing. */
  const onAdminHide = useCallback(() => {
    if (id) messagesController().hideForThisLaunch(id);
  }, [id]);
  return { onClose, onPress, onShown, onAdminHide };
}

/** Drives in-app messages: mount once (InAppMessageHost does). Returns the message to show now. */
export function useInAppMessages(): InAppMessage | null {
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  const route = useScreenName();
  const userId = user?.id ?? null;

  const params = useMemo<FetchParams>(
    () => ({ platform: ACTIVITY_PLATFORM, appVersion: APP_VERSION, language }),
    [language],
  );

  useEffect(() => {
    messagesController().setRoute(route);
  }, [route]);

  // Sign-in or sign-out: a new user starts clean, nobody clears what is held. Wait for the stored session first.
  useEffect(() => {
    if (!loading) messagesController().setUser(userId);
  }, [loading, userId]);

  // Sign-in and language change.
  useEffect(() => {
    if (loading) return;
    currentParams = userId ? params : null;
    if (userId) void messagesController().refresh(params, { force: true });
  }, [loading, userId, params]);

  // Back to the tab.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") void messagesController().refresh(params);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [params]);

  return useActiveInAppMessage();
}
