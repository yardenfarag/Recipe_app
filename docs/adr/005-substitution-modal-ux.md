# ADR 005: Substitution UX (Full-Screen Modal)

**Status:** Accepted  
**Date:** 2026-07-16  
**Deciders:** Yarden (product)

## Context

ChopChop offers AI-powered ingredient substitutions when a user doesn't have an item. The UX must feel helpful and trustworthy — not a throwaway alert.

## Decision

**Full-screen modal** when user taps **Swap** on an ingredient:

1. Modal shows the original ingredient at the top.
2. AI returns 2–3 alternatives, each with:
   - Substitute name + adjusted quantity
   - Short "why this works" note (flavor, texture, dietary fit)
3. User taps **Use this** on their choice → ingredient row updates in RecipeDetail.
4. Dismiss via back chevron or swipe-down.

### What we are not building in MVP

- Inline replace (too cramped for explanations)
- Bottom sheet (rejected in favour of full modal)
- Saving substitution preferences for future recipes

## Consequences

### Positive

- Room for AI context — builds trust in the suggestion
- Clear focus — one ingredient, one decision at a time
- Matches "smart insights" product vision

### Negative / Trade-offs

- More UI work than a simple alert
- Each Swap is a separate Gemini call (cost per tap)
- Modal interrupts cooking flow briefly (acceptable — user initiated it)

## Implementation Notes (Phase 2)

- `src/components/SubstitutionModal.tsx`
- Edge Function: `suggest-substitution` — input: `{ ingredient, recipe_context }`, output: `{ alternatives: [{ name, quantity, unit, reason }] }`
- Update ingredient in local state; persist on save
