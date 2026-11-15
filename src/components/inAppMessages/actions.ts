import type { Href } from 'expo-router';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { openAppStore } from '@/lib/appStore';
import type { ButtonAction } from '@/lib/inAppMessages';

/** A web address the in-app browser may open. The server checks too; this is the app's own guard. */
export function isSafeWebUrl(url: string): boolean {
  return /^https:\/\/\S+$/i.test(url);
}

/** An app path ("/hub"), not a web address ("//evil.example") and not empty. */
export function isSafeRoute(href: string): boolean {
  return /^\/([^/\s]\S*)?$/.test(href);
}

export type ActionDeps = {
  openBrowser: (url: string) => unknown;
  navigate: (href: string) => void;
  openStore: () => unknown;
};

export const defaultActionDeps: ActionDeps = {
  openBrowser: (url) => WebBrowser.openBrowserAsync(url),
  navigate: (href) => router.push(href as Href),
  openStore: () => openAppStore(),
};

/**
 * Does what a button says. `dismiss` is not handled here (the caller closes
 * the message). Returns true when something was started. Call it straight
 * from the tap handler, with nothing awaited first: on web a browser blocks a
 * new tab opened after an await.
 */
export function runButtonAction(action: ButtonAction, deps: ActionDeps = defaultActionDeps): boolean {
  switch (action.type) {
    case 'link':
      if (!isSafeWebUrl(action.url)) return false;
      void Promise.resolve(deps.openBrowser(action.url)).catch(() => {});
      return true;
    case 'route':
      if (!isSafeRoute(action.href)) return false;
      deps.navigate(action.href);
      return true;
    case 'store':
      void Promise.resolve(deps.openStore()).catch(() => {});
      return true;
    default:
      return false;
  }
}
