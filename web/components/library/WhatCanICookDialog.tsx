"use client";

import { Camera, ListPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { daysSince, lastScannedByPlace, PANTRY_STALE_DAYS, pantryHomeNames, rankCookable, type CookableRecipe } from "@shared/lib/pantry";
import { fetchCloudKitchenProfile } from "@shared/lib/supabase/kitchen";
import { fetchPantryItems } from "@shared/lib/supabase/pantry";
import { showToast } from "@shared/lib/toast";
import type { PantryItem } from "@shared/types/pantry";
import type { Recipe } from "@shared/types/recipe";

import { useAuth } from "@/components/AuthProvider";
import { whenText } from "@/components/pantry/places";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { addToShoppingList } from "@/lib/list/shoppingListSync";

type Home = { items: PantryItem[]; staples: string[] };

/**
 * "What can I cook?" (PIN-181, in place of the one-photo fridge match): the Library's recipes ranked by what's
 * already in the pantry, fewest missing first, each with what's missing and one button to put that on the list.
 * Worked out on this computer from the saved pantry: no photo, no model, instant.
 */
export function WhatCanICookDialog({ open, onOpenChange, recipes }: { open: boolean; onOpenChange: (open: boolean) => void; recipes: Recipe[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <Body recipes={recipes} /> : null}
    </Dialog>
  );
}

function Body({ recipes }: { recipes: Recipe[] }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [home, setHome] = useState<Home | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([fetchPantryItems(), fetchCloudKitchenProfile(user.id).then((p) => p.pantryStaples).catch(() => [])])
      .then(([items, staples]) => {
        if (!cancelled) setHome({ items, staples });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, attempt]);

  const ranked = useMemo(() => (home ? rankCookable(recipes, pantryHomeNames(home.items, home.staples)) : []), [home, recipes]);
  const latest = home ? (Object.values(lastScannedByPlace(home.items)).sort().at(-1) ?? null) : null;
  const stale = (daysSince(latest) ?? 0) >= PANTRY_STALE_DAYS;

  const scanLink = (label: string) => (
    <Link href="/pantry/scan" data-track="what_can_i_cook.scan" className={buttonClasses({ variant: "primary" })}>
      <Camera aria-hidden className="h-[18px] w-[18px]" />
      {label}
    </Link>
  );

  let body;
  if (failed) {
    body = (
      <ErrorState
        body={t("pantry.cook.failed")}
        trackId="what_can_i_cook.load_error"
        onRetry={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
      />
    );
  } else if (!home) {
    body = <LoadingState />;
  } else if (recipes.length === 0) {
    body = (
      <div className="flex flex-col items-start gap-4">
        <p className="text-[15px] text-muted">{t("pantry.cook.emptyLibrary")}</p>
        <Link href="/add" data-track="what_can_i_cook.add_recipes" className={buttonClasses({ variant: "primary" })}>
          {t("library.snapFirst")}
        </Link>
      </div>
    );
  } else if (home.items.length === 0) {
    body = (
      <div className="flex flex-col items-start gap-4">
        <p className="text-[15px] text-muted">{t("pantry.cook.emptyPantry")}</p>
        {scanLink(t("pantry.scanKitchen"))}
      </div>
    );
  } else {
    body = (
      <>
        {stale ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-warning-soft px-4 py-2.5">
            <p className="text-sm font-medium text-warning">{t("pantry.cook.stale", { when: whenText(latest, t) })}</p>
            <Link href="/pantry/scan" data-track="what_can_i_cook.rescan" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              {t("pantry.scanAgain")}
            </Link>
          </div>
        ) : null}
        {ranked.length === 0 ? (
          <p className="text-[15px] text-muted">{t("pantry.cook.noMatches")}</p>
        ) : (
          <ul className="-mx-1 flex max-h-[min(28rem,60dvh)] flex-col gap-2 overflow-y-auto px-1">
            {ranked.map((entry) => (
              <CookableRow key={entry.recipe.id} entry={entry} />
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <DialogContent title={t("pantry.cook.title")} description={t("pantry.cook.hint")} className="max-w-lg">
      {body}
    </DialogContent>
  );
}

function CookableRow({ entry }: { entry: CookableRecipe }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const { recipe, have, total, missing } = entry;

  async function addMissing() {
    if (!user || busy) return;
    setBusy(true);
    try {
      const wanted = new Set(missing);
      const items = recipe.ingredients
        .filter((ingredient) => wanted.has(ingredient.name))
        .map((ingredient) => ({ name: ingredient.name, quantity: ingredient.quantity ?? null, unit: ingredient.unit ?? null, sourceRecipeId: recipe.id }));
      await addToShoppingList(user.id, items, "merge");
      setAdded(true);
      showToast(t("pantry.cook.added", { count: items.length }));
    } catch {
      showToast(t("addToList.failed"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-border bg-bg p-3.5">
      <Link href={`/recipe/${recipe.id}`} data-track="what_can_i_cook.open_recipe" className="block rounded-lg focus-visible:outline-2 focus-visible:outline-primary">
        <span className="block text-base font-semibold text-text">{recipe.display_title ?? recipe.title}</span>
        <span className={`mt-0.5 block text-sm font-medium ${missing.length === 0 ? "text-success" : "text-text"}`}>
          {missing.length === 0 ? t("pantry.cook.allThere") : t("pantry.cook.have", { have, total })}
        </span>
        {missing.length > 0 ? <span className="mt-0.5 block text-[13px] text-muted">{t("pantry.cook.missing", { items: missing.join(", ") })}</span> : null}
      </Link>
      {missing.length > 0 && !added ? (
        <Button variant="secondary" size="sm" trackId="what_can_i_cook.add_missing" busy={busy} onClick={() => void addMissing()} className="mt-2.5">
          <ListPlus aria-hidden className="h-4 w-4" />
          {t("pantry.cook.addMissing")}
        </Button>
      ) : null}
    </li>
  );
}
