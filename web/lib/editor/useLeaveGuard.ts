"use client";

import { useCallback, useEffect, useRef } from "react";

/** A click that would open another page of this app in the same tab, or null. */
export function inAppLinkFromClick(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.hasAttribute("download")) return null;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return null;
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  // A link to this same page (an anchor on it) doesn't leave.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return anchor;
}

/**
 * Asks before leaving the editor with unsaved changes (ADR 018): closing or reloading the tab gets the browser's own
 * question, and a link to another page in the app (navigation, account menu) is held back while `onBlocked` asks.
 * `onBlocked` gets a `proceed` function that follows the link after all. `release()` turns the guard off for good,
 * before the editor leaves on its own (after Save, or a confirmed Cancel).
 */
export function useLeaveGuard(active: boolean, onBlocked: (proceed: () => void) => void) {
  const released = useRef(false);
  const activeRef = useRef(active);
  const onBlockedRef = useRef(onBlocked);
  useEffect(() => {
    activeRef.current = active;
    onBlockedRef.current = onBlocked;
  });

  const release = useCallback(() => {
    released.current = true;
  }, []);

  useEffect(() => {
    const guarding = () => activeRef.current && !released.current;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!guarding()) return;
      event.preventDefault();
      // Older browsers need a value here to ask.
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (!guarding()) return;
      const anchor = inAppLinkFromClick(event);
      if (!anchor) return;
      // Captured on the window, before the app's own link handling, so neither the browser nor the router moves.
      event.preventDefault();
      event.stopPropagation();
      const href = anchor.href;
      onBlockedRef.current(() => {
        released.current = true;
        if (anchor.isConnected) anchor.click();
        else window.location.assign(href);
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
    };
  }, []);

  return { release };
}
