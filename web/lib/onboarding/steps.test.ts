import { describe, expect, it } from "vitest";

import { EMPTY_KITCHEN_PROFILE } from "@shared/lib/kitchenProfile";

import { hasSomethingToApply, nextStep, parseOnboardingStep, previousStep, stepPath } from "./steps";

describe("onboarding steps", () => {
  it("reads the step from the address, starting at the first", () => {
    expect(parseOnboardingStep("avoid")).toBe("avoid");
    expect(parseOnboardingStep("heard")).toBe("heard");
    expect(parseOnboardingStep(null)).toBe("diet");
    expect(parseOnboardingStep("look")).toBe("diet");
  });

  it("goes diet, avoid, heard", () => {
    expect(nextStep("diet")).toBe("avoid");
    expect(nextStep("avoid")).toBe("heard");
    expect(nextStep("heard")).toBeNull();
    expect(previousStep("avoid")).toBe("diet");
    expect(previousStep("diet")).toBeNull();
  });

  it("keeps next in each step's address", () => {
    expect(stepPath("diet", "/")).toBe("/onboarding");
    expect(stepPath("avoid", "/")).toBe("/onboarding?step=avoid");
    expect(stepPath("heard", "/add")).toBe("/onboarding?step=heard&next=%2Fadd");
  });

  it("offers auto-adapt only once there is something to adapt for", () => {
    expect(hasSomethingToApply(EMPTY_KITCHEN_PROFILE)).toBe(false);
    expect(hasSomethingToApply({ ...EMPTY_KITCHEN_PROFILE, diets: ["vegan"] })).toBe(true);
    expect(hasSomethingToApply({ ...EMPTY_KITCHEN_PROFILE, dislikes: ["olives"] })).toBe(true);
    expect(hasSomethingToApply({ ...EMPTY_KITCHEN_PROFILE, allergies: ["peanuts"] })).toBe(true);
  });
});
