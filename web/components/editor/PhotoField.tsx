"use client";

import { ImagePlus, ImageUp, Sparkles, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AiImageMark } from "@/components/recipes/AiImageMark";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { FIELD_IDS } from "@/lib/editor/fieldIds";

/**
 * The recipe's picture: the one it has, or a big target to add a photo. A photo can also be dropped anywhere on the
 * page or pasted (the editor handles those), so this says so. A photo of the dish comes first; below it, the owner
 * can ask Pinch to draw a picture instead (PIN-169). Pinch draws it after the save, and only when asked.
 */
export function PhotoField({
  src,
  generated,
  draw,
  busy,
  error,
  onFile,
  onRemove,
  onDraw,
  onCancelDraw,
}: {
  src: string | null;
  /** The picture shown is one Pinch drew. */
  generated: boolean;
  /** asked: Pinch will draw one after the save. drawing: an earlier save's drawing is on its way. */
  draw: "none" | "asked" | "drawing";
  busy: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
  onDraw: () => void;
  onCancelDraw: () => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shown = src && src !== failedSrc ? src : null;
  const errorId = `${FIELD_IDS.photo}-error`;
  const choose = () => input.current?.click();

  return (
    <div>
      {draw === "asked" ? (
        <div className="relative flex aspect-[16/9] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[22px] bg-primary-soft px-5 text-center lg:aspect-[4/3]">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-primary-text">
            <Sparkles className="h-6 w-6" />
          </span>
          <p role="status" className="max-w-64 font-display text-lg font-bold text-text">
            {t("recipeEditor.photo.willDraw")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button id={FIELD_IDS.photo} size="sm" variant="outline" className="pointer-coarse:h-11" trackId="recipe_editor.photo.add" onClick={choose} disabled={busy} aria-describedby={error ? errorId : undefined}>
              <ImagePlus aria-hidden className="h-4 w-4" />
              {t("recipeEditor.photo.add")}
            </Button>
            <Button size="sm" variant="ghost" className="pointer-coarse:h-11" trackId="recipe_editor.photo.dont_draw" onClick={onCancelDraw} disabled={busy}>
              <X aria-hidden className="h-4 w-4" />
              {t("recipeEditor.photo.dontDraw")}
            </Button>
          </div>
          {busy ? <BusyCover /> : null}
        </div>
      ) : shown ? (
        <div className="relative overflow-hidden rounded-[22px] bg-element">
          {/* A photo just chosen is a data URL, and saved ones are already sized: nothing for next/image to do. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="" onError={() => setFailedSrc(shown)} className="aspect-[4/3] w-full object-cover" />
          {generated ? <AiImageMark className="bottom-auto top-2 md:bottom-auto md:top-3" /> : null}
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-end gap-2 bg-linear-to-t from-scrim/70 to-scrim/0 p-3 pt-10">
            {generated ? (
              <Button size="sm" variant="outline" className="pointer-coarse:h-11" trackId="recipe_editor.photo.draw_again" onClick={onDraw} disabled={busy}>
                <Sparkles aria-hidden className="h-4 w-4" />
                {t("recipeEditor.photo.drawAgain")}
              </Button>
            ) : null}
            <Button id={FIELD_IDS.photo} size="sm" variant="outline" className="pointer-coarse:h-11" trackId="recipe_editor.photo.replace" onClick={choose} disabled={busy} aria-describedby={error ? errorId : undefined}>
              <ImageUp aria-hidden className="h-4 w-4" />
              {t("recipeEditor.photo.replace")}
            </Button>
            <IconButton
              variant="photo"
              label={t("recipeEditor.photo.remove")}
              trackId="recipe_editor.photo.remove"
              icon={<Trash2 className="h-[18px] w-[18px]" />}
              onClick={onRemove}
              disabled={busy}
            />
          </div>
          {busy ? <BusyCover /> : null}
        </div>
      ) : (
        <>
          <button
            id={FIELD_IDS.photo}
            type="button"
            data-track="recipe_editor.photo.add"
            onClick={choose}
            disabled={busy}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              "group relative flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[22px] border-2 border-dashed border-border bg-element px-5 text-center transition-colors lg:aspect-[4/3]",
              "hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-70",
            )}
          >
            <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary-text transition-colors group-hover:bg-surface">
              <ImagePlus className="h-6 w-6" />
            </span>
            <span className="font-display text-lg font-bold text-text">{t("recipeEditor.photo.add")}</span>
            <span className="max-w-64 text-sm leading-relaxed text-muted">{t("web.editor.photoDrop")}</span>
            {busy ? <BusyCover /> : null}
          </button>
          {draw === "drawing" ? (
            <Spinner label={t("recipe.drawingImage")} className="mt-3 text-sm" />
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="text-sm text-muted">{t("recipeEditor.photo.ownBest")}</p>
              <Button size="sm" variant="secondary" className="pointer-coarse:h-11" trackId="recipe_editor.photo.draw" onClick={onDraw} disabled={busy}>
                <Sparkles aria-hidden className="h-4 w-4" />
                {t("recipeEditor.photo.draw")}
              </Button>
            </div>
          )}
        </>
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
    <span className="absolute inset-0 grid place-items-center bg-surface/85">
      <Spinner label={t("web.editor.photoPreparing")} />
    </span>
  );
}
