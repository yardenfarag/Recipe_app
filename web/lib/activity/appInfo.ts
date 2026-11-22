import appConfig from "../../../app.json";

/**
 * How the new web app names itself in the activity log (interaction_events) and to in-app message targeting.
 *
 * - Platform: `web`, the only value the table and get_in_app_messages accept for a browser. Messages aimed at
 *   `web` reach both the Expo web app and this one.
 * - App version: the mobile app's version from app.json (the release this build of master goes out with), plus
 *   `-next`, e.g. "1.0.10-next" ("1.0.10-next-dev" from `next dev`). The suffix tells this app apart from the Expo web
 *   app ("1.0.10") on the admin Activity page. Targeting ignores anything after "-" (shared/lib/inAppMessages.ts
 *   `parseVersion`, and the server does the same), so `minAppVersion` / `maxAppVersion` compare it as 1.0.10, like
 *   the Expo web build from the same commit. Recorded in ADR 020 and ADR 023.
 */
export const ACTIVITY_PLATFORM = "web" as const;

export const APP_VERSION: string = `${appConfig.expo.version}-next${process.env.NODE_ENV === "development" ? "-dev" : ""}`.slice(0, 24);
