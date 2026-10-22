# ADR 017: Kitchen appliances on each recipe

**Status:** Proposed (design in progress)
**Date:** 2026-10-22
**Deciders:** Harel (implementation), Yarden (product)
**Tickets:** PIN-26

## Context

People save recipes without knowing whether their kitchen can make them, and find out halfway through that they need a blender or a stand mixer. PIN-26 asks for a list of appliances on every recipe, each marked required or optional.

The ticket was written on 2026-10-04, before per-task models (ADR 015). Facts that shape the design:

- `RECIPE_SCHEMA` in `supabase/functions/_shared/gemini.ts` is shared by every extraction model (text, photo, video, repair, invent). A field added there reaches every flow and every model.
- The extraction prompt currently says "never invent … equipment" (`gemini.ts` lines 45 and 513). The ticket wants appliances that a step clearly implies ("bake at 180°C" → oven), so these rules have to be reconciled.
- Recipes are copied in several places: `recipes`, `recipe_cards` (Hub, published by a trigger on save), share snapshots, and the kitchen auto-apply copy (`kitchen_original`).
- Merging to master deploys the web app automatically, but migrations are applied by hand.

## Decisions

### 1. Storage and empty state

- New nullable column `appliances jsonb` on **`recipes`** and **`recipe_cards`**. This follows the existing `ingredients` and `instructions` columns, and the list (about 1–6 items) is always read together with its recipe.
- **`NULL` means "not analysed"**: every recipe saved before this feature. The UI shows nothing, and the recipe renders exactly as it does today.
- **`[]` means "analysed, needs no appliances"** (e.g. a salad).
- A check constraint allows only `NULL` or a JSON array. Item-level validation happens in code: a sanitizer drops unknown appliance keys and malformed items, so a bad model answer never breaks a recipe.
- **No index yet.** Filtering by appliance is a follow-up. Add a GIN index when that query ships.
- Rejected: a normalized `recipe_appliances` table. It is cleaner for filtering, but the Hub publish trigger, share snapshots and the save path would all need extra joins or writes, for a small list that is never read on its own.

### 2. Open questions (to be decided)

- Item shape: free-text `note` vs a structured alternative (translation cost).
- Where extraction fills it: inside the shared `RECIPE_SCHEMA`, or a separate cheap task run on the final recipe (also covers remix, repair and backfill).
- Required vs optional: the rule the model follows, and how "clearly implied" is worded without breaking the no-invention rule.
- The controlled list of appliance keys and their icons.
- UI placement in `RecipeView` and the list cards.
- Backfill of existing recipes: none, or lazy with a daily cap.
- How "no invention" is measured (eval fixtures, precision and recall).

## Consequences

- Old app builds keep working, because they never send or read the column.
- Deploy order: the migration is applied before the app change merges, otherwise saves from the web app fail with PGRST204.
