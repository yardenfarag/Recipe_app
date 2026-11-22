"use client";

import { Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FOOD_AVATAR_IDS, foodAvatarDataUri, foodAvatarIdFrom, type FoodAvatarId } from "@shared/lib/foodAvatars";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";

/**
 * Choose a profile picture: tap a food friend and it's saved at once, or upload a photo instead. The current
 * choice is ringed.
 */
export function AvatarPicker({
  open,
  onOpenChange,
  current,
  savingId,
  onPick,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The current `avatar_url`. */
  current: string | null;
  /** The avatar being saved, if any. */
  savingId: FoodAvatarId | null;
  onPick: (id: FoodAvatarId) => void;
  onUpload: () => void;
}) {
  const { t } = useTranslation();
  const selected = foodAvatarIdFrom(current);
  const busy = savingId != null;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        title={t("settings.changeAvatarTitle")}
        description={t("settings.foodAvatarsHint")}
        footer={
          <Button variant="outline" trackId="settings.avatar.upload" disabled={busy} onClick={onUpload}>
            <Upload aria-hidden className="h-4 w-4" />
            {t("settings.uploadPhoto")}
          </Button>
        }
      >
        <ul aria-label={t("settings.foodAvatarPick")} className="grid grid-cols-4 gap-3">
          {FOOD_AVATAR_IDS.map((id) => {
            const name = t(`settings.foodAvatarNames.${id}`);
            const isSelected = selected === id;
            const isSaving = savingId === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  data-track={`settings.avatar.food.${id}`}
                  aria-label={name}
                  aria-pressed={isSelected}
                  aria-busy={isSaving || undefined}
                  title={name}
                  disabled={busy}
                  onClick={() => onPick(id)}
                  className={cn(
                    "relative block aspect-square w-full rounded-full ring-offset-2 ring-offset-surface transition-transform",
                    "motion-safe:hover:scale-105 disabled:cursor-default motion-safe:disabled:hover:scale-100",
                    isSelected && "ring-[3px] ring-primary",
                    busy && !isSaving && "opacity-50",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foodAvatarDataUri(id)} alt="" className="h-full w-full rounded-full" />
                  {isSaving ? (
                    <span aria-hidden className="absolute inset-0 grid place-items-center rounded-full bg-scrim">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-on-scrim border-t-transparent" />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
