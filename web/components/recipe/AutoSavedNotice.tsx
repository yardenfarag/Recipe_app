"use client";

import { CircleCheck, X } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { deleteRecipe } from "@shared/lib/supabase/recipes";
import { showToast } from "@shared/lib/toast";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { removeFromLibrary } from "@/lib/library/libraryCache";

/**
 * Snap saved this recipe for the cook as soon as it came in (`?justSaved=1`), with no Save tap: say so once, with a
 * way to take it back. Before, about a third of the people who got a recipe never saved it.
 */
export function AutoSavedNotice() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const [open, setOpen] = useState(params.get("justSaved") === "1");
  const [removing, setRemoving] = useState(false);

  if (!open) return null;

  async function remove() {
    if (removing) return;
    setRemoving(true);
    try {
      await deleteRecipe(id);
      removeFromLibrary(id);
      showToast(t("recipe.autoSavedRemoved"), "info");
      router.replace("/add");
    } catch {
      setRemoving(false);
      showToast(t("recipe.autoSavedRemoveFailed"), "info");
    }
  }

  return (
    // On a phone the recipe page is immersive (the photo runs to the top), so the strip floats at the bottom there.
    <div
      role="status"
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex items-center gap-3 rounded-2xl border border-frosted-border bg-primary-soft px-4 py-2.5 text-sm shadow-lift md:static md:mb-4 md:border-0 md:shadow-none"
    >
      <CircleCheck aria-hidden className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 font-semibold text-primary">{t("recipe.autoSaved")}</span>
      <Button size="sm" variant="ghost" busy={removing} trackId="recipe.auto_saved.remove" onClick={() => void remove()}>
        {t("recipe.autoSavedRemove")}
      </Button>
      <IconButton
        label={t("common.dismiss")}
        trackId="recipe.auto_saved.dismiss"
        icon={<X className="h-4 w-4" />}
        onClick={() => setOpen(false)}
        className="-me-2 h-9 w-9"
      />
    </div>
  );
}
