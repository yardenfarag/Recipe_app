/**
 * The first-run questions on the web (PIN-140), in order. The step is kept in the address (`?step=avoid`), so the
 * browser's Back goes to the previous question and a reload stays where it was.
 *
 * Fewer than on the phone: language is picked on the welcome page (and stays in the top bar), and light or dark and
 * the theme wait in Settings with good defaults. What's asked is what changes the recipes; cups or grams and
 * Metric or US (PIN-53) sit under the diets on the first question.
 */
import type { KitchenProfile } from "@shared/lib/kitchenProfile";
import { avoidListIsEmpty } from "@shared/lib/avoidList";

import { ONBOARDING_PATH } from "@/lib/onboarding/paths";

export const ONBOARDING_STEPS = ["diet", "avoid", "heard"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The same limit as the mobile app and Settings. */
export const MAX_DIETS = 4;

export const STEP_LABEL_KEYS: Record<OnboardingStep, string> = {
  diet: "web.onboarding.stepDiet",
  avoid: "web.onboarding.stepAvoid",
  heard: "web.onboarding.stepHeard",
};

export function parseOnboardingStep(raw: string | null | undefined): OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(raw ?? "") ? (raw as OnboardingStep) : ONBOARDING_STEPS[0];
}

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

export function nextStep(step: OnboardingStep): OnboardingStep | null {
  return ONBOARDING_STEPS[stepIndex(step) + 1] ?? null;
}

export function previousStep(step: OnboardingStep): OnboardingStep | null {
  return ONBOARDING_STEPS[stepIndex(step) - 1] ?? null;
}

/** The address of a step, keeping where the visitor goes afterwards. The first step has no `step` of its own. */
export function stepPath(step: OnboardingStep, next: string): string {
  const query = new URLSearchParams();
  if (step !== ONBOARDING_STEPS[0]) query.set("step", step);
  if (next !== "/") query.set("next", next);
  const search = query.toString();
  return search ? `${ONBOARDING_PATH}?${search}` : ONBOARDING_PATH;
}

/** The switch that adapts new imports is worth offering only once there is something to adapt for. */
export function hasSomethingToApply(profile: KitchenProfile): boolean {
  return profile.diets.length > 0 || !avoidListIsEmpty(profile);
}
