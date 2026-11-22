"use client";

import { CircleCheck, Info } from "lucide-react";
import { useEffect, useState } from "react";

import { subscribeToast, type ToastMessage } from "@shared/lib/toast";

/**
 * Shows the brief confirmations raised with `showToast("Link copied")` (shared/lib/toast.ts). One at a time,
 * near the bottom where the eye already is, read out politely. Above the phone's bottom bar.
 */
export function ToastHost() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useEffect(() => subscribeToast(setToast), []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-8"
    >
      {toast ? (
        <div
          key={toast.id}
          role="status"
          className="flex animate-pop-in items-center gap-2.5 rounded-2xl bg-text px-5 py-3 text-[15px] font-semibold text-surface shadow-lift"
        >
          {toast.icon === "success" ? (
            <CircleCheck aria-hidden className="h-5 w-5" />
          ) : (
            <Info aria-hidden className="h-5 w-5" />
          )}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
