# ADR 016: 10 free recipe credits a month

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Yarden (product)
**Tickets:** PIN-57 (this decision), PIN-56 (competitor review), PIN-58 (3 → 5), PIN-59 (positioning), PIN-62 (video-fallback metering)
**Supersedes:** the monthly allowance in ADR 012

## Context

ADR 012 set the free allowance to 15 credits a month. It was lowered to 3 in September 2026, then raised to 5 in PIN-58 on 2026-10-20. The competitor review (`docs/research/05-market-research.md`) found that a stingy free tier is the most common complaint in this niche: ReciMe and Flavorish give about 5 imports and Pluck gives 3 a month. At 5, Pinch only matches them, which undercuts the planned "recipe saver without a subscription" pitch (PIN-59).

Cost isn't the constraint. Production `ai_usage_events` for July–October 2026 shows 143 successful extractions averaging **$0.0035** in provider cost, with a maximum of **$0.014**. Instagram video fallbacks averaged $0.0022. The $0.186 stress case modelled in `docs/research/04-token-economics.md` hasn't shown up yet. The sample is small (about 10 users, mostly internal). At 10 credits a month, a user who spends them all costs about $0.035 on average and $0.14 at the observed maximum.

## Decision

- Signed-in users get **10 free recipe credits per UTC month** (`FREE_MONTHLY_EXTRACT_LIMIT` in `src/lib/quotas.ts` and `supabase/functions/_shared/pricing.ts`). Migration `0042_free_monthly_limit_10.sql` aligns the SQL defaults of `reserve_recipe_credit` and `reopen_refunded_recipe_credit`.
- That's twice ReciMe's and Flavorish's free imports. 15 was rejected because it gives away too much: few casual users would ever need a pack, and packs are the only revenue.
- Unused free credits still **don't roll over**. Banking (PIN-56 suggested up to 30) would add schema and accounting complexity for little marketing gain.
- Abuse protection stays as it is: an account is required to extract. A throwaway account is worth about 3.5¢ of provider cost a month, so there's no reduced first-month allowance.
- The decision doesn't wait for PIN-62. Its metering can still change pack pricing or video credit costs.

## Consequences

- The landing page, store listing copy and guides now say 10. The app's paywall, Credits screen and admin copy read the constant.
- The 10-credit pack ($1.99) now equals one month's free allowance. Pack sizes may need revisiting if conversion is low.
- Revisit if PIN-62 shows video fallbacks are common or expensive, if blended cost per import rises above about $0.02, or if signed-in account creation looks abusive.
