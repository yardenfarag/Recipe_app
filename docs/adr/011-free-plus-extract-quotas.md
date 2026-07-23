# ADR 011: Free + Pinch Plus extract quotas

**Status:** Accepted  
**Date:** 2026-07-23  
**Deciders:** Yarden (product)

## Context

Product tokens created friction at the moment of saving a recipe. Users want a simple free trial then a monthly plan. Real App Store / Play Billing is deferred; we still need quotas that protect Gemini + ScrapeCreators spend.

## Decision

| Tier | Extracts | Notes |
|---|---|---|
| Guest | 3 lifetime / install | Unchanged |
| Free (signed in) | **10 lifetime** recipe extracts | Then paywall |
| Pinch Plus | **90 extracts / calendar month** (UTC) | Display price **$6.99/mo** |
| Cached URL re-extract | Free | No provider work |

- **Gated action:** extract only. Remix / translate / substitution are not counted.
- **Honor-system Plus:** signed-in users may tap **Upgrade to Plus** / **Cancel** without payment until IAP.
- **Support tickets:** in-app “Report an issue” writes to `support_tickets`; mailto remains as fallback.
- Legacy `token_balance` / `token_ledger` stay read-only for now; new extracts do not spend tokens.

## Consequences

### Positive

- Saving feels free within a clear allowance
- Monthly Plus cap bounds worst-case Instagram video cost
- Self-serve upgrade/cancel validates UX before billing

### Negative / Trade-offs

- Honor-system Plus can be abused until IAP
- Free allotment is lifetime (not monthly), so cancel/re-upgrade does not reset it

## Implementation Notes

- Migration `0013_subscription_quotas.sql`
- Edge: `supabase/functions/_shared/quotas.ts`, `extract-recipe`
- Client: `src/lib/quotas.ts`, Settings plan UI, SupportTicketModal
