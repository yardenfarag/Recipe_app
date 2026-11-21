"use client";

import { Video } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import { convertStepAmounts } from "@shared/lib/convertStepAmounts";
import { formatVideoTimestamp } from "@shared/lib/formatVideoTimestamp";

import type { RecipeDisplay } from "@/components/recipe/types";

/**
 * The steps, set for reading from across the kitchen: large numbers, roomy lines, a comfortable line length.
 * Amounts quoted in a step ("3 tbsp butter") follow the chosen system, as on mobile. The list takes the recipe
 * text's own direction, so a Hebrew recipe in the English app reads right to left with its numbers on the right.
 */
export function StepsPanel({ display, system }: { display: RecipeDisplay; system: MeasurementSystem }) {
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
      </div>

      <ol dir={display.direction} role="list" className="mt-3">
        {steps.map((step, index) => (
          <li
            key={`${step.step}-${index}`}
            data-testid={`recipe-step-${step.step}`}
            className="flex gap-4 border-b border-border py-5 last:border-b-0 sm:gap-5"
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
                // PIN-134 turns this into the "jump to this moment in the video" button; until then it only says when.
                <div className="mb-2 flex items-center gap-2" data-slot="step-video">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">
                    <Video aria-hidden className="h-3.5 w-3.5" />
                    <span className="sr-only">{t("web.recipe.stepVideoTime", { time: formatVideoTimestamp(step.timestamp_seconds) })}</span>
                    <time
                      aria-hidden
                      dir="ltr"
                      className="tabular-nums"
                      dateTime={`PT${Math.max(0, Math.round(step.timestamp_seconds))}S`}
                    >
                      {formatVideoTimestamp(step.timestamp_seconds)}
                    </time>
                  </span>
                </div>
              ) : null}
              <p lang={display.contentLanguage ?? undefined} className="max-w-[65ch] text-start text-[17px] leading-8 text-pretty text-text">
                {step.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
