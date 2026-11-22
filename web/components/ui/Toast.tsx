"use client";

import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { useEffect, useState } from "react";

import { subscribeToast, type ToastMessage } from "@shared/lib/toast";

const ICONS = { success: CircleCheck, info: Info, error: CircleAlert } as const;

/**
 * Shows the brief messages raised with `showToast("Link copied")` (shared/lib/toast.ts). One at a time,
 * near the bottom where the eye already is, read out politely. Above the phone's bottom bar. A failure
 * (`showToast(text, "error")`) gets an alert icon and stays up longer; the pill is inverted, so the shape
 * carries the meaning rather than a colour.
 */
export function ToastHost() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useEffect(() => subscribeToast(setToast), []);
  const Icon = toast ? ICONS[toast.icon] : null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-8"
    >
      {toast && Icon ? (
        <div
          key={toast.id}
          role="status"
          data-kind={toast.icon}
          className="flex max-w-md animate-pop-in items-center gap-2.5 rounded-2xl bg-text px-5 py-3 text-start text-[15px] font-semibold text-surface shadow-lift"
        >
          <Icon aria-hidden className="h-5 w-5 shrink-0" />
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
