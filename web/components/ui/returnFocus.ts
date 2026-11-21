"use client";

import { useRef } from "react";

/**
 * Sends focus back to whatever opened a dialog or sheet when it closes. Radix only returns focus to its own Trigger,
 * and most of ours open from code (a button's onClick, a menu item), so without this focus fell to the page body and
 * a keyboard user lost their place. Spread the handlers onto `RadixDialog.Content`.
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    },
    onCloseAutoFocus: (event: Event) => {
      const element = opener.current;
      opener.current = null;
      // Gone (a menu item that closed with its menu): leave it to Radix.
      if (!element?.isConnected) return;
      event.preventDefault();
      element.focus();
    },
  };
}
