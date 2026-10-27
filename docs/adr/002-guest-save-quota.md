# ADR 002: Guest Save Quota (Auth Gate)

**Status:** Superseded (partial)  
**Date:** 2026-07-16  
**Updated:** 2026-08-07  
**Deciders:** Yarden (product)

## Context

Pinch needs an auth strategy for Phase 2. Requiring sign-up before the first Snap creates friction; allowing unlimited anonymous use complicates persistence and abuse prevention.

## Decision (original)

**Hybrid guest flow:**

1. New users can **Snap and save up to 3 recipes** without an account.
2. Guest saves are stored **locally on device** (AsyncStorage) — not in Supabase.
3. On attempting to save a **4th recipe**, or when tapping "Save" with quota exhausted, prompt **sign up / log in**.
4. After sign-up, offer to **migrate** the 3 local guest recipes into their Supabase library.

## Decision (2026-08-07)

Guests may still **extract up to 3 recipes** per install (server `guest_usage`), but **cannot save**. *(Superseded: guests can no longer extract at all. Snap sends them to sign up / log in, and `extract-recipe` / `invent-recipe` return `auth_required` without a signed-in user.)* Tapping Save always prompts sign up / log in. Signed-in users get 10 free recipe credits / month (ADR 016) and can save; after that they spend purchased recipe credits (ADR 012). Pinch Plus was retired in ADR 012.

Local guest recipe storage + migration helpers remain for any recipes already saved before this change.

## Consequences

### Positive

- Clear conversion: try extraction as guest, account required to keep recipes
- Supabase RLS stays simple — cloud recipes always have a `user_id`

### Negative / Trade-offs

- Higher friction before first saved recipe
- Guest recipes already on device (pre-change) still migrate on sign-up

## Implementation Notes

- `src/lib/guestRecipes.ts` — `GUEST_RECIPE_LIMIT = 0`
- Preview save path prompts auth for guests
- Sign-up still migrates any residual local guest recipes
