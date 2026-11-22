"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { findAvoidMatches } from "@shared/lib/avoidList";
import { displayStepText } from "@shared/lib/displayStepText";
import { showToast } from "@shared/lib/toast";

import { CookAlongPlayer } from "@/components/cook/CookAlongPlayer";
import { CookBar } from "@/components/cook/CookBar";
import { CookMode } from "@/components/cook/CookMode";
import { IngredientsPanel } from "@/components/recipe/IngredientsPanel";
import { RecipeActionsSlot } from "@/components/recipe/RecipeActionsSlot";
import { RecipeAppliancesSection } from "@/components/recipe/RecipeAppliancesSection";
import { RecipeHeader } from "@/components/recipe/RecipeHeader";
import { RecipeNotices } from "@/components/recipe/RecipeNotices";
import { StepsPanel } from "@/components/recipe/StepsPanel";
import type { RecipeDisplay } from "@/components/recipe/types";
import { cn } from "@/lib/cn";
import { cookAlongVideoFor } from "@/lib/cook/cookAlongVideo";
import { useCookAlong } from "@/lib/cook/useCookAlong";
import { useCookTimers } from "@/lib/cook/useCookTimers";
import { useKitchenProfile } from "@/lib/recipe/useKitchenProfile";
import { useMeasurementSystem } from "@/lib/recipe/useMeasurementSystem";
import { useUnitSystem } from "@/lib/recipe/useUnitSystem";
import { useServings } from "@/lib/recipe/useServings";

const PLAYER_ID = "cook-along-player";

/**
 * A whole recipe to read and cook from: header and facts, the two ways to cook (cook mode, cook along), notices,
 * what it needs, then the ingredients beside the steps on wide screens and above them on phones. Used for a saved
 * recipe, and for one that isn't saved yet (a Snap preview, a Hub recipe): build its `display` with
 * `buildRecipeDisplay` (web/lib/recipe/recipeDisplay.ts).
 *
 * Cook along: the source video plays in a panel stuck to the top of the screen on phones and tablets, and in a
 * column at the end side from `xl`, where the ingredients and steps stack to make room. Cook mode opens over the
 * page. Neither changes the recipe, so both work on recipes that aren't saved.
 */
export function RecipeView({
  display,
  onToggleFavorite,
  back,
  actions,
  readOnly = false,
  onCooked,
}: {
  display: RecipeDisplay;
  /** The heart; leave out for a recipe that isn't saved. */
  onToggleFavorite?: () => void;
  /** Where the back link goes. Defaults to the Library; null hides it. */
  back?: { href: string; label: string } | null;
  /** Buttons for this kind of recipe (Save, Add to library…), shown under the header. */
  actions?: ReactNode;
  /** Hides the recipe actions (swap, remix, translate…): they only stick on a saved recipe, as on mobile. */
  readOnly?: boolean;
  /** "I cooked this" at the end of cook mode. Leave out where the recipe isn't saved. */
  onCooked?: () => void;
}) {
  const { t } = useTranslation();
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

  const portrait = playable?.shape === "portrait";

  return (
    <article className="mx-auto max-w-6xl">
      <RecipeHeader display={display} servings={choices.servings} onToggleFavorite={onToggleFavorite} back={back} />
      {actions ? <div className="-mt-2 mb-6 flex flex-wrap gap-2">{actions}</div> : null}
      {/* One toolbar: cooking first, then what changes the recipe. Each group wraps as a whole on narrow screens. */}
      <div className="mb-6 flex flex-wrap items-center gap-2 empty:hidden">
        <CookBar
          video={video}
          playerOpen={playerOpen}
          playerId={PLAYER_ID}
          onTogglePlayer={cookAlong.toggle}
          onCookMode={openCookMode}
          emphasis={actions ? "quiet" : "primary"}
        />
        {readOnly ? null : <RecipeActionsSlot display={display} />}
      </div>
      <RecipeNotices display={display} avoid={avoid} />
      <RecipeAppliancesSection display={display} system={system} />
      <div
        className={cn(
          "mt-8",
          playerOpen && "xl:grid xl:items-start xl:gap-10",
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
            className="mb-6 xl:col-start-2 xl:row-start-1 xl:mb-0"
          />
        ) : null}
        <div
          className={cn(
            "grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10",
            playerOpen && "xl:col-start-1 xl:row-start-1 xl:grid-cols-1",
            // The ingredients card sticks to the top on wide screens; with the video open it would slide under the
            // video panel (below xl) or over the steps (xl, one column). It scrolls with the page instead.
            playerOpen && "lg:[&>section:first-child]:static lg:[&>section:first-child]:max-h-none lg:[&>section:first-child]:overflow-visible",
          )}
        >
          <IngredientsPanel display={display} choices={choices} avoid={avoid} />
          <StepsPanel
            display={display}
            system={system}
            video={playable ? { onPlayAt: cookAlong.playAt, activeStep: playerOpen ? cookAlong.activeStep : null } : null}
            onCookMode={openCookMode ?? undefined}
          />
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
    </article>
  );
}
