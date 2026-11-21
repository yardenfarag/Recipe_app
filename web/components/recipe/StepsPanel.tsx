"use client";

import { ChefHat, Play, Video } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import { convertStepAmounts } from "@shared/lib/convertStepAmounts";
import { formatVideoTimestamp } from "@shared/lib/formatVideoTimestamp";

import type { RecipeDisplay } from "@/components/recipe/types";
import { cn } from "@/lib/cn";

/** The cook-along video, when the recipe has one that plays here. */
export type StepsVideo = {
  /** Opens the player if needed and plays from `seconds`. */
  onPlayAt: (seconds: number) => void;
  /** The step the video is on now, highlighted; null when unknown. */
  activeStep: number | null;
};

/**
 * The steps, set for reading from across the kitchen: large numbers, roomy lines, a comfortable line length.
 * Amounts quoted in a step ("3 tbsp butter") follow the chosen system, as on mobile. The list takes the recipe
 * text's own direction, so a Hebrew recipe in the English app reads right to left with its numbers on the right.
 *
 * With a `video`, a step's time is a button that plays the video from there, and the step the video is on is
 * highlighted. `onCookMode` adds a Cook mode button by the heading, for whoever reaches the steps first.
 */
export function StepsPanel({
  display,
  system,
  video,
  onCookMode,
}: {
  display: RecipeDisplay;
  system: MeasurementSystem;
  video?: StepsVideo | null;
  onCookMode?: () => void;
}) {
  const { t } = useTranslation();
  const { instructions, ingredients, unitLanguage } = display;
  const steps = useMemo(
    () => instructions.map((step) => ({ ...step, text: convertStepAmounts(step.text, ingredients, system, unitLanguage) })),
    [instructions, ingredients, system, unitLanguage],
  );

  if (steps.length === 0) return null;

  const count = steps.length;

  return (
    <section aria-labelledby="recipe-steps-heading" className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="recipe-steps-heading" className="text-xl font-bold text-text">
          {t("recipe.instructions")}
        </h2>
        <span className="text-sm text-muted">{t(count === 1 ? "recipe.stepCountOne" : "recipe.stepCountOther", { count })}</span>
        {onCookMode ? (
          <button
            type="button"
            data-track="recipe.cook_mode.open"
            onClick={onCookMode}
            className="ms-auto inline-flex h-9 items-center gap-1.5 self-center rounded-full px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChefHat aria-hidden className="h-4 w-4" />
            {t("web.cook.cookMode")}
          </button>
        ) : null}
      </div>

      <ol dir={display.direction} role="list" className="mt-3">
        {steps.map((step, index) => {
          const playing = video?.activeStep != null && video.activeStep === step.step;
          return (
          <li
            key={`${step.step}-${index}`}
            data-testid={`recipe-step-${step.step}`}
            aria-current={playing ? "step" : undefined}
            className={cn(
              "flex gap-4 border-b border-border py-5 transition-colors last:border-b-0 sm:gap-5",
              // The step on screen in the video: tinted, reaching a little past the text so it reads as a band.
              playing && "-mx-3 rounded-2xl border-transparent bg-primary-soft px-3",
            )}
          >
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold tabular-nums text-on-primary"
            >
              {step.step}
            </span>
            <div className="min-w-0 flex-1 pt-1.5">
              <span className="sr-only">{t("recipe.cookModeStep", { current: index + 1, total: count })}. </span>
              {step.timestamp_seconds != null ? (
                <div className="mb-2 flex items-center gap-2" data-slot="step-video">
                  {video ? (
                    <button
                      type="button"
                      data-track="recipe.step.jump_to_video"
                      onClick={() => video.onPlayAt(step.timestamp_seconds ?? 0)}
                      aria-label={t("web.cook.playFrom", { time: formatVideoTimestamp(step.timestamp_seconds) })}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-xs font-bold text-accent transition-[filter] hover:brightness-95 active:brightness-90 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Play aria-hidden className="h-3.5 w-3.5 fill-current" />
                      <StepTime seconds={step.timestamp_seconds} />
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">
                      <Video aria-hidden className="h-3.5 w-3.5" />
                      <span className="sr-only">{t("web.recipe.stepVideoTime", { time: formatVideoTimestamp(step.timestamp_seconds) })}</span>
                      <StepTime seconds={step.timestamp_seconds} />
                    </span>
                  )}
                  {playing ? <span className="text-xs font-semibold text-primary">{t("web.cook.nowPlaying")}</span> : null}
                </div>
              ) : null}
              <p lang={display.contentLanguage ?? undefined} className="max-w-[65ch] text-start text-[17px] leading-8 text-pretty text-text">
                {step.text}
              </p>
            </div>
          </li>
          );
        })}
      </ol>
    </section>
  );
}

function StepTime({ seconds }: { seconds: number }) {
  return (
    <time aria-hidden dir="ltr" className="tabular-nums" dateTime={`PT${Math.max(0, Math.round(seconds))}S`}>
      {formatVideoTimestamp(seconds)}
    </time>
  );
}
