"use client";

import { ImagePlus, ImageUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { FIELD_IDS } from "@/lib/editor/fieldIds";

/**
 * The recipe's photo: the one it has, or a big target to add one. A photo can also be dropped anywhere on the page
 * or pasted (the editor handles those), so this says so. Pinch never makes up a photo.
 */
export function PhotoField({
  src,
  busy,
  error,
  onFile,
  onRemove,
}: {
  src: string | null;
  busy: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shown = src && src !== failedSrc ? src : null;
  const errorId = `${FIELD_IDS.photo}-error`;
  const choose = () => input.current?.click();

  return (
    <div>
      {shown ? (
        <div className="relative overflow-hidden rounded-2xl bg-primary-soft shadow-soft">
          {/* A photo just chosen is a data URL, and saved ones are already sized: nothing for next/image to do. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="" onError={() => setFailedSrc(shown)} className="aspect-[4/3] w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 bg-gradient-to-t from-overlay to-transparent p-3 pt-10">
            <Button id={FIELD_IDS.photo} size="sm" variant="outline" onClick={choose} disabled={busy} aria-describedby={error ? errorId : undefined}>
              <ImageUp aria-hidden className="h-4 w-4" />
              {t("recipeEditor.photo.replace")}
            </Button>
            <IconButton
              label={t("recipeEditor.photo.remove")}
              icon={<Trash2 className="h-[18px] w-[18px]" />}
              onClick={onRemove}
              disabled={busy}
              className="h-9 w-9 bg-surface text-danger hover:bg-danger-soft hover:text-danger"
            />
          </div>
          {busy ? <BusyCover /> : null}
        </div>
      ) : (
        <button
          id={FIELD_IDS.photo}
          type="button"
          onClick={choose}
          disabled={busy}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "group relative flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface-soft px-5 text-center transition-colors lg:aspect-[4/3]",
            "hover:border-primary hover:bg-primary-soft/40 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-70",
          )}
        >
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary transition-transform group-hover:scale-105">
            <ImagePlus className="h-6 w-6" />
          </span>
          <span className="text-base font-bold text-text">{t("recipeEditor.photo.add")}</span>
          <span className="max-w-64 text-sm leading-relaxed text-muted">{t("web.editor.photoDrop")}</span>
          {busy ? <BusyCover /> : null}
        </button>
      )}
      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        tabIndex={-1}
        aria-hidden
        data-testid="editor-photo-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so choosing the same photo again still counts.
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

function BusyCover() {
  const { t } = useTranslation();
  return (
    <span className="absolute inset-0 grid place-items-center bg-surface/80 backdrop-blur-[1px]">
      <Spinner label={t("web.editor.photoPreparing")} />
    </span>
  );
}
