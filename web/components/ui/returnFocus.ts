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

/**
 * For dialogs and sheets: on opening, focus goes to the panel itself (its title is read out), not to the first
 * button, which is the close button and drew a focus ring on it. Radix only asks when nothing inside took focus, so a
 * field with `autoFocus` still gets it. Tab moves on from there.
 */
export function useDialogFocus() {
  const returnFocus = useReturnFocus();
  return {
    ...returnFocus,
    onOpenAutoFocus: (event: Event) => {
      returnFocus.onOpenAutoFocus();
      event.preventDefault();
      if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true });
    },
  };
}
