# ADR 008: Localized Cost Estimate

**Status:** Accepted  
**Date:** 2026-07-16  
**Deciders:** Yarden (product)

## Context

Cost estimate is stored as `$`, `$$`, or `$$$` in the database (relative tier, not a dollar amount). Display should feel relevant to users in different countries.

## Decision

**User region drives cost display** — the stored value remains the 1–3 tier enum; the UI maps it to localized labels and symbols.

| Stored value | Meaning | Example display |
|--------------|---------|-----------------|
| `$` | Budget | US: `$` · IL: `₪` · EU: `€` · Fallback: "Budget" |
| `$$` | Moderate | US: `$$` · IL: `₪₪` · EU: `€€` · Fallback: "Moderate" |
| `$$$` | Premium | US: `$$$` · IL: `₪₪₪` · EU: `€€€` · Fallback: "Premium" |

### Locale detection

- Use device locale (`expo-localization` or `Intl`) for MVP
- No manual region picker in Phase 2
- Gemini still estimates tier relative to the recipe's likely origin market; tier enum is locale-agnostic

### Fallback

If locale is unknown, show text labels: **Budget · Moderate · Premium** (never raw `$` to a non-USD user without context).

## Consequences

### Positive

- Feels native to Israeli, European, and US users
- DB schema unchanged — localization is presentation-only

### Negative / Trade-offs

- `expo-localization` adds a dependency
- Currency symbol repetition (`₪₪₪`) is unconventional — may use text labels for some locales instead
- AI tier accuracy varies by region (acceptable for MVP)

## Implementation Notes

- `src/lib/formatCostEstimate.ts` — maps tier + locale → display string
- Store in DB as `cost_estimate: '$' | '$$' | '$$$'` (unchanged)
