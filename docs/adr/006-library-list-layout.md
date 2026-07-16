# ADR 006: Recipe Library Layout (List Rows)

**Status:** Accepted  
**Date:** 2026-07-16  
**Deciders:** Yarden (product)

## Context

The Library tab is the home for saved recipes. Layout affects scanability as the collection grows.

## Decision

**Single-column list rows** for the Recipe Library:

```
┌──────────────────────────────────────┐
│ [thumb]  Garlic Butter Pasta         │
│          20 min · Easy · $$          │
├──────────────────────────────────────┤
│ [thumb]  Chicken Tikka               │
│          45 min · Medium · $$$       │
└──────────────────────────────────────┘
```

Each row shows:
- Thumbnail (left, ~64×64)
- Title (bold)
- Metadata line: `estimated_time · effort_level · cost_estimate`

Tap row → RecipeDetail.

Empty state (0 recipes) keeps the existing "You have no recipes yet" + Get Started CTA.

## Consequences

### Positive

- Scales well to dozens of recipes
- Metadata visible without opening each recipe
- Simpler to build than a 2-column grid with overlays

### Negative / Trade-offs

- Less visually striking than a photo grid
- Thumbnail quality depends on extraction (some recipes may have no image)

## Implementation Notes

- `src/components/RecipeListRow.tsx`
- Library screen: `FlatList` with guest + authenticated recipes merged (per ADR 002)
