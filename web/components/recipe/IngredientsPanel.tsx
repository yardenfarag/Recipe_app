"use client";

import { ArrowLeftRight, CircleAlert, CircleMinus, Scale, ShoppingCart, UtensilsCrossed } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import { scaleIngredients } from "@shared/lib/ingredientAmounts";
import { getCalorieDisplay } from "@shared/lib/recipeCalories";
import { getNutritionDisplay, recipeNutritionOf } from "@shared/lib/recipeNutrition";
import { recipeHasSource } from "@shared/lib/recipeOrigin";

import { isUpdating, useRecipeActions } from "@/components/recipe/actions/RecipeActionsContext";
import { DotSeparated } from "@/components/recipe/DotSeparated";
import type { AvoidMatches, ReadingChoices, RecipeDisplay } from "@/components/recipe/types";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Stepper } from "@/components/ui/Stepper";
import { Tile } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";
import { amountDirection, ingredientRows, type IngredientRow } from "@/lib/recipe/ingredientRows";
import { servingsText } from "@/lib/recipe/servingsText";
import { clampServings, MIN_SERVINGS } from "@/lib/recipe/useServings";
import { useUnitSystem } from "@/lib/recipe/useUnitSystem";

export type IngredientsPanelProps = {
  display: RecipeDisplay;
  choices: ReadingChoices;
  avoid: AvoidMatches | null;
  /**
   * The ingredients (by position) the cook ticked as already at home, when the page keeps them (so its "add to my
   * list" button on a phone knows too). Left out, the card keeps them itself.
   */
  have?: ReadonlySet<number>;
  onHaveChange?: (index: number, have: boolean) => void;
  /** Stays in view beside the steps on a wide screen. Off while the cook-along video needs the room. */
  sticky?: boolean;
  /** On a phone the page shows the servings stepper beside its Ingredients/Steps tabs instead of here. */
  stepperOnPhone?: boolean;
  className?: string;
};

/**
 * The ingredients card (PIN-162): how many it serves, spoons or grams, and each ingredient at that count with a
 * tick box for "I have this". "Add the missing ones to my list" then offers only what isn't ticked. On a saved
 * recipe each ingredient can also be swapped (PIN-135). Ticks last for the visit; they are a checklist, not data.
 */
export function IngredientsPanel({ display, choices, avoid, have, onHaveChange, sticky = true, stepperOnPhone = true, className }: IngredientsPanelProps) {
  const { t } = useTranslation();
  const actions = useRecipeActions();
  const headingId = useId();
  const hintId = useId();
  const { recipe } = display;
  const { units } = useUnitSystem();
  const [ownHave, setOwnHave] = useState<ReadonlySet<number>>(() => new Set());
  const ticked = have ?? ownHave;
  const setTicked =
    onHaveChange ??
    ((index: number, on: boolean) =>
      setOwnHave((previous) => {
        const next = new Set(previous);
        if (on) next.add(index);
        else next.delete(index);
        return next;
      }));

  const { rows, hasUnknownAmounts } = useMemo(
    () =>
      ingredientRows({
        ingredients: display.ingredients,
        recipeServings: recipe.servings,
        servings: choices.servings,
        system: choices.system,
        unitLanguage: display.unitLanguage,
        avoid,
        units,
      }),
    [display.ingredients, display.unitLanguage, recipe.servings, choices.servings, choices.system, avoid, units],
  );
  const count = rows.length;
  const amountsUpdating = isUpdating(actions, "ingredient_amounts");

  const swap = actions
    ? (index: number) => {
        const ingredient = scaleIngredients(display.ingredients, recipe.servings, choices.servings)[index];
        if (ingredient) actions.open({ kind: "swap", target: { index, ingredient, servingsShown: choices.servings } });
      }
    : null;

  const calories = getCalorieDisplay(recipe.calories, recipe.servings, choices.servings)?.total ?? null;
  const nutrition = isUpdating(actions, "calories") ? null : (getNutritionDisplay(recipeNutritionOf(recipe), recipe.servings, choices.servings)?.total ?? null);

  return (
    <Tile
      as="section"
      aria-labelledby={headingId}
      className={cn(
        "flex min-w-0 flex-col gap-4 p-5 md:p-[26px]",
        sticky && "lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
        <div className="flex items-baseline gap-2">
          <h2 id={headingId} className="text-[22px] font-bold text-text md:text-[26px]">
            {t("recipe.ingredients")}
          </h2>
          {count > 0 ? (
            <span className="text-sm font-medium text-muted">{t("recipe.itemCount", { count })}</span>
          ) : null}
        </div>
        <Stepper
          value={choices.servings}
          onChange={(next) => choices.onServingsChange(clampServings(next, recipe.servings))}
          min={MIN_SERVINGS}
          max={clampServings(Infinity, recipe.servings)}
          label={t("recipe.servings")}
          decreaseLabel={t("recipe.decreaseServings")}
          increaseLabel={t("recipe.increaseServings")}
          spokenValue={t("cookbook.servings", { count: choices.servings })}
          trackId="recipe.servings"
          className={cn(!stepperOnPhone && "max-md:hidden")}
        >
          {servingsText(t, choices.servings)}
        </Stepper>
      </div>

      {calories != null ? (
        <p data-testid="servings-total" className="-mt-2 text-xs text-muted tabular-nums">
          {nutrition ? (
            <DotSeparated
              text={t("recipe.nutritionTotal", {
                calories: calories.toLocaleString(),
                protein: nutrition.protein_g.toLocaleString(),
                carbs: nutrition.carbs_g.toLocaleString(),
                fat: nutrition.fat_g.toLocaleString(),
              })}
            />
          ) : (
            t("recipe.calTotal", { count: calories.toLocaleString() })
          )}
        </p>
      ) : null}

      {count > 0 ? (
        <>
          <div>
            <SegmentedControl<MeasurementSystem>
              label={`${t("measurement.spoons")} / ${t("measurement.grams")}`}
              value={choices.system}
              onChange={choices.onSystemChange}
              size="sm"
              describedBy={choices.system === "metric" ? hintId : undefined}
              options={[
                {
                  value: "original",
                  label: t("measurement.spoons"),
                  title: t("a11y.measureInSpoons"),
                  icon: <UtensilsCrossed aria-hidden className="h-4 w-4" />,
                  trackId: "recipe.measurement.original",
                },
                { value: "metric", label: t("measurement.grams"), title: t("a11y.measureInGrams"), icon: <Scale aria-hidden className="h-4 w-4" />, trackId: "recipe.measurement.metric" },
              ]}
            />
            {choices.system === "metric" ? (
              <p id={hintId} className="mt-2 text-xs leading-4 text-muted">
                {t("measurement.metricHint")}
              </p>
            ) : null}
          </div>
          {amountsUpdating ? (
            <p data-testid="amounts-updating" className="-mb-2 text-xs font-medium text-muted motion-safe:animate-pulse">
              <span className="sr-only">{t("recipeEditor.fields.quantity")}: </span>
              {t("recipeEditor.updating")}
            </p>
          ) : null}
          <IngredientList rows={rows} direction={display.direction} unitLanguage={display.unitLanguage} onSwap={swap} ticked={ticked} onTick={setTicked} />
          {hasUnknownAmounts && recipeHasSource(recipe) ? <p className="-mt-1 text-xs leading-5 text-muted">{t("recipe.amountsUnknownHint")}</p> : null}
          {actions ? (
            <Button
              variant="outline"
              fullWidth
              trackId="recipe.add_to_shopping_list"
              aria-haspopup="dialog"
              className="bg-transparent"
              onClick={() => actions.open({ kind: "list", servings: choices.servings, have: [...ticked] })}
            >
              <ShoppingCart aria-hidden className="h-[18px] w-[18px] rtl:-scale-x-100" />
              {t("web.recipe.addMissing")}
            </Button>
          ) : null}
        </>
      ) : null}
    </Tile>
  );
}

/**
 * The tick box, the amount and the name are cells of a shared grid, so the amounts line up in one column and never
 * run into the name. Amount and name are each isolated (`<bdi>`), so an English name in a Hebrew list, or a Hebrew
 * unit beside an English name, keeps its own reading order and its digits and fractions where they belong.
 */
function IngredientList({
  rows,
  direction,
  unitLanguage,
  onSwap,
  ticked,
  onTick,
}: {
  rows: IngredientRow[];
  direction: "ltr" | "rtl";
  unitLanguage: RecipeDisplay["unitLanguage"];
  /** Opens Swap for the ingredient at this index; null where the recipe can't be changed. */
  onSwap: ((index: number) => void) | null;
  ticked: ReadonlySet<number>;
  onTick: (index: number, have: boolean) => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <ul
      dir={direction}
      className={cn("grid gap-x-3", onSwap ? "grid-cols-[auto_fit-content(9rem)_minmax(0,1fr)_auto]" : "grid-cols-[auto_fit-content(9rem)_minmax(0,1fr)]")}
    >
      {rows.map((row, index) => {
        const amount = row.amount || t("recipe.amountUnknown");
        const have = ticked.has(index);
        return (
          <li key={row.key} className="col-span-full grid min-h-[46px] grid-cols-subgrid items-center border-b border-border py-2 last:border-b-0">
            {/* The label gives the small box a 44 px target. */}
            <label className="-my-2 grid h-11 w-7 cursor-pointer place-items-center">
              <input
                type="checkbox"
                checked={have}
                data-track="recipe.ingredient.have"
                aria-label={t("web.recipe.haveIt", { name: row.name })}
                onChange={(event) => onTick(index, event.target.checked)}
                className="h-5 w-5"
              />
            </label>
            <span
              className={cn(
                "text-start tabular-nums",
                row.amount ? "text-[15px] font-bold text-primary-text md:text-base" : "text-xs text-muted italic",
                have && "opacity-60",
              )}
            >
              <bdi key={amount} dir={amountDirection(amount, unitLanguage)} className="motion-safe:animate-fade-in">
                {amount}
              </bdi>
            </span>
            <span className="min-w-0 text-start">
              <bdi className={cn("text-[15px] [overflow-wrap:anywhere] md:text-base", have ? "text-muted line-through" : "text-text")}>{row.name}</bdi>
              {row.avoid ? <AvoidFlag kind={row.avoid} /> : null}
            </span>
            {onSwap ? (
              <button
                type="button"
                data-track="recipe.ingredient.swap"
                dir={i18n.dir()}
                aria-haspopup="dialog"
                aria-label={t("a11y.swapIngredient", { name: row.name })}
                title={t("recipe.swapAction")}
                onClick={() => onSwap(index)}
                className="-my-1 grid h-9 w-9 place-items-center self-center rounded-[10px] text-muted transition-colors hover:bg-element hover:text-text pointer-coarse:h-11 pointer-coarse:w-11"
              >
                <ArrowLeftRight aria-hidden className="h-4 w-4" />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The words are in the app's language, which can read the other way from the list. */
function AvoidFlag({ kind }: { kind: "allergy" | "dislike" }) {
  const { t, i18n } = useTranslation();
  const allergy = kind === "allergy";
  const Icon = allergy ? CircleAlert : CircleMinus;
  return (
    <span
      dir={i18n.dir()}
      className={cn(
        "mt-1 flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        allergy ? "bg-warning-soft text-text" : "bg-element text-muted",
      )}
    >
      <Icon aria-hidden className={cn("h-3.5 w-3.5 shrink-0", allergy ? "text-warning" : "text-muted")} />
      {t(allergy ? "avoid.ingredientAllergy" : "avoid.ingredientDislike")}
    </span>
  );
}
