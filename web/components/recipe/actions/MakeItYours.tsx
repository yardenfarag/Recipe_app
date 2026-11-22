"use client";

import { ArrowLeftRight, Languages, ShieldCheck, WandSparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { scaleIngredients } from "@shared/lib/ingredientAmounts";

import type { RecipeActions } from "@/components/recipe/actions/RecipeActionsContext";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";

// One control, two shapes: a compact button in a row that swipes sideways on a phone, a tile with an icon, a
// title and a line of explanation from tablet width up.
const tool =
  "flex shrink-0 items-center rounded-xl border border-border bg-surface text-start text-[13px] font-semibold text-text transition-colors hover:bg-element active:bg-selected max-md:h-11 max-md:px-3.5 md:shrink md:flex-col md:items-start md:gap-2.5 md:rounded-3xl md:p-5";

function ToolBody({ icon: Icon, title, short, body }: { icon: LucideIcon; title: string; short: string; body: string }) {
  return (
    <>
      <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-text max-md:hidden">
        <Icon className="h-5 w-5" />
      </span>
      {/* The short word on a phone, the full title on a tile. */}
      <span className="md:hidden">{short}</span>
      <span className="font-display text-lg leading-snug font-bold max-md:hidden">{title}</span>
      <span className="text-sm leading-snug font-normal text-muted max-md:hidden">{body}</span>
    </>
  );
}

/**
 * "Make it yours" (PIN-162): the four tools that change a saved recipe, in plain view under the photo. Remix, the
 * kitchen fix and Translate open the same dialogs as before; Swap first asks which ingredient. Focus comes back to
 * the tile when its dialog closes.
 *
 * The kitchen fix only has something to do when the recipe has an ingredient from the cook's allergies or dislikes,
 * or needs a tool they don't have. Otherwise its tile says so and leads to where those are set.
 */
export function MakeItYours({ actions, servings }: { actions: RecipeActions; servings: number }) {
  const { t } = useTranslation();
  const { display } = actions;
  const [picking, setPicking] = useState(false);

  const swap = (index: number) => {
    const ingredient = scaleIngredients(display.ingredients, display.recipe.servings, servings)[index];
    setPicking(false);
    if (ingredient) actions.open({ kind: "swap", target: { index, ingredient, servingsShown: servings } });
  };

  let fix: ReactNode;
  if (actions.canFix) {
    fix = (
      <button type="button" aria-haspopup="dialog" data-track="recipe.avoid.make_without" onClick={() => actions.open({ kind: "fix" })} className={tool}>
        <ToolBody icon={ShieldCheck} title={t("web.recipe.fixTitle")} short={t("web.recipe.fixTitle")} body={t("web.recipe.fixBody")} />
      </button>
    );
  } else {
    fix = (
      <Link href="/settings/recipe" data-track="recipe.kitchen_settings" className={tool}>
        <ToolBody icon={ShieldCheck} title={t("web.recipe.fixTitle")} short={t("web.recipe.fixTitle")} body={t("web.recipe.fixNothing")} />
      </Link>
    );
  }

  return (
    <>
      <div
        role="group"
        aria-label={t("a11y.recipeActionsFor", { name: display.title })}
        className="-mx-4 flex gap-2 px-4 scroll-row sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 xl:grid-cols-[repeat(auto-fit,minmax(13.75rem,1fr))]"
      >
        <button type="button" aria-haspopup="dialog" data-track="recipe.remix.open" onClick={() => actions.open({ kind: "remix" })} className={tool}>
          <ToolBody icon={WandSparkles} title={t("web.recipe.remixTitle")} short={t("recipe.remix")} body={t("web.recipe.remixBody")} />
        </button>
        {fix}
        {display.ingredients.length > 0 ? (
          <button type="button" aria-haspopup="dialog" data-track="recipe.swap.open" onClick={() => setPicking(true)} className={tool}>
            <ToolBody icon={ArrowLeftRight} title={t("web.recipe.swapTitle")} short={t("recipe.swapAction")} body={t("web.recipe.swapBody")} />
          </button>
        ) : null}
        <button type="button" aria-haspopup="dialog" data-track="recipe.translate" onClick={() => actions.open({ kind: "translate" })} className={tool}>
          <ToolBody icon={Languages} title={t("recipe.translate")} short={t("recipe.translate")} body={t("web.recipe.translateBody")} />
        </button>
      </div>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent title={t("web.recipe.swapTitle")} description={t("web.recipe.swapPick")}>
          <ul dir={display.direction} className="-mx-2 flex max-h-[50dvh] flex-col overflow-y-auto">
            {display.ingredients.map((ingredient, index) => (
              <li key={`${ingredient.name}-${index}`}>
                <button
                  type="button"
                  data-track="recipe.ingredient.swap"
                  onClick={() => swap(index)}
                  className={cn("flex min-h-11 w-full items-center rounded-xl px-3 text-start text-base font-medium text-text transition-colors hover:bg-element")}
                >
                  <bdi>{ingredient.name}</bdi>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
