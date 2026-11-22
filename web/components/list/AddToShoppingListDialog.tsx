"use client";

import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import type { CulinaryUnitLanguage } from "@shared/lib/culinaryUnits";
import { showToast } from "@shared/lib/toast";
import { translateAppError } from "@shared/lib/translateAppError";
import type { Ingredient } from "@shared/types/recipe";
import type { ShoppingListIncomingItem } from "@shared/types/shoppingList";

import { useAuth } from "@/components/AuthProvider";
import { IngredientPicker } from "@/components/list/IngredientPicker";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { LoadingState } from "@/components/ui/States";
import { ingredientChoices, initialSelection, type IngredientChoice } from "@/lib/list/ingredientChoices";
import { addToShoppingList, type AddToListResult } from "@/lib/list/shoppingListSync";
import { usePantryStaples } from "@/lib/list/usePantryStaples";
import { useUnitSystem } from "@/lib/recipe/useUnitSystem";

export type AddToShoppingListDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kept on each line, so the list knows which recipe it came from. */
  recipeId?: string;
  /** Shown under the heading. */
  recipeTitle?: string;
  /** The ingredients at the servings the person is looking at (scaled already). */
  ingredients: Ingredient[];
  system: MeasurementSystem;
  unitLanguage: CulinaryUnitLanguage;
  /**
   * Saves the chosen lines. By default they go on the signed-in person's list as separate lines, as the mobile
   * recipe page does; the list page passes its own so it updates at once.
   */
  onAdd?: (items: ShoppingListIncomingItem[]) => Promise<AddToListResult>;
};

/**
 * "Add to list" for one recipe: tick the ingredients to buy (what is kept at home starts unticked), then add them.
 * Says how many were added, and which were already on the list. Built for the recipe page (PIN-135).
 */
export function AddToShoppingListDialog(props: AddToShoppingListDialogProps) {
  const { open, onOpenChange } = props;
  return <Dialog open={open} onOpenChange={onOpenChange}>{open ? <Body {...props} /> : null}</Dialog>;
}

function Body({ onOpenChange, recipeId, recipeTitle, ingredients, system, unitLanguage, onAdd }: AddToShoppingListDialogProps) {
  const { t } = useTranslation();
  const { staples, isStaple, keepStaple } = usePantryStaples();
  const { units } = useUnitSystem();
  const choices = useMemo(
    () => ingredientChoices(ingredients, { system, unitLanguage, recipeId, keyPrefix: "i", units }),
    [ingredients, system, unitLanguage, recipeId, units],
  );

  return (
    <DialogContent title={t("addToList.title")} description={recipeTitle} className="max-w-lg">
      {staples == null ? (
        <LoadingState className="min-h-40" label={t("a11y.loading")} />
      ) : (
        <Picker
          choices={choices}
          staples={staples}
          isStaple={isStaple}
          keepStaple={keepStaple}
          onAdd={onAdd ?? null}
          onDone={() => onOpenChange(false)}
        />
      )}
    </DialogContent>
  );
}

function Picker({
  choices,
  staples,
  isStaple,
  keepStaple,
  onAdd,
  onDone,
}: {
  choices: IngredientChoice[];
  staples: string[];
  isStaple: (name: string) => boolean;
  keepStaple: (name: string) => Promise<unknown>;
  onAdd: ((items: ShoppingListIncomingItem[]) => Promise<AddToListResult>) | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selected, setSelected] = useState(() => initialSelection(choices, staples));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = choices.filter((choice) => selected.has(choice.key)).length;

  async function add() {
    const picked = choices.filter((choice) => selected.has(choice.key)).map((choice) => choice.item);
    if (picked.length === 0) {
      setError(t("addToList.pickOne"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const save = onAdd ?? ((items: ShoppingListIncomingItem[]) => {
        if (!user) throw new Error(t("addToList.failed"));
        return addToShoppingList(user.id, items, "append");
      });
      const result = await save(picked);
      showToast(addedMessage(t, picked.length, result.alreadyOnList));
      onDone();
    } catch (caught) {
      setError(translateAppError(caught, t, "addToList.failed"));
    } finally {
      setBusy(false);
    }
  }

  function keep(choice: IngredientChoice) {
    const next = new Set(selected);
    next.delete(choice.key);
    setSelected(next);
    keepStaple(choice.name).catch(() => showToast(t("settings.kitchenSaveFailed"), "error"));
  }

  return (
    <>
      <div className="-mx-2 max-h-[min(55dvh,28rem)] overflow-y-auto px-2">
        <IngredientPicker sections={[{ id: "recipe", choices }]} selected={selected} onChange={setSelected} isStaple={isStaple} onKeepStaple={keep} />
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost" trackId="add_to_list.cancel" disabled={busy}>
            {t("common.cancel")}
          </Button>
        </DialogClose>
        <Button trackId="add_to_list.add" busy={busy} disabled={count === 0} onClick={() => void add()}>
          {t(count === 1 ? "addToList.addOne" : "addToList.addOther", { count })}
        </Button>
      </div>
    </>
  );
}

/** "3 items added." and, if some were already listed, which. Mobile says the same after adding from a recipe. */
export function addedMessage(t: TFunction, count: number, alreadyOnList: string[]): string {
  const added = t(count === 1 ? "recipe.addedToListBodyOne" : "recipe.addedToListBodyOther", { count });
  if (alreadyOnList.length === 0) return added;
  const note =
    alreadyOnList.length === 1
      ? t("recipe.alreadyOnListOne", { name: alreadyOnList[0] })
      : t("recipe.alreadyOnListOther", { count: alreadyOnList.length });
  return `${added} ${note}`;
}
