# ADR 002: Guest Save Quota (Auth Gate)

**Status:** Accepted  
**Date:** 2026-07-16  
**Deciders:** Yarden (product)

## Context

ChopChop needs an auth strategy for Phase 2. Requiring sign-up before the first Snap creates friction; allowing unlimited anonymous use complicates persistence and abuse prevention.

## Decision

**Hybrid guest flow:**

1. New users can **Snap and save up to 3 recipes** without an account.
2. Guest saves are stored **locally on device** (AsyncStorage) — not in Supabase.
3. On attempting to save a **4th recipe**, or when tapping "Save" with quota exhausted, prompt **sign up / log in**.
4. After sign-up, offer to **migrate** the 3 local guest recipes into their Supabase library.

## Consequences

### Positive

- Low-friction first experience — user sees value before committing
- Natural conversion moment at recipe #4
- Supabase RLS stays simple — cloud recipes always have a `user_id`

### Negative / Trade-offs

- Need local storage schema mirroring `Recipe` type
- Migration flow adds one-time complexity on sign-up
- Guest recipes lost if user uninstalls before signing up
- Quota is per-device, not per-user (acceptable for MVP)

## Implementation Notes (Phase 2)

- `src/hooks/useGuestRecipes.ts` — read/write AsyncStorage, enforce limit of 3
- Library screen merges guest + authenticated recipes when logged in
- Sign-up screen includes "Import your 3 saved recipes" step
