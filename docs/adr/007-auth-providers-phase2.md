# ADR 007: Auth Providers (Phase 2)

**Status:** Accepted  
**Date:** 2026-07-16  
**Deciders:** Yarden (product)

## Context

Guest users hit the 3-recipe save quota and must sign up (ADR 002). Auth provider choice affects conversion and setup complexity.

## Decision

Phase 2 sign-up / log-in offers **all three**:

| Provider | Implementation | Expo Go |
|----------|----------------|---------|
| **Email/password** | Supabase `signUp` / `signInWithPassword` | ✅ |
| **Apple Sign-In** | `expo-apple-authentication` + `signInWithIdToken` | ✅ iOS only |
| **Google Sign-In** | OAuth browser flow or `@react-native-google-signin` | ⚠️ Browser OAuth in Expo Go; native SDK in Phase 3 dev build |

### Sign-up screen layout

```
┌─────────────────────────┐
│   Create your account   │
│                         │
│  [ Continue with Apple ]│  ← iOS only
│  [ Continue with Google]│
│                         │
│  ─── or ───             │
│                         │
│  Email                  │
│  Password               │
│  [ Sign up ]            │
└─────────────────────────┘
```

On successful sign-up: migrate up to 3 guest recipes from AsyncStorage → Supabase.

## Consequences

### Positive

- Maximum conversion options at the quota gate
- Apple + Google reduce password friction on mobile

### Negative / Trade-offs

- Google OAuth needs redirect URI + Supabase provider config
- Apple requires `host.exp.Exponent` in Supabase Apple Client IDs for Expo Go testing
- Three auth paths = more error handling and test surface

## Implementation Notes

- `src/app/auth/sign-up.tsx` and `sign-in.tsx`
- Supabase Dashboard: enable Email, Apple, Google providers
- Google: start with browser OAuth (`signInWithOAuth`) for Expo Go compatibility
