"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";

export const Sheet = RadixDialog.Root;
export const SheetTrigger = RadixDialog.Trigger;
export const SheetClose = RadixDialog.Close;

/**
 * A panel for longer content (filters, a form). It rises from the bottom on phones, where thumbs are, and slides in
 * from the end edge on wider screens, beside the page. Behaves like a dialog: focus stays inside, Escape closes.
 */
export function SheetContent({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-overlay backdrop-blur-[2px]" />
      <RadixDialog.Content
        className={cn(
          "fixed z-50 flex flex-col bg-surface shadow-lift",
          // Phones: from the bottom, rounded on top, at most most of the screen.
          "inset-x-0 bottom-0 max-h-[88dvh] animate-slide-up rounded-t-3xl pb-[env(safe-area-inset-bottom)]",
          // Wider: a full-height panel on the end side.
          "sm:inset-x-auto sm:inset-y-0 sm:end-0 sm:max-h-none sm:w-full sm:max-w-md sm:animate-slide-in-end sm:rounded-none sm:rounded-s-3xl sm:pb-0",
          className,
        )}
      >
        <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-border sm:hidden" />
        <div className="flex items-start justify-between gap-4 px-6 pt-4 sm:pt-6">
          <div className="min-w-0">
            <RadixDialog.Title className="text-lg font-bold text-text">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="mt-1 text-[15px] text-muted">{description}</RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close asChild>
            <IconButton label={t("common.close")} icon={<X className="h-5 w-5" />} tooltip={false} className="-me-2" />
          </RadixDialog.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="flex gap-2 border-t border-border px-6 py-4">{footer}</div> : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
