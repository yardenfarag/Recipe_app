# ADR 010: Native Share Extension (Phase 3)

**Status:** Accepted
**Date:** 2026-07-16
**Deciders:** Yarden (product)

## Context

The core vision (share from TikTok/IG/YouTube → ChopChop appears in the OS share sheet → recipe extracted automatically) requires native code:

- **iOS:** a Share Extension target (separate mini-app bundle) that receives the shared URL and hands off to the main app.
- **Android:** an intent filter (`ACTION_SEND`, mime type `text/plain`) declared in the manifest so ChopChop appears as a share target.

Neither is possible in Expo Go; both require a dev build (ADR 009).

## Decision

Build the **full native share extension now**, for both platforms, rather than deferring or doing a clipboard-based workaround:

- **Android first** — `expo-share-intent` (community config plugin) adds the intent filter and delivers the shared URL to the JS side via a listener. No custom native code to hand-write; works with EAS Build's prebuild step.
- **iOS second** — same `expo-share-intent` plugin also generates the iOS Share Extension target through Expo's config plugin system (App Groups + extension target), avoiding hand-written Swift/Xcode project surgery where possible.
- App cold-launches (or resumes) with the shared URL as a launch param → routes straight into the existing `extract-recipe` flow (`/add` → Edge Function → `/recipe/preview`), reusing all of Phase 2's extraction pipeline unchanged.

## Consequences

### Positive
- Delivers the app's headline feature ("share a TikTok, get a recipe") — the core differentiator from the original vision
- Reuses 100% of the existing extraction/preview/save pipeline; only the entry point changes
- `expo-share-intent` avoids most manual native project editing

### Negative / Trade-offs
- Requires a dev build for **every** test cycle from here on (no more Expo Go for this feature)
- iOS Share Extension needs an Apple Developer account + App Group entitlement — blocked until that's set up (see ADR 009)
- Android can be built, tested, and shipped independently first, ahead of iOS

## Implementation Notes
- `npx expo install expo-share-intent`, add plugin to `app.json`
- New screen/route (e.g. `src/app/share-intent.tsx` or reuse `/add` with a `useShareIntent()` hook) to receive the shared URL and auto-submit
- Android dev build validates the intent filter end-to-end before iOS is attempted
