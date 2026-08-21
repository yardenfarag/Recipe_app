# ADR 012: Monthly free and purchased recipe credits

**Status:** Accepted  
**Date:** 2026-08-13  
**Supersedes:** ADR 011

## Context

Pinch Plus required users to pay after the free monthly extraction allowance. We want the core app to remain useful for everyone while letting heavy users buy additional recipe capacity without a subscription.

## Decision

- Guests keep 3 lifetime extractions per install and must sign in to save recipes.
- Every signed-in user receives 15 recipe credits per UTC calendar month.
- One successful, uncached extraction costs one credit. Failed and cached extractions are free.
- Monthly free credits are spent before purchased credits and do not roll over.
- Purchased credits never expire. RevenueCat validates iOS and Android consumables and hosts web billing; Supabase is the authoritative balance and ledger.
- Initial packs are 10, 30, and 100 credits. Store offerings provide localized prices.
- Pinch Plus is retired. AI remix is free for signed-in users, capped at **5 remixes per recipe** (preview usage carries over when the recipe is saved).
- Legacy balances convert at 10 old product tokens to 1 recipe credit. Existing Plus accounts move to the standard 15-credit monthly allowance.

## Accounting

`extract_usage_monthly` stores the free pool’s usage. `profiles.token_balance` stores only non-expiring purchased credits. `reserve_recipe_credit` locks the user profile, reserves from the free pool first, and falls back to the purchased pool. Successful extractions finalize the reservation; known failures refund it. A service-role reconciliation RPC refunds stale reservations.

RevenueCat webhooks are authenticated, product IDs are allowlisted server-side, and event and store transaction IDs are unique. Client callbacks never grant credits.

## Consequences

- All signed-in users can keep using Pinch every month without subscribing.
- Heavy users can buy only what they need, and paid value is preserved indefinitely.
- Two balances must remain separate for correct reset behavior and App Store compliance.
- Purchases require development or production builds; Expo Go cannot complete real store transactions.
- Pack pricing must be reviewed against measured p95 provider cost and video-fallback frequency.

## Rollout

Deploy migration `0018_recipe_credits.sql` and the RevenueCat webhook before enabling the public purchase flag. Deploy `0022_recipe_remix_usage.sql` with the updated `transform-recipe` function so remix metering is per recipe. Configure matching products in App Store Connect, Google Play, and RevenueCat Billing. Schedule `refund_stale_recipe_credits` and monitor grant, refund, and provider-cost telemetry.
