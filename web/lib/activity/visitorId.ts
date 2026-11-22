import { newSessionId } from "@shared/lib/interactionQueue";

/**
 * The visitor id ("install id" in the database: `guest_install_id`). Kept in localStorage under the key the landing
 * page (landing/track.js) and the Expo web app (AsyncStorage on web) use, so on pinch-app.io one visitor has one id
 * across the landing page, the Expo web app and this app, before and after sign-in (ADR 020).
 */
export const VISITOR_ID_KEY = "pinch:install-id";

let fallback: string | null = null;

export function getVisitorId(): string {
  try {
    const saved = window.localStorage.getItem(VISITOR_ID_KEY);
    if (saved && saved.length >= 8) return saved;
    const created = newSessionId();
    window.localStorage.setItem(VISITOR_ID_KEY, created);
    return created;
  } catch {
    // Storage blocked: one id for this page load.
    fallback ??= newSessionId();
    return fallback;
  }
}
