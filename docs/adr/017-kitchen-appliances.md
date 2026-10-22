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

### 2. Item shape: structured, translatable, grounded in steps

```ts
type RecipeAppliance = {
  key: ApplianceKey;                 // from the catalog (decision 3)
  required: boolean;
  benefit?: BenefitKey;              // optional items only: why it's worth using
  alternative?: ApplianceKey | AlternativeKey; // the workaround
  steps: number[];                   // instruction step numbers that use it
  origin: 'source' | 'tip';          // decision 5
};

type BenefitKey =
  | 'richer_flavor' | 'smoother_texture' | 'juicier_meat' | 'crispier'
  | 'more_precise' | 'faster' | 'less_effort' | 'even_cooking';

type AlternativeKey = 'by_hand' | 'pre_ground' | 'cut_to_check';
```

- **No free text.** Every value is a key that renders through `t()` in all five locales, so appliances never need `translate-recipe` or a model call, and cached `recipe_translations` rows stay valid. Rejected: the ticket's `note?: string`, which comes back in the source language and would need translating and caching.
- **Steps are the grounding.** A `source` item must cite at least one existing step. The sanitizer drops items whose steps don't exist. This makes "don't invent appliances" a check in code, and lets the UI say *"used in step 3"*.
- **Lists are closed but extendable.** Benefit and alternative keys are small fixed sets. Adding one means adding a key and five translations, with no migration.

### 3. One appliance catalog, grown from real data

- A single source of truth, `src/lib/applianceCatalog.ts`, mirrored in `supabase/functions/_shared/` with a parity test (the same pattern as `recipeCompleteness.ts` ↔ `classifyRecipe.ts`).
- Each entry: `key`, `category`, `tier` (`basic` | `special`), `icon`, and multilingual `aliases` (en, es, he, ru, ar, plus brand names like "KitchenAid" or "Instant Pot") that map the model's wording to a key.
- First version (about 33 entries):

| Category | Keys |
|---|---|
| Heat | stovetop, oven, microwave, toaster, grill, air_fryer, deep_fryer |
| Slow and pressure | slow_cooker, pressure_cooker, rice_cooker, sous_vide |
| Blend and mix | blender, immersion_blender, food_processor, stand_mixer, hand_mixer, spice_grinder |
| Tools | mortar_and_pestle, meat_thermometer, kitchen_scale, zester, mandoline, cast_iron_pan, dutch_oven, wok, springform_pan, pizza_stone |
| Specialist | ice_cream_maker, waffle_maker, juicer, dehydrator, smoker |

- **Never listed:** everyday basics everyone owns (knife, pot, frying pan, bowl, cutting board). They would be noise.
- **Tier:** `basic` (stovetop, oven, microwave) vs `special` (everything else). The recipe screen shows both, with basic items smaller. List cards show only special required items.
- **Growth from data:** a name the model returns that matches no key or alias is dropped from the recipe and logged in `ai_usage_events.metadata` (`unmatched_appliances`). The catalog grows from what users actually snap.
- **Icons:** one `<ApplianceIcon>` component. It uses MaterialCommunityIcons where a glyph exists (blender, microwave, stove, toaster, grill, rice, thermometer, scale, kettle) and about 8 custom `react-native-svg` icons in the same line style where none does (oven, food processor, stand mixer, air fryer, pressure cooker, slow cooker, deep fryer, sous vide). Any icon can be swapped in one place.

### 4. User experience

- **Placement:** a "What you'll need" section directly under the recipe header, before ingredients, because the value is knowing before you start. It lives in its own component, not inline in `RecipeView.tsx`.
- **Two groups:** **Required** (solid chips) and **Makes it better** (muted chips with the benefit and the workaround, e.g. "Mortar & pestle · Richer flavor · or use ground spices").
- **Tap a chip** to open a small sheet showing which step uses it.
- **Empty states:** `[]` shows "No special equipment". `NULL` shows nothing.
- **Library cards:** only special required items, e.g. "Needs: air fryer".
- **RTL:** the row and chip contents mirror through `useRtl()`, and it is checked in Hebrew and Arabic.
- **Follow-up ("My kitchen"):** the catalog keys are the ones a future owned-appliances setting will store, so chips can later show ✓ or ⚠. `sanitizeKitchenProfile` will need extending then.

### 5. Pinch tips (shape now, switch pending Yarden)

- Items with `origin: 'source'` follow the no-invention rule strictly: only what the source says or a step clearly implies.
- Items with `origin: 'tip'` are suggestions the source didn't mention (e.g. a meat thermometer for a steak). They are optional only, at most 2 per recipe, limited to benefit tools in the catalog, and labelled "Pinch tip" in the UI, the same way "Guess the recipe" is labelled as an AI guess.
- The data shape supports tips from day one. **Whether tips are switched on is Yarden's product call,** because it bends the ticket's acceptance criterion "doesn't invent appliances". Until they decide, tips stay off and only `source` items are produced.

### 6. A separate `appliances` task, run on the final recipe

- New task kind `appliances` in `TASK_MODELS` (`_shared/llmClient.ts`): `openai/gpt-6-luna`, falling back to `qwen/qwen3.8-flash`, reasoning `none`. It is called through `generateLlmJson()`.
- **Input:** the finished recipe, trimmed to the title, ingredient names and numbered step text (no amounts, metric or spoon values). **Output:** the item list from decision 2. The JSON schema lists the catalog keys as an `enum`, so the model can only answer with known keys.
- **Where it runs:** on the server, after the recipe is final and before the Hub publish, in extract-recipe, invent-recipe, repair-recipe and transform-recipe (remix and kitchen auto-apply). One implementation covers all flows and a later backfill.
- **Fails soft:** an error, timeout or invalid output gives `appliances = NULL` ("not analysed"). The recipe is still returned. Extraction status and credits are never affected.
- **Cost controls:**
  - Library and Hub cache hits reuse the stored list, so no call is made.
  - Remix reruns it only when the steps changed.
  - There is no retry beyond the router's single fallback.
  - Each call is logged to `ai_usage_events` with action `appliances`.
- **Cost estimate** (production data, 2026-10-22):
  - Saved recipes average about 1,600 characters (p90 about 2,700), so input is about 1,100–1,600 tokens including the prompt and schema, and output about 150–250 tokens.
  - At Luna's $0.10 / $0.50 per million tokens, that is about **$0.0003 per recipe**, roughly the same as the content gate ($0.00026) and about 10% of an extraction ($0.0024 average over the last 30 days).
  - Expected latency is under a second.
- **Rejected:** adding `appliances` to the shared `RECIPE_SCHEMA`. It would change the output of five models (requiring a full eval rerun) and make every extraction schema heavier. It would also leave remixed recipes with stale appliances and give older recipes no path to get them.

### 7. Still open

- The exact required-vs-optional rule, and the prompt wording for "clearly implied" that doesn't conflict with `gemini.ts` lines 45 and 513.
- Backfill of existing recipes: none, or lazy with a daily cap.
- How "no invention" is measured (eval fixtures, precision and recall).

### Questions for Yarden

1. Pinch tips (decision 5): on, off, or later?
2. Migration number: master is at 0043, and open PR #4 also claimed 0041–0044. Is 0044 free for this?

## Consequences

- Old app builds keep working, because they never send or read the column.
- Deploy order: the migration is applied before the app change merges, otherwise saves from the web app fail with PGRST204.
