"use client";

import { CircleCheck, X } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { deleteRecipe } from "@shared/lib/supabase/recipes";
import { showToast } from "@shared/lib/toast";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

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
      showToast(t("recipe.autoSavedRemoved"), "info");
      router.replace("/add");
    } catch {
      setRemoving(false);
      showToast(t("recipe.autoSavedRemoveFailed"), "info");
    }
  }

  return (
    <div role="status" className="mb-4 flex items-center gap-3 rounded-2xl bg-primary-soft px-4 py-2.5 text-sm">
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
