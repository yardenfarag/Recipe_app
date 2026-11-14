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

## Considered options

- **PostHog autocapture.** Captures taps without code changes and comes with funnels. But it adds a third-party processor, and autocaptured names come from labels, which here are translated text and can contain recipe titles.
- **Extend `product_events`.** Its name allow-list and 13-month retention suit milestones, not every tap, and the volume would drown out the funnel events.
- **On-device log only.** Private, but it can't answer product questions, and support would depend on the user sending the log.

## Consequences

- The privacy policy (web and in-app) now lists "App activity". The App Store and Play data safety forms need "Product interaction", linked to the user, used for analytics and app functionality.
- New buttons need a `trackId`, and in dev a missing one prints a warning. Untagged presses show up as `unnamed` on the Activity page.
- Volume is roughly one row per tap. At current usage that's small. With no purge, only the per-session cap bounds growth, so watch the table size and add a cut-off to `purge_expired_personal_data` when it matters.
