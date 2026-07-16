# ADR 003: Platform Rollout Order

**Status:** Accepted  
**Date:** 2026-07-16  
**Deciders:** Yarden (product)

## Context

ChopChop's vision covers TikTok, Instagram, and YouTube. Scraping reliability varies sharply by platform — YouTube has captions/APIs; Instagram and TikTok are harder. The user wants all platforms eventually, not a YouTube-only product.

## Decision

**Staged platform support** — the app accepts URLs from all three from day one, but extraction is rolled out in order:

| Stage | Platform | Phase |
|-------|----------|-------|
| 1 | **YouTube** | Phase 2a — prove extraction pipeline end-to-end |
| 2 | **Instagram** | Phase 2b — add after YouTube is stable |
| 3 | **TikTok** | Phase 2c — add last (hardest scrape) |

### UX for unsupported platforms

When a user pastes a URL from a platform not yet live:

- Show a clear message: *"Instagram support is coming soon — we're starting with YouTube."*
- Do **not** silently fail or return garbage data.

When a platform stage ships, remove it from the unsupported list with no app-store update required (Edge Function handles platform detection).

## Consequences

### Positive

- Architecture built for all three from the start (URL router in Edge Function)
- YouTube validates the full Snap → Extract → Save loop before harder platforms
- User expectations set honestly via "coming soon" states

### Negative / Trade-offs

- TikTok-first users may churn before Phase 2c
- Edge Function needs a platform detector + capability flags per stage
- Instagram/TikTok may need third-party scraping services later

## Implementation Notes

```ts
// Edge Function platform router (conceptual)
type Platform = 'youtube' | 'instagram' | 'tiktok' | 'unknown';
type SupportLevel = 'live' | 'coming_soon';

const PLATFORM_SUPPORT: Record<Platform, SupportLevel> = {
  youtube: 'live',       // Phase 2a
  instagram: 'coming_soon', // → live in 2b
  tiktok: 'coming_soon',    // → live in 2c
  unknown: 'coming_soon',
};
```
