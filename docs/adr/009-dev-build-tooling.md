# ADR 009: Dev Build Tooling (Phase 3)

**Status:** Accepted
**Date:** 2026-07-16
**Deciders:** Yarden (product)

## Context

Phase 1–2 ran entirely in Expo Go, which cannot host custom native modules (share extensions, native Google Sign-In, custom URL scheme registration beyond what Expo Go itself proxies). Phase 3 needs a **development build** (a custom "Expo Go" compiled with our own native code) to add the Share Sheet.

Developer is on Windows with occasional Mac access.

## Decision

Use **EAS Build** (Expo's cloud build service) for both platforms, rather than local native builds:

| Platform | Build method | Why |
|----------|--------------|-----|
| Android | `eas build --profile development --platform android` | Works from Windows; no Android Studio needed |
| iOS | `eas build --profile development --platform ios` | Cloud-signs with an Apple Developer account; no local Xcode/Mac needed for the build itself (Mac only needed if we ever want to debug native iOS code directly in Xcode) |

Requires:
- Free Expo/EAS account (developer confirmed they have one)
- Apple Developer Program membership ($99/yr) for iOS dev builds + eventual TestFlight/App Store — **only needed when we get to the iOS build step**
- `eas.json` with a `development` build profile (`developmentClient: true`, `distribution: internal`)

## Consequences

### Positive
- No local Android/Xcode toolchain required on Windows
- Same build pipeline scales to production builds later (just swap the profile)
- Occasional Mac access remains available as a fallback for native debugging

### Negative / Trade-offs
- Each build takes several minutes on EAS's cloud queue (free tier has queue wait times)
- iOS builds require an Apple Developer account (paid) before we can produce an installable iOS dev build
- Every native module addition (e.g. share extension config) requires a fresh dev build — slower iteration than Expo Go's instant reload for JS-only changes

## Implementation Notes
- Install `eas-cli`, run `eas login`, `eas build:configure`
- Android dev build can be started immediately (no paid account needed)
- iOS dev build deferred until Apple Developer account is confirmed active
