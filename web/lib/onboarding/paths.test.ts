import { describe, expect, it } from "vitest";

import { afterOnboardingPath, onboardingPathFor, signInFromWelcome, signUpFromWelcome, welcomePathFor } from "./paths";

describe("onboarding paths", () => {
  it("goes on to the page the visitor wanted, or the Library", () => {
    expect(afterOnboardingPath("/add")).toBe("/add");
    expect(afterOnboardingPath("/recipe/7?tab=steps")).toBe("/recipe/7?tab=steps");
    expect(afterOnboardingPath(null)).toBe("/");
  });

  it("never goes back into the way in, or out of the app", () => {
    expect(afterOnboardingPath("/onboarding?step=avoid")).toBe("/");
    expect(afterOnboardingPath("/welcome")).toBe("/");
    expect(afterOnboardingPath("/auth?mode=signin")).toBe("/");
    expect(afterOnboardingPath("//evil.example")).toBe("/");
    expect(afterOnboardingPath("https://evil.example")).toBe("/");
  });

  it("carries next only when it isn't the Library", () => {
    expect(onboardingPathFor("/")).toBe("/onboarding");
    expect(onboardingPathFor("/add")).toBe("/onboarding?next=%2Fadd");
    expect(welcomePathFor(undefined)).toBe("/welcome");
    expect(welcomePathFor("/list")).toBe("/welcome?next=%2Flist");
  });

  it("Get started signs up, then asks the questions", () => {
    expect(signUpFromWelcome()).toBe("/auth?mode=signup&reason=welcome&next=%2Fonboarding");
    expect(signUpFromWelcome("/add")).toBe(
      `/auth?mode=signup&reason=welcome&next=${encodeURIComponent("/onboarding?next=%2Fadd")}`,
    );
  });

  it("I already have an account signs in and goes straight on", () => {
    expect(signInFromWelcome()).toBe("/auth?mode=signin");
    expect(signInFromWelcome("/list")).toBe("/auth?mode=signin&next=%2Flist");
  });
});
