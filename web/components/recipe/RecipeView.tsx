"use client";

import { ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { findAvoidMatches } from "@shared/lib/avoidList";
import { displayStepText } from "@shared/lib/displayStepText";
import { showToast } from "@shared/lib/toast";

import { CookAlongPlayer } from "@/components/cook/CookAlongPlayer";
import { StartCookingButton } from "@/components/cook/CookBar";
import { CookMode } from "@/components/cook/CookMode";
import { useRecipeActions } from "@/components/recipe/actions/RecipeActionsContext";
import { IngredientsPanel } from "@/components/recipe/IngredientsPanel";
import { RecipeActionsSlot } from "@/components/recipe/RecipeActionsSlot";
import { RecipeAppliancesSection } from "@/components/recipe/RecipeAppliancesSection";
import { RecipeHeader } from "@/components/recipe/RecipeHeader";
import { RecipeNotices } from "@/components/recipe/RecipeNotices";
import { StepsPanel } from "@/components/recipe/StepsPanel";
import type { RecipeDisplay } from "@/components/recipe/types";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Stepper } from "@/components/ui/Stepper";
import { cn } from "@/lib/cn";
import { cookAlongVideoFor } from "@/lib/cook/cookAlongVideo";
import { useCookAlong } from "@/lib/cook/useCookAlong";
import { useCookTimers } from "@/lib/cook/useCookTimers";
import { useKitchenProfile } from "@/lib/recipe/useKitchenProfile";
import { useMeasurementSystem } from "@/lib/recipe/useMeasurementSystem";
import { useUnitSystem } from "@/lib/recipe/useUnitSystem";
import { clampServings, MIN_SERVINGS, useServings } from "@/lib/recipe/useServings";

const PLAYER_ID = "cook-along-player";

type Tab = "ingredients" | "steps";

/**
 * A whole recipe to read and cook from (PIN-162): the photo and the way to start cooking up top, the tools that
 * change the recipe in plain view ("Make it yours"), notices and what it needs, then the ingredients card beside
 * the steps. Used for a saved recipe, and for one that isn't saved yet (a Snap preview, a Hub recipe): build its
 * `display` with `buildRecipeDisplay` (web/lib/recipe/recipeDisplay.ts).
 *
 * On a phone (PIN-163) the ingredients and the steps are two tabs with the servings stepper beside them, and on
 * the saved recipe's own page (`immersive`) "Start cooking" and "add to my list" stay fixed at the bottom.
 *
 * Cook along: the source video plays in a panel stuck to the top of the screen on phones and tablets, and in a
 * column at the end side from `xl`, where the ingredients and steps stack to make room. Cook mode opens over the
 * page. Neither changes the recipe, so both work on recipes that aren't saved. Arriving with `?cook=1` or
 * `?video=1` (the Library's "Start cooking" and "Cook along") opens it straight away.
 */
export function RecipeView({
  display,
  onToggleFavorite,
  back,
  actions,
  readOnly = false,
  onCooked,
  onDelete,
  immersive = false,
}: {
  display: RecipeDisplay;
  /** The heart; leave out for a recipe that isn't saved. */
  onToggleFavorite?: () => void;
  /** Where the back link goes. Defaults to the Library; null hides it. */
  back?: { href: string; label: string } | null;
  /** Buttons for this kind of recipe (Save, Add to library…), shown beside "Start cooking". */
  actions?: ReactNode;
  /** Hides the recipe actions (swap, remix, translate…): they only stick on a saved recipe, as on mobile. */
  readOnly?: boolean;
  /** "I cooked this" at the end of cook mode. Leave out where the recipe isn't saved. */
  onCooked?: () => void;
  /** "Delete" in the more menu. Only on a saved recipe's page. */
  onDelete?: () => void;
  /** The saved recipe's own page: on a phone the photo runs to the top of the screen and the Start bar is fixed. */
  immersive?: boolean;
}) {
  const { t } = useTranslation();
  const recipeActions = useRecipeActions();
  const tabsId = useId();
  // Remembered per recipe; an unsaved recipe has its own id or key, so this works for it too.
  const { servings, setServings } = useServings(display.recipe.id, display.recipe.servings);
  const { system, setSystem } = useMeasurementSystem();
  const { units } = useUnitSystem();
  const { profile } = useKitchenProfile();
  const avoid = useMemo(
    () => (profile ? findAvoidMatches(display.ingredients.map((ingredient) => ingredient.name), profile) : null),
    [display, profile],
  );
  const choices = { servings: servings ?? display.recipe.servings, onServingsChange: setServings, system, onSystemChange: setSystem };

  // What the cook ticked as already at home, for this visit. Shared by the card and the phone's "add to my list".
  const [have, setHave] = useState<ReadonlySet<number>>(() => new Set());
  const onHaveChange = useCallback((index: number, on: boolean) => {
    setHave((previous) => {
      const next = new Set(previous);
      if (on) next.add(index);
      else next.delete(index);
      return next;
    });
  }, []);
  const [tab, setTab] = useState<Tab>("ingredients");

  // Cook along.
  const { original_url, platform, source_video_url } = display.recipe;
  const video = useMemo(
    () => cookAlongVideoFor({ original_url, platform, source_video_url }),
    [original_url, platform, source_video_url],
  );
  const playable = video?.embedUrl ? video : null;
  const cookAlong = useCookAlong(display.instructions);
  const playerOpen = cookAlong.open && playable != null;
  const hasStepTimes = display.instructions.some((step) => step.timestamp_seconds != null);

  // Cook mode, with the steps as the page shows them.
  const cookSteps = useMemo(
    () =>
      display.instructions.map((step) => ({
        step: step.step,
        text: displayStepText(step.text, display.ingredients, system, display.unitLanguage, units),
      })),
    [display.instructions, display.ingredients, system, display.unitLanguage, units],
  );
  const [cookModeOpen, setCookModeOpen] = useState(false);
  const [cookIndex, setCookIndex] = useState(0);
  const cookModeOpenRef = useRef(cookModeOpen);
  useEffect(() => {
    cookModeOpenRef.current = cookModeOpen;
  }, [cookModeOpen]);
  const timers = useCookTimers({
    // Cook mode shows and reads out its own; with it closed, a toast says so (the chime plays either way).
    onDone: (timer) => {
      if (!cookModeOpenRef.current) showToast(t("web.cook.timerDone", { label: timer.label }), "info");
    },
  });
  const openCookMode =
    cookSteps.length > 0
      ? () => {
          // Back where you left off, unless you had finished.
          if (cookIndex >= cookSteps.length) setCookIndex(0);
          setCookModeOpen(true);
        }
      : null;

  // Sent here to start at once (the Library's "Start cooking" and "Cook along"): do it once, and tidy the address
  // so a reload or Back doesn't start it again.
  const started = useRef(false);
  const canCook = cookSteps.length > 0;
  const canPlay = playable != null;
  const { playAt } = cookAlong;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const cook = params.get("cook") === "1";
    const play = params.get("video") === "1";
    if (!cook && !play) return;
    params.delete("cook");
    params.delete("video");
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    // Opening what the address asked for is the point of this effect; it runs once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cook && canCook) setCookModeOpen(true);
    else if (play && canPlay) playAt(0);
  }, [canCook, canPlay, playAt]);

  const portrait = playable?.shape === "portrait";
  const canChange = !readOnly && recipeActions != null && recipeActions.display.recipe.id === display.recipe.id;
  const hasBoth = display.ingredients.length > 0 && display.instructions.length > 0;
  const ingredientsPanelId = `${tabsId}-ingredients`;
  const stepsPanelId = `${tabsId}-steps`;

  return (
    <article className="flex flex-col gap-5 md:gap-6">
      <RecipeHeader
        display={display}
        servings={choices.servings}
        onToggleFavorite={onToggleFavorite}
        back={back}
        cook={{ video, playerOpen, playerId: PLAYER_ID, onTogglePlayer: cookAlong.toggle, onCookMode: openCookMode, hasStepTimes }}
        extraActions={actions}
        onDelete={onDelete}
        immersive={immersive}
      />
      {/* What the cook must know (allergies first) comes before the tools that change the recipe. */}
      <RecipeNotices display={display} avoid={avoid} />
      {readOnly ? null : <RecipeActionsSlot display={display} servings={choices.servings} />}
      <RecipeAppliancesSection display={display} system={system} />

      {/* Phones: one of the two at a time, with the servings beside the tabs. */}
      {hasBoth ? (
        <div className="flex items-center gap-2 md:hidden">
          <SegmentedControl<Tab>
            kind="tabs"
            label={t("web.recipe.tabs")}
            value={tab}
            onChange={setTab}
            fullWidth
            className="min-w-0 flex-1 rounded-[14px]"
            options={[
              { value: "ingredients", label: t("recipe.ingredients"), controls: ingredientsPanelId, trackId: "recipe.tab.ingredients" },
              { value: "steps", label: t("web.recipe.steps"), controls: stepsPanelId, trackId: "recipe.tab.steps" },
            ]}
          />
          <Stepper
            value={choices.servings}
            onChange={(next) => setServings(clampServings(next, display.recipe.servings))}
            min={MIN_SERVINGS}
            max={clampServings(Infinity, display.recipe.servings)}
            label={t("recipe.servings")}
            decreaseLabel={t("recipe.decreaseServings")}
            increaseLabel={t("recipe.increaseServings")}
            spokenValue={t("cookbook.servings", { count: choices.servings })}
            trackId="recipe.servings"
          />
        </div>
      ) : null}

      <div
        className={cn(
          playerOpen && "xl:grid xl:items-start xl:gap-6",
          playerOpen && (portrait ? "xl:grid-cols-[minmax(0,1fr)_22rem]" : "xl:grid-cols-[minmax(0,1fr)_26rem] 2xl:grid-cols-[minmax(0,1fr)_30rem]"),
        )}
      >
        {playerOpen && playable ? (
          <CookAlongPlayer
            id={PLAYER_ID}
            video={playable}
            request={cookAlong.request}
            hasStepTimes={hasStepTimes}
            onClose={cookAlong.close}
            onTime={cookAlong.onTime}
            className="mb-5 xl:col-start-2 xl:row-start-1 xl:mb-0"
          />
        ) : null}
        <div className={cn("grid items-start gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]", playerOpen && "xl:col-start-1 xl:row-start-1 xl:grid-cols-1")}>
          <div id={ingredientsPanelId} className={cn("min-w-0 lg:contents", hasBoth && tab !== "ingredients" && "max-md:hidden")}>
            <IngredientsPanel
              display={display}
              choices={choices}
              avoid={avoid}
              have={have}
              onHaveChange={onHaveChange}
              // With the video open the card would slide under the video panel (below xl) or over the steps (xl, one
              // column), so it scrolls with the page instead.
              sticky={!playerOpen}
              stepperOnPhone={!hasBoth}
            />
          </div>
          <div id={stepsPanelId} className={cn("min-w-0 lg:contents", hasBoth && tab !== "steps" && "max-md:hidden")}>
            <StepsPanel
              display={display}
              system={system}
              timers={timers}
              video={playable ? { onPlayAt: cookAlong.playAt, activeStep: playerOpen ? cookAlong.activeStep : null } : null}
              onCookMode={openCookMode ?? undefined}
              cookModeOnPhone={!immersive}
            />
          </div>
        </div>
      </div>

      {openCookMode ? (
        <CookMode
          open={cookModeOpen}
          onOpenChange={setCookModeOpen}
          title={display.title}
          steps={cookSteps}
          direction={display.direction}
          contentLanguage={display.contentLanguage}
          index={cookIndex}
          onIndexChange={setCookIndex}
          timers={timers}
          onCooked={onCooked}
        />
      ) : null}

      {/* Phones, on the saved recipe's page: the two things a cook does next, always within reach of a thumb. The
          shell's bottom padding keeps the last ingredient and step clear of it. */}
      {immersive && (openCookMode || canChange) ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2.5 bg-linear-to-b from-bg/0 to-bg to-35% px-4 pt-5 pb-[max(env(safe-area-inset-bottom),1rem)] md:hidden">
          {openCookMode ? <StartCookingButton onCookMode={openCookMode} className="h-[54px] min-w-0 flex-1" /> : null}
          {canChange && recipeActions && display.ingredients.length > 0 ? (
            <IconButton
              variant="tile"
              label={t("web.recipe.addMissing")}
              aria-haspopup="dialog"
              trackId="recipe.add_to_shopping_list"
              onClick={() => recipeActions.open({ kind: "list", servings: choices.servings, have: [...have] })}
              className="h-[54px] w-[54px] rounded-2xl"
              icon={<ShoppingCart aria-hidden className="h-5 w-5 rtl:-scale-x-100" />}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
