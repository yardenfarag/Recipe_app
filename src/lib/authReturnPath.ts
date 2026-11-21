/**
 * Where to send someone after they sign in from a shared or Hub recipe, so the recipe they came
 * for isn't lost. Only in-app recipe pages are allowed: anything else (another site, another
 * screen) is dropped, so the parameter can't be used as an open redirect.
 */
const ALLOWED = /^\/(s|hub)\/[A-Za-z0-9_-]{1,128}(\?save=1)?$/;

export function safeReturnPath(value: string | string[] | null | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const path = raw.trim();
  return ALLOWED.test(path) ? path : null;
}

/** The page to come back to: the same recipe, saving it as soon as the visitor is signed in. */
export function saveAfterSignInPath(kind: 's' | 'hub', id: string): string | null {
  return safeReturnPath(`/${kind}/${id.trim()}?save=1`);
}

/** True for the recipe pages a signed-out visitor may open without onboarding first. */
export function isPublicRecipePath(pathname: string): boolean {
  return pathname.startsWith('/s/') || pathname.startsWith('/hub/');
}
