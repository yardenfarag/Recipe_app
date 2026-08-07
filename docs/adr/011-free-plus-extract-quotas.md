# ADR 011: Free + Pinch Plus extract quotas

**Status:** Accepted  
**Date:** 2026-07-23  
**Updated:** 2026-08-07  
**Deciders:** Yarden (product)

## Context

Product tokens created friction at the moment of saving a recipe. Users want a simple free trial then a monthly plan. Real App Store / Play Billing is deferred; we still need quotas that protect Gemini + ScrapeCreators spend.

## Decision

| Tier | Extracts | Notes |
|---|---|---|
| Guest | 3 lifetime / install | Cannot save recipes |
| Free (signed in) | **15 extracts / calendar month** (UTC) | Can save; then paywall |
| Pinch Plus | **100 extracts / calendar month** (UTC) | Display price **$9.99/mo**; AI remix included |
| Cached URL re-extract | Free | No provider work |

- **Gated action:** extract only for quota. **Remix** requires Pinch Plus (not counted against extract quota). Translate / substitution are not counted.
- **Honor-system Plus:** signed-in users may tap **Upgrade to Plus** / **Cancel** without payment until IAP.
- **Support tickets:** in-app “Report an issue” writes to `support_tickets`; mailto remains as fallback.
- Legacy `token_balance` / `token_ledger` stay read-only for now; new extracts do not spend tokens.
- Legacy `profiles.free_extracts_used` is no longer incremented; Free and Plus both meter via `extract_usage_monthly`.

## Consequences

### Positive

- Saving feels free within a clear monthly allowance
- Monthly Free + Plus caps bound worst-case Instagram video cost
- Self-serve upgrade/cancel validates UX before billing

### Negative / Trade-offs

- Honor-system Plus can be abused until IAP
- Mid-month Free→Plus upgrade shares the same monthly extract counter (usage already spent still counts)

## Implementation Notes

- Migrations `0013_subscription_quotas.sql`, `0016_monthly_free_quotas.sql`
- Edge: `supabase/functions/_shared/quotas.ts`, `extract-recipe`, `transform-recipe`
- Client: `src/lib/quotas.ts`, Settings plan UI, SupportTicketModal
