"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { ImageUp, Link2, Search } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { SnapBarField } from "@/components/snapbar/SnapBarField";
import { useReturnFocus } from "@/components/ui/returnFocus";

type SnapBarState = {
  /** Brings up the Snap bar: the one on the page when there is one, otherwise the dialog. */
  open: () => void;
  /** A page that shows the Snap bar itself (the Library) registers how to focus it. Returns the undo. */
  registerInline: (focus: () => void) => () => void;
};

const SnapBarContext = createContext<SnapBarState | null>(null);

/** The Snap bar's controls. Null outside the signed-in shell (a guest on a shared recipe has nothing to snap into). */
export function useSnapBar(): SnapBarState | null {
  return useContext(SnapBarContext);
}

/**
 * Opens the Snap bar from anywhere with ⌘K or Ctrl+K (PIN-160). On the Library, which shows the bar at its top,
 * the shortcut puts the cursor there; on every other page it opens the same field in a dialog near the top of the
 * screen. The shortcut is read by key position, so it also works on a Hebrew, Arabic or Russian keyboard.
 */
export function SnapBarProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const inline = useRef<(() => void) | null>(null);
  const returnFocus = useReturnFocus();

  const open = useCallback(() => {
    if (inline.current) inline.current();
    else setDialogOpen(true);
  }, []);

  const registerInline = useCallback((focus: () => void) => {
    inline.current = focus;
    return () => {
      if (inline.current === focus) inline.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "KeyK" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      // Another dialog or menu has the screen: leave it alone.
      if (document.querySelector("[role=dialog]:not([data-snap-bar]), [role=menu]")) return;
      event.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const value = useMemo(() => ({ open, registerInline }), [open, registerInline]);
  const hints = [
    [Link2, t("web.snapBar.hintLink")],
    [ImageUp, t("web.snapBar.hintPhoto")],
    [Search, t("web.snapBar.hintSearch")],
  ] as const;

  return (
    <SnapBarContext.Provider value={value}>
      {children}
      <RadixDialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-overlay backdrop-blur-[2px]" />
          <RadixDialog.Content
            {...returnFocus}
            data-snap-bar
            aria-describedby={undefined}
            className="fixed inset-x-4 top-[max(4rem,14vh)] z-50 mx-auto max-w-2xl animate-drop-in rounded-tile border border-border bg-bg p-3 shadow-lift outline-none"
          >
            <RadixDialog.Title className="sr-only">{t("web.snapBar.title")}</RadixDialog.Title>
            <SnapBarField autoFocus onDone={() => setDialogOpen(false)} />
            <ul className="mt-3 flex flex-col gap-1 px-2 pb-1">
              {hints.map(([Icon, text]) => (
                <li key={text} className="flex items-center gap-3 py-1.5 text-sm text-muted">
                  <Icon aria-hidden className="h-4 w-4 shrink-0" />
                  {text}
                </li>
              ))}
            </ul>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </SnapBarContext.Provider>
  );
}
