# ADR 016: The free tier stays at 5 recipe credits a month

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Yarden (product)
**Tickets:** PIN-57 (this decision), PIN-56 (competitor review), PIN-58 (3 → 5), PIN-62 (video-fallback metering)
**Supersedes:** the monthly allowance in ADR 012

## Context

ADR 012 set the free allowance to 15 credits a month. It was lowered to 3 in September 2026 and raised to 5 in PIN-58 on 2026-10-20. The competitor review (`docs/research/05-market-research.md`) argued for 10–15, so the "no subscription" pitch beats ReciMe's and Flavorish's 5 imports and Pluck's 3.

Cost was not the constraint. Production `ai_usage_events` for July–October 2026 shows 143 successful extractions averaging **$0.0035** in provider cost, with a maximum of **$0.014**. Instagram video fallbacks averaged $0.0022. The $0.186 stress case modelled in `docs/research/04-token-economics.md` hasn't shown up yet. The sample is small (about 10 users, mostly internal). At 15 credits a month, a user who spends them all would cost about $0.05 on average and $0.21 at the observed maximum.

## Decision

- Signed-in users keep **5 free recipe credits per UTC month** (`FREE_MONTHLY_EXTRACT_LIMIT` in `src/lib/quotas.ts` and `supabase/functions/_shared/pricing.ts`). It isn't raised to 10 or 15.
- Unused free credits still **don't roll over**.
- Abuse protection stays as it is: an account is required to extract. There's no reduced first-month allowance.
- The decision doesn't depend on PIN-62. Its metering can still change pack pricing or video credit costs.

The reason is product judgement, not cost: 10 or more free imports a month gives away too much. Most casual users would never need a pack, and the packs are the only revenue.

## Consequences

- Pinch matches ReciMe and Flavorish on free imports and beats Pluck by 2. The "no subscription" positioning (PIN-59) has to rest on pay-per-use credits that never expire, not on a bigger free tier.
- No code, schema or copy changes. The app's paywall, Credits screen and admin copy all read the constant.
- Revisit if conversion to packs is low while free users churn after hitting the limit, or if competitors widen their free tiers.
