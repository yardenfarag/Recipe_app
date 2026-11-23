"use client";

import { ChefHat, Play, Timer, Video, X } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import { displayStepText } from "@shared/lib/displayStepText";
import { formatVideoTimestamp } from "@shared/lib/formatVideoTimestamp";
import { formatCountdown, parseStepTimers } from "@shared/lib/stepTimers";

import type { CookModeTimers } from "@/components/cook/CookMode";
import type { RecipeDisplay } from "@/components/recipe/types";
import { cn } from "@/lib/cn";
import { secondsLeft } from "@/lib/cook/useCookTimers";
import { useUnitSystem } from "@/lib/recipe/useUnitSystem";

/** The cook-along video, when the recipe has one that plays here. */
export type StepsVideo = {
  /** Opens the player if needed and plays from `seconds`. */
  onPlayAt: (seconds: number) => void;
  /** The step the video is on now, highlighted; null when unknown. */
  activeStep: number | null;
};

const stepChip = "inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-bold transition-[filter] pointer-coarse:h-11";

/**
 * The steps, one card each, set for reading from across the kitchen (PIN-162). Amounts quoted in a step ("3 tbsp
 * butter") follow the chosen system, as on mobile. The list takes the recipe text's own direction, so a Hebrew
 * recipe in the English app reads right to left with its numbers on the right.
 *
 * With `timers`, a time in a step ("simmer 10 min") is a button that starts that timer: the same ones cook mode
 * uses, so one started here is still counting when cook mode opens. While it runs the button shows the countdown.
 * With a `video`, a step's time in the video is a button that plays from there, and the step the video is on is
 * highlighted. `onCookMode` adds a Start cooking button by the heading, for whoever reaches the steps first.
 */
export function StepsPanel({
  display,
  system,
  video,
  timers,
  onCookMode,
  cookModeOnPhone = true,
  className,
}: {
  display: RecipeDisplay;
  system: MeasurementSystem;
  video?: StepsVideo | null;
  timers?: CookModeTimers;
  onCookMode?: () => void;
  /** Off where the page already keeps "Start cooking" fixed at the bottom of a phone's screen. */
  cookModeOnPhone?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const { instructions, ingredients, unitLanguage } = display;
  const { units } = useUnitSystem();
  const steps = useMemo(
    () =>
      instructions.map((step) => {
        const text = displayStepText(step.text, ingredients, system, unitLanguage, units);
        return { ...step, text, timers: parseStepTimers(text) };
      }),
    [instructions, ingredients, system, unitLanguage, units],
  );

  if (steps.length === 0) return null;

  const count = steps.length;

  return (
    <section aria-labelledby="recipe-steps-heading" className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 md:pt-1">
        <h2 id="recipe-steps-heading" className="text-[22px] font-bold text-text md:text-[26px]">
          {t("recipe.instructions")}
        </h2>
        <span className="text-sm text-muted">{t("recipe.stepCount", { count })}</span>
        {onCookMode ? (
          <button
            type="button"
            data-track="recipe.cook_mode.open"
            onClick={onCookMode}
            className={cn(
              "ms-auto inline-flex h-10 items-center gap-1.5 self-center rounded-xl px-3 text-sm font-semibold text-primary-text transition-colors hover:bg-primary-soft pointer-coarse:h-11",
              !cookModeOnPhone && "max-md:hidden",
            )}
          >
            <ChefHat aria-hidden className="h-4 w-4" />
            {t("web.library.startCooking")}
          </button>
        ) : null}
      </div>

      <ol dir={display.direction} role="list" className="mt-3 flex flex-col gap-3 md:mt-4">
        {steps.map((step, index) => {
          const playing = video?.activeStep != null && video.activeStep === step.step;
          const stepNumber = index + 1;
          const hasChips = step.timestamp_seconds != null || (timers && step.timers.length > 0);
          return (
            <li
              key={`${step.step}-${index}`}
              data-testid={`recipe-step-${step.step}`}
              aria-current={playing ? "step" : undefined}
              className={cn(
                "flex items-start gap-3.5 rounded-3xl border bg-surface p-4 transition-colors md:gap-[18px] md:px-6 md:py-[22px]",
                // The step on screen in the video.
                playing ? "border-primary bg-primary-soft" : "border-border",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-lg font-bold tabular-nums md:h-11 md:w-11 md:rounded-btn md:text-xl",
                  playing ? "bg-primary text-on-primary" : "bg-element text-text",
                )}
              >
                {step.step}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1.5">
                <span className="sr-only">{t("recipe.cookModeStep", { current: stepNumber, total: count })}. </span>
                <p lang={display.contentLanguage ?? undefined} className="max-w-[65ch] text-start text-base leading-[1.55] text-pretty text-text md:text-[17px]">
                  {step.text}
                </p>
                {hasChips ? (
                  <div className="flex flex-wrap items-center gap-2" data-slot="step-video">
                    {timers
                      ? step.timers.map((timer) => {
                          const running = timers.timers.find((item) => item.step === stepNumber && item.label === timer.label);
                          const left = running ? secondsLeft(running, timers.now) : null;
                          if (running && left != null) {
                            return (
                              <span key={`${timer.seconds}-${timer.label}`} data-testid="step-timer" className={cn(stepChip, "bg-primary pe-1 text-on-primary", left === 0 && "motion-safe:animate-pulse")}>
                                <Timer aria-hidden className="h-[15px] w-[15px]" />
                                <span role="timer" dir="ltr" className="tabular-nums">
                                  {left === 0 ? t("recipe.cookModeTimerDone") : formatCountdown(left)}
                                </span>
                                <button
                                  type="button"
                                  data-track="recipe.step.timer.stop"
                                  onClick={() => timers.stop(running.id)}
                                  aria-label={t("web.cook.stopTimer", { label: timer.label })}
                                  className="grid h-7 w-7 place-items-center rounded-lg hover:bg-on-primary/15 pointer-coarse:h-9 pointer-coarse:w-9"
                                >
                                  <X aria-hidden className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            );
                          }
                          return (
                            <button
                              key={`${timer.seconds}-${timer.label}`}
                              type="button"
                              data-track="recipe.step.timer.start"
                              onClick={() => timers.start(timer.label, timer.seconds, stepNumber)}
                              aria-label={t("recipe.cookModeTimer", { label: timer.label })}
                              className={cn(stepChip, "bg-primary-soft text-primary-text hover:brightness-95 active:brightness-90")}
                            >
                              <Timer aria-hidden className="h-[15px] w-[15px]" />
                              <span dir={display.direction}>{timer.label}</span>
                            </button>
                          );
                        })
                      : null}
                    {step.timestamp_seconds == null ? null : video ? (
                      <button
                        type="button"
                        data-track="recipe.step.jump_to_video"
                        onClick={() => video.onPlayAt(step.timestamp_seconds ?? 0)}
                        aria-label={t("web.cook.playFrom", { time: formatVideoTimestamp(step.timestamp_seconds) })}
                        className={cn(stepChip, "font-semibold hover:brightness-95 active:brightness-90", playing ? "bg-surface text-text" : "bg-element text-text")}
                      >
                        <Play aria-hidden className="h-3 w-3 fill-current" />
                        <StepTime seconds={step.timestamp_seconds} />
                      </button>
                    ) : (
                      <span className={cn(stepChip, "bg-element font-semibold text-muted")}>
                        <Video aria-hidden className="h-3.5 w-3.5" />
                        <span className="sr-only">{t("web.recipe.stepVideoTime", { time: formatVideoTimestamp(step.timestamp_seconds) })}</span>
                        <StepTime seconds={step.timestamp_seconds} />
                      </span>
                    )}
                    {playing ? <span className="text-xs font-semibold text-primary-text">{t("web.cook.nowPlaying")}</span> : null}
                  </div>
                ) : null}
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
