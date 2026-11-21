"use client";

import { CircleAlert, CircleMinus, Minus, Plus, Scale, UtensilsCrossed } from "lucide-react";
import { useId, useMemo, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import { getCalorieDisplay } from "@shared/lib/recipeCalories";
import { recipeHasSource } from "@shared/lib/recipeOrigin";

import type { AvoidMatches, ReadingChoices, RecipeDisplay } from "@/components/recipe/types";
import { cn } from "@/lib/cn";
import { amountDirection, ingredientRows, type IngredientRow } from "@/lib/recipe/ingredientRows";
import { clampServings } from "@/lib/recipe/useServings";

export type IngredientsPanelProps = { display: RecipeDisplay; choices: ReadingChoices; avoid: AvoidMatches | null };

/**
 * How many it serves, spoons or grams, and the ingredients at that count, as the mobile recipe screen shows them.
 * On a wide screen it stays in view beside the steps.
 */
export function IngredientsPanel({ display, choices, avoid }: IngredientsPanelProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const { recipe } = display;
  const { rows, hasUnknownAmounts } = useMemo(
    () =>
      ingredientRows({
        ingredients: display.ingredients,
        recipeServings: recipe.servings,
        servings: choices.servings,
        system: choices.system,
        unitLanguage: display.unitLanguage,
        avoid,
      }),
    [display.ingredients, display.unitLanguage, recipe.servings, choices.servings, choices.system, avoid],
  );
  const count = rows.length;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-3xl border border-frosted-border bg-surface p-5 shadow-soft sm:p-6 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain"
    >
      <div className="flex items-baseline gap-2">
        <h2 id={headingId} className="text-xl font-bold text-text">
          {t("recipe.ingredients")}
        </h2>
        {count > 0 ? (
          <span className="text-sm font-medium text-muted">{t(count === 1 ? "recipe.itemCountOne" : "recipe.itemCountOther", { count })}</span>
        ) : null}
      </div>

      <ServingsStepper
        servings={choices.servings}
        recipeServings={recipe.servings}
        calories={getCalorieDisplay(recipe.calories, recipe.servings, choices.servings)?.total ?? null}
        onChange={choices.onServingsChange}
      />

      {count > 0 ? (
        <>
          <MeasurementSwitch system={choices.system} onChange={choices.onSystemChange} />
          <IngredientList rows={rows} direction={display.direction} unitLanguage={display.unitLanguage} />
          {hasUnknownAmounts && recipeHasSource(recipe) ? <p className="mt-3 text-xs leading-5 text-muted">{t("recipe.amountsUnknownHint")}</p> : null}
        </>
      ) : null}
    </section>
  );
}

const stepperButton =
  "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-on-primary transition-[opacity,transform] active:scale-95 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:active:scale-100";

function ServingsStepper({
  servings,
  recipeServings,
  calories,
  onChange,
}: {
  servings: number;
  recipeServings: number;
  calories: number | null;
  onChange: (servings: number) => void;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const atMin = servings <= clampServings(0, recipeServings);
  const atMax = servings >= clampServings(Infinity, recipeServings);
  // aria-disabled rather than disabled, so a keyboard user who reaches the end keeps focus on the button.
  const change = (next: number) => {
    const value = clampServings(next, recipeServings);
    if (value !== servings) onChange(value);
  };

  return (
    <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-surface-soft px-4 py-3">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-semibold text-text">
          {t("recipe.servings")}
        </p>
        {calories != null ? <p className="mt-0.5 text-xs text-muted">{t("recipe.calTotal", { count: calories.toLocaleString() })}</p> : null}
      </div>
      <div role="group" aria-labelledby={labelId} className="flex items-center gap-3">
        <button type="button" aria-label={t("recipe.decreaseServings")} aria-disabled={atMin} onClick={() => !atMin && change(servings - 1)} className={stepperButton}>
          <Minus aria-hidden className="h-[18px] w-[18px]" />
        </button>
        <output aria-live="polite" aria-atomic className="min-w-8 text-center text-xl font-bold tabular-nums text-text">
          <span aria-hidden>{servings}</span>
          <span className="sr-only">{t("cookbook.servings", { count: servings })}</span>
        </output>
        <button type="button" aria-label={t("recipe.increaseServings")} aria-disabled={atMax} onClick={() => !atMax && change(servings + 1)} className={stepperButton}>
          <Plus aria-hidden className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}

const SYSTEMS = [
  { value: "original", Icon: UtensilsCrossed, label: "measurement.spoons", description: "a11y.measureInSpoons" },
  { value: "metric", Icon: Scale, label: "measurement.grams", description: "a11y.measureInGrams" },
] as const;

/** Spoons or grams, as a radio group: Tab reaches the chosen one, the arrow keys move between them. */
function MeasurementSwitch({ system, onChange }: { system: MeasurementSystem; onChange: (system: MeasurementSystem) => void }) {
  const { t } = useTranslation();
  const hintId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step == null) return;
    event.preventDefault();
    // Two options, so either direction (in either writing direction) lands on the other one.
    const next = (index + step + SYSTEMS.length) % SYSTEMS.length;
    onChange(SYSTEMS[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <div className="mt-4">
      <div
        role="radiogroup"
        aria-label={`${t("measurement.spoons")} / ${t("measurement.grams")}`}
        aria-describedby={system === "metric" ? hintId : undefined}
        className="flex rounded-2xl bg-primary-soft p-1"
      >
        {SYSTEMS.map(({ value, Icon, label, description }, index) => {
          const on = system === value;
          return (
            <button
              key={value}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              title={t(description)}
              onClick={() => onChange(value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "flex h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors",
                on ? "bg-surface text-primary shadow-soft" : "text-muted hover:text-text",
              )}
            >
              <Icon aria-hidden className="h-4 w-4" />
              {t(label)}
            </button>
          );
        })}
      </div>
      {system === "metric" ? (
        <p id={hintId} className="mt-2 text-center text-xs leading-4 text-muted">
          {t("measurement.metricHint")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Amount and name are two cells of a shared grid, so the amounts line up in one column and never run into the
 * name. Each is isolated (`<bdi>`), so an English name in a Hebrew list, or a Hebrew unit beside an English name,
 * keeps its own reading order and its digits and fractions where they belong.
 */
function IngredientList({ rows, direction, unitLanguage }: { rows: IngredientRow[]; direction: "ltr" | "rtl"; unitLanguage: RecipeDisplay["unitLanguage"] }) {
  const { t } = useTranslation();

  return (
    // PIN-133 adds a third `auto` column for each row's Swap button, after the name.
    <ul dir={direction} className="mt-4 grid grid-cols-[fit-content(9rem)_minmax(0,1fr)] gap-x-5">
      {rows.map((row) => {
        const amount = row.amount || t("recipe.amountUnknown");
        return (
          <li key={row.key} className="col-span-full grid grid-cols-subgrid items-baseline border-b border-border py-3 last:border-b-0">
            <span className={cn("text-start text-[15px] tabular-nums", row.amount ? (row.isPinch ? "font-semibold text-primary" : "text-muted") : "text-xs italic text-muted")}>
              <bdi key={amount} dir={amountDirection(amount, unitLanguage)} className="motion-safe:animate-fade-in">
                {amount}
              </bdi>
            </span>
            <span className="min-w-0 text-start">
              <bdi className="text-base font-medium text-text [overflow-wrap:anywhere]">{row.name}</bdi>
              {row.avoid ? <AvoidFlag kind={row.avoid} /> : null}
            </span>
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
