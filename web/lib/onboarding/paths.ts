/**
 * Addresses for the way in (PIN-140): the welcome page (/welcome), sign-up, and the first-run questions
 * (/onboarding). Each carries `next`, the page the visitor was headed for, so they end up there afterwards.
 * Paths are relative to the app (Next adds the /app base path).
 */
import { safeNextPath } from "@/lib/nextPath";

export const WELCOME_PATH = "/welcome";
export const ONBOARDING_PATH = "/onboarding";

/** Where to go after the way in: a safe in-app path that isn't the way in itself (that would go round in circles). */
export function afterOnboardingPath(raw: string | null | undefined): string {
  const next = safeNextPath(raw);
  const path = next.split(/[?#]/)[0];
  return path === WELCOME_PATH || path === ONBOARDING_PATH ? "/" : next;
}

function withNext(path: string, next: string | null | undefined): string {
  const target = afterOnboardingPath(next);
  return target === "/" ? path : `${path}?next=${encodeURIComponent(target)}`;
}

export function onboardingPathFor(next?: string | null): string {
  return withNext(ONBOARDING_PATH, next);
}

export function welcomePathFor(next?: string | null): string {
  return withNext(WELCOME_PATH, next);
}

/** "Get started": create the account, then the questions, then where they were headed. */
export function signUpFromWelcome(next?: string | null): string {
  return `/auth?mode=signup&reason=welcome&next=${encodeURIComponent(onboardingPathFor(next))}`;
}

/** "I already have an account": sign in and go straight on. */
export function signInFromWelcome(next?: string | null): string {
  const target = afterOnboardingPath(next);
  return target === "/" ? "/auth?mode=signin" : `/auth?mode=signin&next=${encodeURIComponent(target)}`;
}
