"use client";

import { Camera, UtensilsCrossed } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/cn";
import type { SnapIntent } from "@/lib/snap/useSnap";

/**
 * Import from a photo, or in Snap a PDF too (PIN-72): one big target that opens the file picker (the camera too, on a
 * phone), and says it also takes a dropped or pasted file. The page itself handles the drop and the paste.
 */
export function PhotoDropZone({ intent, onFile, disabled }: { intent: SnapIntent; onFile: (file: File) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const invent = intent === "invent";
  const Icon = invent ? UtensilsCrossed : Camera;
  const title = invent ? t("snap.inventPhotoAction") : t("web.snap.photoOrPdfAction");
  const hint = invent ? t("snap.inventPhotoHint") : t("web.snap.photoOrPdfHint");
  return (
    <>
      <button
        type="button"
        data-track="snap.photo"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className={cn(
          "group flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-border bg-surface-soft px-5 py-5 text-start transition-colors",
          "hover:border-primary hover:bg-primary-soft/40 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60",
        )}
      >
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary transition-transform group-hover:scale-105">
          <Icon className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-text">{title}</span>
          <span className="mt-0.5 block text-sm leading-relaxed text-muted">{hint}</span>
          <span className="mt-0.5 hidden text-xs text-muted sm:block">{t(invent ? "web.snap.dropOrPaste" : "web.snap.dropOrPastePdf")}</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept={invent ? "image/*" : "image/*,application/pdf"}
        hidden
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so choosing the same photo again still counts as a change.
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}
