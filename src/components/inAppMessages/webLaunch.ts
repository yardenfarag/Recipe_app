import { Platform } from 'react-native';

import {
  webClosedStore as tabClosedStore,
  webLaunchStartedAt as tabLaunchStartedAt,
  type TabStorage,
} from '@shared/lib/inAppMessageLaunch';

/**
 * On web, one "launch" for in-app messages is the browser tab (see shared/lib/inAppMessageLaunch.ts, which the
 * Next.js web app uses too). Native apps keep the defaults (the process is the launch).
 */
function storage(): TabStorage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** When this tab's launch began; the first page load in the tab sets it. Undefined off the web. */
export function webLaunchStartedAt(now: number = Date.now(), store: TabStorage | null = storage()): number | undefined {
  return tabLaunchStartedAt(now, store);
}

/** Where the controller keeps the ids closed this launch. Undefined off the web. */
export function webClosedStore(store: TabStorage | null = storage()) {
  return tabClosedStore(store);
}
