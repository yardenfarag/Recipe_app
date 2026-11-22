import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearOnboardingPending,
  finishOnboardingOnDevice,
  isOnboardingPendingFor,
  isReturningBrowser,
  rememberReturningBrowser,
  setOnboardingPending,
} from "./device";

describe("onboarding on this browser", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("reads the Expo web app's finished flag as a returning browser", () => {
    expect(isReturningBrowser()).toBe(false);
    window.localStorage.setItem("pinch:onboardingComplete", "true");
    expect(isReturningBrowser()).toBe(true);
  });

  it("remembers a returning browser", () => {
    rememberReturningBrowser();
    expect(window.localStorage.getItem("pinch:onboardingComplete")).toBe("true");
  });

  it("holds a pending start for an account, or for the account about to be made", () => {
    setOnboardingPending();
    expect(isOnboardingPendingFor("anyone")).toBe(true);
    setOnboardingPending("u1");
    expect(isOnboardingPendingFor("u1")).toBe(true);
    expect(isOnboardingPendingFor("u2")).toBe(false);
    clearOnboardingPending();
    expect(isOnboardingPendingFor("u1")).toBe(false);
  });

  it("finishing clears the pending start and remembers the browser", () => {
    setOnboardingPending("u1");
    finishOnboardingOnDevice();
    expect(isOnboardingPendingFor("u1")).toBe(false);
    expect(isReturningBrowser()).toBe(true);
  });

  it("answers 'nothing stored' when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(isReturningBrowser()).toBe(false);
    expect(() => finishOnboardingOnDevice()).not.toThrow();
    expect(isOnboardingPendingFor("u1")).toBe(false);
  });
});
