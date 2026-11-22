# ADR 020: Log every screen, tap, login and signup for admins

**Status:** Accepted
**Date:** 2026-11-14
**Deciders:** Yarden (product)

## Context

`product_events` records 7 named milestones (recipe saved, paywall viewed and so on). It can't answer "what did this person do before the bug?" or "does anyone use this button?". We want a record of every screen view, button tap, login and signup. It has to serve both product questions and support debugging, it must not slow the app down, and only admins may see it.

## Decision

- **Own table, no new vendor.** `interaction_events` in Supabase, next to `product_events`. Each row has a `kind` (`screen`, `tap` or `auth`), a fixed `name`, the current `screen`, a `session_id`, the user (from the JWT) or the guest install id, the platform and the app version.
- **Named taps through one Pressable.** `@/components/ui/Pressable` wraps React Native's Pressable. Every press logs `trackId` (e.g. `recipe.save`), and a long press logs `<trackId>.long`. Lint blocks importing `Pressable`, `TouchableOpacity` or `TouchableHighlight` from `react-native`. Other actions, such as a Switch or a gesture, call `logTap()`.
- **Screens by route pattern.** `ScreenViewLogger` logs `/recipe/[id]`, not `/recipe/<uuid>`.
- **Auth from one place.** Logins and signups come from the auth state listener. A new account (created within the last 2 minutes) counts as a signup. The `provider` is stored as `method`. Failures are logged in `friendlyAuthError` with Supabase's error code only. Logout is logged and flushed before the session ends, so it stays with the account.
- **Names, never content.** Names and the screen must match `^[A-Za-z0-9_.:/()\[\]-]{1,120}$`, and properties are capped at 512 bytes. No titles, emails, typed text or record ids.
- **No cost on the UI thread.** Logging is a synchronous push onto an in-memory array, with no React state, storage or network in the press path. Batches of up to 50 are sent after 10 s of quiet, when a batch is full, or when the app goes to the background. A failed batch is retried once, then dropped. The queue is capped at 500 events. The Supabase client loads on first send. The screen logger is its own component, so navigation doesn't re-render the root.
- **Write via RPC, read via admin RPCs.** There are no table grants. `log_interaction_events` takes the user from `auth.uid()`, accepts at most 50 events per call, silently drops anything over 600 events per session in 10 minutes, and only trusts the device clock within a day. `admin_interaction_sessions`, `admin_interaction_session_events` and `admin_interaction_top` check `is_current_user_admin()`.
- **Sessions.** A new session id starts on a cold start, or when the app returns after 30 minutes in the background.
- **Retention.** No timed purge for now (decided 2026-11-14): rows are kept until the account is deleted. Deleting the account erases them, including guest rows from that account's sessions (`erase_user_personal_data`). Guest-only rows have no account to delete, so they stay. Revisit once volume or a policy need calls for a cut-off.
- **Admin page.** Settings → Admin → Activity log (`/admin/activity`) shows the most-used screens and taps, sessions by person, and each session's timeline.

## The new web app (PIN-143, 2026-11-21)

The Next.js app in `web/` logs into the same table, through the same queue (`shared/lib/interactionQueue.ts`), with the same names where the action is the same.

- **Told apart by the app version.** Platform is `web` (the only browser value the table accepts). The app version is the mobile version from `app.json` plus `-next`, e.g. `1.0.10-next` (`1.0.10-next-dev` from `next dev`), set in `web/lib/activity/appInfo.ts`. The Expo web app sends `1.0.10`, so the Activity page shows which app a session came from. Product events from the new web app carry the same value as an `app_version` property, and `platform: web` where mobile sends a platform.
- **Presses through `data-track`.** `Button` and `IconButton` take `trackId` and write it as `data-track`; a Link or a plain element gets `data-track="…"` (or `TrackedLink`). One capture-phase click listener (`ActivityTracker`, mounted in `app/providers.tsx`) logs the nearest pressable element's id, or `unnamed`. The click path only reads an attribute and pushes onto the queue. A press that a tap can't express (a keyboard shortcut) calls `logTap()`.
- **Screens by route pattern, with the mobile names.** `/recipe/[id]` comes from Next's params, and id-looking segments of an address no page matched become `[id]`. The five main pages log as the mobile tabs (`/(tabs)`, `/(tabs)/hub`, `/(tabs)/add`, `/(tabs)/list`, `/(tabs)/settings`), so both apps count together and an in-app message's screen list works on both.
- **Sending.** Batches go straight to `rpc/log_interaction_events` with `fetch(…, { keepalive: true })`, so the last batch survives the tab closing; supabase-js can't ask for keepalive. Whatever is queued goes out when the tab is hidden or the page is left (`visibilitychange`, `pagehide`).
- **Sessions per tab.** The session id is kept in the tab's `sessionStorage` when the tab is hidden, so a reload or a Google sign-in redirect keeps it; it is replaced after 30 minutes hidden, as on mobile.
- **One visitor id.** The visitor id is `localStorage['pinch:install-id']`, the key the landing page (`landing/track.js`) and the Expo web app use. Rows before sign-in carry it, rows after carry the account, and both share the session id. Product events carry it signed in or not (as PR #73 did for mobile). Once the app is served at `pinch-app.io/app`, a landing-page visit joins the app activity through it; on `next.pinch-app.io` it is a different origin, so the two ids differ until the switch.
- **Auth.** Logins and signups follow the same rules on both apps (`shared/lib/authActivity.ts`). A sign-in in one tab reaches the others through supabase-js; only a visible tab logs it. Sign-out logs `auth.logout` and sends it (waiting at most 2 s) before the session ends.
- **Off in unit tests** (`NODE_ENV=test`) and on the server.

## Considered options

- **PostHog autocapture.** Captures taps without code changes and comes with funnels. But it adds a third-party processor, and autocaptured names come from labels, which here are translated text and can contain recipe titles.
- **Extend `product_events`.** Its name allow-list and 13-month retention suit milestones, not every tap, and the volume would drown out the funnel events.
- **On-device log only.** Private, but it can't answer product questions, and support would depend on the user sending the log.

## Consequences

- The privacy policy (web and in-app) now lists "App activity". The App Store and Play data safety forms need "Product interaction", linked to the user, used for analytics and app functionality.
- New buttons need a `trackId`, and in dev a missing one prints a warning. Untagged presses show up as `unnamed` on the Activity page.
- Volume is roughly one row per tap. At current usage that's small. With no purge, only the per-session cap bounds growth, so watch the table size and add a cut-off to `purge_expired_personal_data` when it matters.
