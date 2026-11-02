# ADR 017: Kitchen appliances on each recipe

**Status:** Accepted (Harel; Yarden's decisions on tips and migration naming, 2026-10-22, are folded in).
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

- One module, `src/lib/appliances.ts` (catalog, types, sanitizer). It has a byte-identical copy at `supabase/functions/_shared/appliances.ts` for the Edge Functions, and `src/lib/appliances.test.ts` fails if the two differ. The module has no imports, so it runs in both Hermes and Deno.
- Each entry: `key`, `category`, `tier` (`basic` | `special`), and multilingual `aliases` (en, es, he, ru, ar, plus brand names like "KitchenAid" or "Instant Pot") that map the model's wording to a key.
- First version (32 entries):

| Category | Keys |
|---|---|
| Heat | stovetop, oven, microwave, toaster, grill, air_fryer, deep_fryer |
| Slow and pressure | slow_cooker, pressure_cooker, rice_cooker, sous_vide |
| Blend and mix | blender, immersion_blender, food_processor, stand_mixer, hand_mixer, spice_grinder |
| Tools | mortar_and_pestle, kitchen_thermometer, kitchen_scale, zester, mandoline, cast_iron_pan, dutch_oven, wok, springform_pan, pizza_stone |
| Specialist | ice_cream_maker, waffle_maker, juicer, dehydrator, smoker |

- **Never listed:** everyday basics everyone owns (knife, pot, frying pan, bowl, cutting board). They would be noise.
- **Tier:** `basic` (stovetop, oven, microwave) vs `special` (everything else). The recipe screen shows both, with basic items smaller. List cards show only special required items.
- **Name matching** (`resolveApplianceKey`): case, accents, Hebrew vowel points, Arabic diacritics, punctuation and invisible direction marks (U+200E/F, U+202A–E, U+2066–9) are ignored. An exact alias always wins. Otherwise the matcher retries without a leading English article (the, a, an) or without 1–2 Hebrew prefix letters (ו ב ה ל מ כ ש), so בתנור, המיקסר and ובמכתש resolve. Step text is cleaned of the same invisible marks, so Hebrew copied from the web compares equal when a remix checks whether the steps changed.
- **Growth from data:** a name the model returns that matches no key or alias is dropped from the recipe and logged in `ai_usage_events.metadata` (`unmatched_appliances`). The catalog grows from what users actually snap.
- **Icons** are UI-only, so they are not in the shared catalog. `src/components/ApplianceIcon.tsx` maps every key to a MaterialCommunityIcons glyph (a `Record<ApplianceKey, …>`, so a missing icon is a type error). The library turned out to have close glyphs for all 32 keys (including mortar-pestle, thermometer-probe, ice-cream, pizza), so one consistent icon family was chosen over the planned custom SVGs. Any icon can be swapped in one place.

### 4. User experience

- **Placement:** a "What you'll need" section directly under the recipe header, before ingredients, because the value is knowing before you start. It lives in its own component, not inline in `RecipeView.tsx`.
- **Two groups:** **Required** (solid chips) and **Makes it better** (muted chips with the benefit and the workaround, e.g. "Mortar & pestle · Richer flavor · or use ground spices").
- **Tap a chip** to open a small sheet showing which step uses it.
- **Empty states:** `[]` shows "No special equipment". `NULL` shows nothing.
- **Library cards:** only special required items, e.g. "Needs: air fryer".
- **RTL:** the row and chip contents mirror through `useRtl()`, and it is checked in Hebrew and Arabic.
- **Follow-up ("My kitchen"):** the catalog keys are the ones a future owned-appliances setting will store, so chips can later show ✓ or ⚠. `sanitizeKitchenProfile` will need extending then.

### 5. Pinch tips: on, with guardrails (Yarden, 2026-10-22)

- Items with `origin: 'source'` follow the no-invention rule strictly: only what the source says or a step clearly implies.
- Items with `origin: 'tip'` are suggestions the source didn't mention (e.g. a meat thermometer for a steak). Recipe content is still never invented: a tip never changes ingredients or steps.
- **Guardrails:**
  - Optional only. A tip is never `required`, and never appears in a list card's "Needs: …" line.
  - It must be a catalog key with `origin: 'tip'` and must cite the step it helps. The sanitizer drops anything else.
  - **Checked by the model:** after the appliances task proposes tips, a short yes/no check by the same model confirms each tip fits this recipe and that step (thermometer for steak: yes; stand mixer for no-knead bread: no). A "no", or any error in the check, drops the tip. The check only runs when there are tips, so most recipes pay nothing extra.
  - At most 2 per recipe (`MAX_PINCH_TIPS`), shown under "Makes it better" with a visible "Pinch tip" label.
- **On by default.** The `APPLIANCE_TIPS_ENABLED` secret set to `false` turns tips off without a deploy.
- **Eval:** tips are scored separately. Target: zero tips that don't fit across the 30 recipes. The precision and recall targets for source items are unchanged.

### 6. A separate `appliances` task, run on the final recipe

- New task kind `appliances` in `TASK_MODELS` (`_shared/llmClient.ts`): `openai/gpt-6-luna`, falling back to `qwen/qwen3.8-flash`, reasoning `none`. It is called through `generateLlmJson()`.
- **Input:** the finished recipe, trimmed to the title, ingredient names and numbered step text (no amounts, metric or spoon values). **Output:** the item list from decision 2. The JSON schema lists the catalog keys as an `enum`. The router sends schemas with `strict: false`, so the enum guides the model but does not bind it; `sanitizeRecipeAppliances` is what guarantees only known keys are kept. Code: `supabase/functions/_shared/recipeAppliances.ts` (`deriveRecipeAppliances`).
- **Where it runs:** on the server, after the recipe is final and before the Hub publish, in extract-recipe, invent-recipe, repair-recipe and transform-recipe (remix and kitchen auto-apply). One implementation covers all flows and a later backfill.
- **Fails soft:** an error, timeout or invalid output gives `appliances = NULL` ("not analysed"). The recipe is still returned. Extraction status and credits are never affected.
- **Cost controls:**
  - Library and Hub cache hits reuse the stored list, so no call is made.
  - Remix reruns it only when the steps changed.
  - There is no retry beyond the router's single fallback.
  - Each call is added to the parent event's `usages` (extract, invent, repair, remix), so its cost shows in that row's `metadata.llm_calls` with `kind: 'appliances'` and the Snap's total stays in one row. Names the model lists as `unlisted` that match no alias go to `metadata.unmatched_appliances`.
  - Tips (decision 5) are on unless the `APPLIANCE_TIPS_ENABLED` secret is `false`. A tip must use one of the benefit tools (`TIP_KEYS`: mortar_and_pestle, kitchen_thermometer, kitchen_scale, zester, cast_iron_pan). When the list call proposes tips, one more short call (same task kind and model, `TIP_CHECK_SCHEMA`) answers `fits` per tip; only an explicit `true` keeps a tip, and an error drops all tips but keeps the source items. Metadata records `appliance_tips_proposed` and `appliance_tips_kept`.
- **Cost estimate** (production data, 2026-10-22):
  - Saved recipes average about 1,600 characters (p90 about 2,700), so input is about 1,100–1,600 tokens including the prompt and schema, and output about 150–250 tokens.
  - At Luna's $0.10 / $0.50 per million tokens, that is about **$0.0003 per recipe**, roughly the same as the content gate ($0.00026) and about 10% of an extraction ($0.0024 average over the last 30 days).
  - Expected latency is under a second.
- **Rejected:** adding `appliances` to the shared `RECIPE_SCHEMA`. It would change the output of five models (requiring a full eval rerun) and make every extraction schema heavier. It would also leave remixed recipes with stale appliances and give older recipes no path to get them.

### 7. Required vs optional, and how "no invention" is measured

**Required:** a step cannot be done without it and there is no reasonable home workaround.
- "Bake at 180°C" → oven.
- "Blend until smooth" → blender. If the source doesn't say which kind, the item is `blender` with `alternative: immersion_blender`.
- "Churn in an ice cream maker" → ice cream maker.

**Optional:** it helps, but a home cook can manage without it. It always carries a `benefit` and, where one exists, an `alternative`.
- Stand mixer → less effort, or by hand.
- Mortar and pestle → richer flavor, or pre-ground spices.
- Meat thermometer → juicier meat, or cut to check.

**Not listed:**
- Everyday basics.
- Equipment mentioned only in commentary ("I love my air fryer") and not in a step.
- Anything the model would have to guess.

**Rules for the model:**
1. Every item cites a step whose text names it or clearly implies it. Clear implications: a temperature with bake or roast → oven; "blend until smooth" → blender; "pressure cook" → pressure cooker; "whip to stiff peaks" → mixer (optional); "grind" → mortar or spice grinder; simmer, boil, sauté or pan-fry → stovetop.
2. **If unsure, leave it out.** A missing chip is a small gap; a wrong chip costs trust.
3. When a step offers two appliances ("bake, or air fry at 200°C"), the first is the item and the second is its `alternative`.

**The extraction prompts are unchanged.** The rule "never invent … equipment" in `gemini.ts` (lines 45 and 513) keeps the extraction from adding equipment to steps. The `appliances` task only reads the final steps, so the two rules don't conflict.

**Measurement:**
- An eval set in `eval/` of about 30 real recipes with hand-labelled appliances. It covers bake, blend, grill, slow and pressure cooking, no-cook, and traps (equipment only in commentary, "or" alternatives, Hebrew sources).
- Targets before merge: **precision ≥ 95%**, **recall ≥ 85%**, **required/optional correct ≥ 90%**.
- The sanitizer also drops, in code, any item whose cited steps don't exist.

**Results** (`eval/cli.ts appliances`, 32 hand-labelled cases: 20 English, 12 Hebrew; 3 runs, tips on; 2026-10-23; full table in `eval/results/appliances.md`):

| | Precision | Recall | Required/optional | Tips that don't fit | Not analysed |
|---|---|---|---|---|---|
| All (96 answers) | 100% | 99.1% | 98.9% | 0 of 9 kept | 0 |
| English | 100% | 98.7% | 100% | 0 of 5 | 0 |
| Hebrew | 100% | 100% | 97.2% | 0 of 4 | 0 |

$0.0042 for all 96 answers; median 1.2 s per recipe including the tip check. Live runs found three problems the stubbed tests could not:
- Luna left out `required` until the schema described it.
- About 1 answer in 5 nested the list one level too deep; it is now unwrapped.
- An air fryer mentioned only as an aside was listed; a prompt rule now excludes asides.

One label was changed after the first run, with the reason recorded in the case: מסחטה usually means a manual citrus press, so a juicer is accepted but not expected.

### 8. One-time admin backfill of existing rows

- Production on 2026-10-22: 105 recipes (10 users) and 89 Hub cards. At about $0.0003 a row, backfilling all 194 costs **about $0.06**.
- A new Edge Function, `backfill-appliances`, is **admin-only**. It checks the caller with `is_current_user_admin()` and returns 403 otherwise. It then uses the service role, because it covers every user's recipes and the Hub. This differs from `backfill-thumbnails`, which runs per user under RLS.
- It processes rows `WHERE appliances IS NULL` in batches of up to 20, paging by an id cursor (`after` → `next_cursor`), so rows that can't be analysed (no steps) don't stall it. Each write is conditional (`… AND appliances IS NULL`), so it never overwrites a value a user's remix or a new extract wrote meanwhile. It is idempotent: a second pass changes nothing. A failed row stays NULL for the next pass.
- **How to run it** (admin's access token from a signed-in session):
  1. `POST /functions/v1/backfill-appliances {"dry_run": true}` → `{"pending": N}` (no model calls). Repeat with `"table": "recipe_cards"`.
  2. `POST {}` → a batch. Repeat with `{"after": "<next_cursor>"}` until `next_cursor` is null.
  3. Do the same with `{"table": "recipe_cards"}`.
  Each batch writes one `ai_usage_events` row (`action: appliances_backfill`) with its cost and counts.
- Verified on the local stack on 2026-10-25 with the real model: Hebrew and English recipes and a Hub card filled correctly, a recipe without steps stayed NULL with no model call, an already-analysed recipe was left alone, and a second pass changed nothing. Non-admin → 403, no token → 401.
- It costs users no credits. Calls are logged to `ai_usage_events` with action `appliances_backfill`.
- It is run by hand once, after the migration and functions are deployed. It is kept as a function so it can be re-run when the catalog grows.
- **Rejected:** no backfill (the feature looks broken for existing users), and lazy fill-on-open (a new endpoint, race conditions, and a section that pops in after load, for a saving of about 6 cents).

### 9. Build slices, deploy order and tests

| # | Slice | Tests |
|---|---|---|
| 1 | Catalog and types: `src/lib/appliances.ts`, the `RecipeAppliance` type, a sanitizer (drops unknown keys and items citing missing steps), with a byte-identical copy in `_shared` | Vitest unit tests, plus a parity test between the app and `_shared` copies |
| 2 | Migration `20261023180331_recipe_appliances.sql`: nullable `appliances jsonb` + check constraint on `recipes` and `recipe_cards`; the Hub publish trigger and share snapshot carry the field | pgTAP: NULL and `[]` accepted, non-array rejected, Hub copy keeps the field |
| 3 | Backend: `appliances` task kind, prompt, enum schema, wired into extract, invent, repair and transform; fail-soft; usage logging | Deno tests (invalid output → NULL, error → NULL), plus the 30-recipe eval against decision 7's targets |
| 4 | App data path: save, preview draft, Hub card mapping, remix | Vitest: the field saves and round-trips, and rows without it load unchanged |
| 5 | UI: `<ApplianceIcon>`, the "What you'll need" section, the step sheet, the card line; strings in all five locales | Component tests (`@testing-library/react-native`, `await render(...)`) in LTR (en) and RTL (he): groups, benefit and alternative labels, mirroring, `[]` state, NULL renders nothing. `locales.test.ts` checks keys. Manual check on iOS, Android and web |
| 6 | `backfill-appliances` admin function | Deno tests: non-admin → 403, only NULL rows touched, re-run is a no-op |

**Deploy order:**
1. Apply the migration in production. The column is unused, so it's safe for current builds.
2. Deploy the four functions. They return `appliances`, and current builds ignore it.
3. Merge the app PR. Web deploys automatically, and the column already exists.
4. Run the backfill once.
5. Store builds follow the normal release flow.

**PRs:** three small, stacked PRs, each reviewable in about 15 minutes:
1. ADR, catalog and migration (slices 1–2)
2. Backend, eval and backfill (slices 3 and 6)
3. App data path and UI (slices 4–5)

### Answered by Yarden (2026-10-22)

1. Pinch tips: on, with guardrails (decision 5).
2. Migrations: the repo now uses timestamped migration files (PR #24). The appliances migration is `supabase/migrations/20261023180331_recipe_appliances.sql`. 0044 was already taken by PR #4 (`0044_recipe_card_public_slug.sql`, live in production). Checked on 2026-10-23: production's `claim_recipe_card` and `bump_recipe_card_on_recipe_insert` are exactly 0037's bodies, and none of PR #4's migrations redefine them, so this migration adds the appliances lines without undoing anything.

## Consequences

- Old app builds keep working, because they never send or read the column.
- Deploy order: the migration is applied before the app change merges, otherwise saves from the web app fail with PGRST204.
