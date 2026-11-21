"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { needsCloseButton, type MessageView } from "@shared/lib/inAppMessageView";

import { IconButton } from "@/components/ui/IconButton";
import { logTap } from "@/lib/activity/activityLog";
import { cn } from "@/lib/cn";

import { MessageBody, type MessageHandlers } from "./MessageBody";
import { messageDir } from "./useMessageView";

/**
 * The modal ways of showing a message on the web (ADR 023): `alert` a centred card in the ConfirmDialog style,
 * `sheet` the kit's Sheet (from the bottom on phones, from the end side on wider screens), `fullscreen` a page over
 * everything. All are Radix dialogs: focus moves in and stays in, and Escape, the backdrop and the close control
 * close a dismissible message. A message that can't be dismissed (a required one) has no close control, and Escape
 * and the backdrop do nothing, so it can't be got rid of without acting on it.
 *
 * Each frame is exported on its own so the admin preview (InAppMessagePreview) draws exactly what people see.
 */

export type PresenterProps = {
  view: MessageView;
  handlers: MessageHandlers;
  /** The message is on screen; only then is it recorded as seen. */
  onShown: () => void;
};

const dialogTitle = (node: React.ReactElement) => <RadixDialog.Title asChild>{node}</RadixDialog.Title>;
const dialogBody = (node: React.ReactElement) => <RadixDialog.Description asChild>{node}</RadixDialog.Description>;
const plain = (node: React.ReactElement) => node;

function CloseControl({ view, trackId, onClose, className }: { view: MessageView; trackId: string; onClose: () => void; className?: string }) {
  return (
    <IconButton
      label={view.closeLabel}
      icon={<X className="h-5 w-5" />}
      tooltip={false}
      trackId={trackId}
      onClick={onClose}
      className={className}
    />
  );
}

/** Reports the message on screen once its dialog has mounted. The controller records `seen` only once. */
function useShown(onShown: () => void) {
  useEffect(() => {
    onShown();
  }, [onShown]);
}

/** Radix links the body as the description; with no body, say so, or it warns. */
function noDescription(view: MessageView) {
  return view.body ? {} : { "aria-describedby": undefined };
}

/** Escape and the backdrop close a dismissible message and do nothing otherwise. */
function modalGuards(view: MessageView, track: string) {
  return {
    // Focus starts on the message's main action, not on whatever control comes first in the markup.
    onOpenAutoFocus: (event: Event) => {
      const root = event.target instanceof HTMLElement ? event.target : null;
      const primary = root?.querySelector<HTMLElement>('[data-track$=".primary"]');
      if (!primary) return;
      event.preventDefault();
      primary.focus();
    },
    onEscapeKeyDown: (event: KeyboardEvent) => {
      if (!view.dismissible) event.preventDefault();
    },
    onPointerDownOutside: (event: Event) => {
      if (!view.dismissible) event.preventDefault();
      else logTap(`${track}.backdrop`);
    },
    // Only this message's own controls are reachable while it is up.
    onInteractOutside: (event: Event) => {
      if (!view.dismissible) event.preventDefault();
    },
  };
}

function ModalRoot({ view, handlers, children }: { view: MessageView; handlers: MessageHandlers; children: ReactNode }) {
  return (
    <RadixDialog.Root
      open
      onOpenChange={(open) => {
        if (!open && view.dismissible) handlers.onClose();
      }}
    >
      <RadixDialog.Portal>{children}</RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// ---------------------------------------------------------------------------
// alert

const ALERT = "in_app_message.alert";
export const ALERT_CARD_CLASS =
  "relative w-full max-w-md rounded-3xl border border-frosted-border bg-surface p-6 shadow-lift";

/** The alert card's inside. A dismissible alert whose buttons all lead somewhere also gets a Close button. */
export function AlertCard({ view, handlers, dialog = false }: { view: MessageView; handlers: MessageHandlers; dialog?: boolean }) {
  return (
    <>
      <MessageBody
        view={view}
        trackPrefix={ALERT}
        handlers={handlers}
        closeButton={needsCloseButton(view)}
        wrapTitle={dialog ? dialogTitle : plain}
        wrapBody={dialog ? dialogBody : plain}
      />
      {view.dismissible ? (
        <CloseControl view={view} trackId={`${ALERT}.close`} onClose={handlers.onClose} className="absolute end-3 top-3" />
      ) : null}
    </>
  );
}

export function AlertPresenter({ view, handlers, onShown }: PresenterProps) {
  useShown(onShown);
  return (
    <ModalRoot view={view} handlers={handlers}>
      <RadixDialog.Overlay className="fixed inset-0 z-[60] grid animate-fade-in place-items-center overflow-y-auto bg-overlay p-4 backdrop-blur-[2px]">
        <RadixDialog.Content
          dir={messageDir(view)}
          lang={view.contentLanguage}
          {...noDescription(view)}
          {...modalGuards(view, ALERT)}
          className={cn(ALERT_CARD_CLASS, "animate-pop-in outline-none")}
        >
          <AlertCard view={view} handlers={handlers} dialog />
        </RadixDialog.Content>
      </RadixDialog.Overlay>
    </ModalRoot>
  );
}

// ---------------------------------------------------------------------------
// sheet

const SHEET = "in_app_message.sheet";

export function SheetPanel({ view, handlers, dialog = false }: { view: MessageView; handlers: MessageHandlers; dialog?: boolean }) {
  return (
    <>
      <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-border sm:hidden" />
      <div className="flex justify-end px-4 pt-3 sm:pt-4">
        {view.dismissible ? <CloseControl view={view} trackId={`${SHEET}.close`} onClose={handlers.onClose} /> : <span className="h-10" />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <MessageBody
          view={view}
          trackPrefix={SHEET}
          handlers={handlers}
          wrapTitle={dialog ? dialogTitle : plain}
          wrapBody={dialog ? dialogBody : plain}
        />
      </div>
    </>
  );
}

export function SheetPresenter({ view, handlers, onShown }: PresenterProps) {
  useShown(onShown);
  return (
    <ModalRoot view={view} handlers={handlers}>
      <RadixDialog.Overlay className="fixed inset-0 z-[60] animate-fade-in bg-overlay backdrop-blur-[2px]" />
      <RadixDialog.Content
        dir={messageDir(view)}
        lang={view.contentLanguage}
        {...noDescription(view)}
        {...modalGuards(view, SHEET)}
        className={cn(
          "fixed z-[60] flex flex-col bg-surface shadow-lift outline-none",
          "inset-x-0 bottom-0 max-h-[88dvh] animate-slide-up rounded-t-3xl pb-[env(safe-area-inset-bottom)]",
          "sm:inset-x-auto sm:inset-y-0 sm:end-0 sm:max-h-none sm:w-full sm:max-w-md sm:animate-slide-in-end sm:rounded-none sm:rounded-s-3xl sm:pb-0",
        )}
      >
        <SheetPanel view={view} handlers={handlers} dialog />
      </RadixDialog.Content>
    </ModalRoot>
  );
}

// ---------------------------------------------------------------------------
// fullscreen

const FULLSCREEN = "in_app_message.fullscreen";

export function FullscreenPage({
  view,
  handlers,
  onAdminHide,
  dialog = false,
}: {
  view: MessageView;
  handlers: MessageHandlers;
  /** Only for an admin: hides a required message for the rest of this tab and records nothing (ADR 023). */
  onAdminHide?: () => void;
  dialog?: boolean;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
        {onAdminHide ? (
          // English only, like the admin pages: only admins ever see it.
          <button
            type="button"
            data-track={`${FULLSCREEN}.admin_hide`}
            onClick={onAdminHide}
            className="min-h-10 rounded-full border border-border bg-surface px-3.5 text-[13px] font-semibold text-muted hover:bg-surface-soft"
          >
            Admin only: hide until this tab is closed
          </button>
        ) : (
          <span />
        )}
        {view.dismissible ? <CloseControl view={view} trackId={`${FULLSCREEN}.close`} onClose={handlers.onClose} /> : null}
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-md">
          <MessageBody
            view={view}
            trackPrefix={FULLSCREEN}
            handlers={handlers}
            align="center"
            wrapTitle={dialog ? dialogTitle : plain}
            wrapBody={dialog ? dialogBody : plain}
          />
        </div>
      </div>
    </div>
  );
}

export function FullscreenPresenter({ view, handlers, onShown, onAdminHide }: PresenterProps & { onAdminHide?: () => void }) {
  useShown(onShown);
  return (
    <ModalRoot view={view} handlers={handlers}>
      <RadixDialog.Content
        dir={messageDir(view)}
        lang={view.contentLanguage}
        {...noDescription(view)}
        {...modalGuards(view, FULLSCREEN)}
        className="fixed inset-0 z-[70] animate-fade-in overflow-y-auto bg-bg outline-none"
      >
        <FullscreenPage view={view} handlers={handlers} onAdminHide={onAdminHide} dialog />
      </RadixDialog.Content>
    </ModalRoot>
  );
}
