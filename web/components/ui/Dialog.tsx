"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button, type ButtonVariant } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { useReturnFocus } from "@/components/ui/returnFocus";
import { cn } from "@/lib/cn";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

/**
 * A centred dialog. Focus moves into it and stays there, Escape or the close button closes it, and focus
 * returns to what opened it. `title` is required so screen readers can name it.
 */
export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  /** Buttons, laid out at the end (bottom on phones). */
  footer?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const returnFocus = useReturnFocus();
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-overlay backdrop-blur-[2px]" />
      <RadixDialog.Content
        {...returnFocus}
        className={cn(
          "fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-y-1/2 animate-pop-in rounded-tile border border-border bg-surface p-6 shadow-lift",
          "ltr:-translate-x-1/2 rtl:translate-x-1/2",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <RadixDialog.Title className="text-lg font-bold text-text">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="mt-1.5 text-[15px] leading-relaxed text-muted">
                {description}
              </RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close asChild>
            <IconButton label={t("common.close")} trackId="dialog.close" icon={<X className="h-5 w-5" />} tooltip={false} className="-me-2 -mt-1" />
          </RadixDialog.Close>
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
        {footer ? <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div> : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/** Asks before something that can't be undone. The confirm button names the action ("Delete", not "OK"). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = "danger",
  onConfirm,
  trackId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  onConfirm: () => Promise<void> | void;
  /** Activity-log id prefix (ADR 020): the buttons log `<trackId>.confirm` and `<trackId>.cancel`. */
  trackId?: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost" trackId={trackId ? `${trackId}.cancel` : undefined} disabled={busy}>
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button
              variant={confirmVariant}
              trackId={trackId ? `${trackId}.confirm` : undefined}
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  onOpenChange(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </>
        }
      />
    </Dialog>
  );
}
