# ADR 024: Backend conventions and target layout

**Status:** Accepted
**Date:** 2026-11-18
**Deciders:** Yarden (PIN-31, under PIN-29)

## Context

The backend has grown to 20 Edge Functions, 66 migrations and about 75 files in a flat `supabase/functions/_shared/`, and a second developer is joining. Every function repeats the same steps by hand: CORS and OPTIONS handling, the method check, sign-in, the body size limit, JSON parsing, validation, reserving and refunding the daily AI quota, and a `logUsageEvent` call on every exit path. In `translate-recipe` that is about 60% of the 266 lines. Error responses come in two shapes, sometimes both in one function. Nothing reports errors anywhere except the Supabase logs.

This ADR sets out how backend code is laid out and written from now on, so both developers (and agents) write functions the same way. Existing code converts over time (PIN-34); the folder move happens once (PIN-113).

## Decision

### 1. Platform

**Supabase stays**: Postgres, Auth, Storage and Edge Functions. Nothing is straining it.

**There is no staging environment** (cost). Production is the only remote project. Merging to `master` deploys (`.github/workflows/deploy-backend.yml`). How to test before merging is described in `supabase/README.md` → "Testing backend changes". That section is the single source for the deploy and testing flow; this ADR doesn't repeat it.

### 2. Layout of `supabase/functions/_shared/`

There is one `core/` folder for what every function uses. Everything else is grouped by feature, so all the code for one feature sits in one place.

```
supabase/functions/
  <fn>/index.ts      thin handler: config + one call into _shared
  _shared/
    core/            handler wrapper, cors, errors, auth, metering, usage log, db clients, safe fetch
    llm/             the one door to model calls, and their pricing
    extraction/      import from a link: content ladder, platform detection, video, thumbnails
      sources/       one module per source platform
    recipes/         everything done to a saved recipe: edits, limits, variants, translation, substitution…
      enrich/        background tasks that add data to recipes (appliances, diets) and their backfills
    billing/         credit purchases (Polar, Paddle, RevenueCat)
    account/         account-level jobs (Apple revoke on deletion)
    email/           unchanged
    testing/         shared test stubs
```

**Rules**

- A module goes in the feature it serves. When two features use it, it goes where it's defined: `extraction/classifyRecipe.ts` is used by `save-recipe-edit` too, and stays in `extraction/`.
- `core/` holds only what has no feature knowledge. If a file mentions a recipe, a platform or a product, it doesn't belong in `core/`.
- Imports between features are fine (`recipes/` uses `llm/`). Two things are not: `core/` imports nothing outside `core/`, and nothing imports a function's `index.ts`.
- A test sits next to its module as `<module>_test.ts`.
- Create a new feature folder when a new area has three or more modules. Until then, put the module in the closest existing folder.

**Where every current file goes** (PIN-113 moves them; file names stay the same)

| Folder | Files |
|---|---|
| `core/` | `cors`, `errors`, `supabaseAdmin`, `recipeLookup`¹, `safeFetch`, `sealedPayload`, `quotas`, `dailyAiUsage`, `remixUsage`, `usageLog` |
| `llm/` | `llmClient`, `llmJson`, `jev`, `pricing` |
| `extraction/` | `gemini`, `contentGate`, `classifyRecipe`, `platform`, `platformMeta`, `videoInput`, `videoLimits`, `webRecipe`, `persistThumbnail` |
| `extraction/sources/` | `instagram`, `tiktok`, `tiktokThumbnail`, `facebook`, `youtube`, `scrapecreators` |
| `recipes/` | `recipeEditPlan`, `recipeEditTypes`, `recipeEstimates`, `recipeRecalc`, `recipeLimits`, `recipeVariant`, `recipeCards`, `translateRecipe`, `translationIntegrity`, `substitution`, `fridgeMatch`, `inventRecipe`, `ingredientAmounts`, `culinaryUnits`, `calories`, `tags` |
| `recipes/enrich/` | `appliances`, `recipeAppliances`, `appliancesBackfill`, `recipeDiets`, `dietsBackfill` |
| `billing/` | `polarPurchase`, `paddlePurchase`, `revenuecatPurchase` |
| `account/` | `appleRevoke` |
| `email/`, `testing/` | unchanged |
| delete | `tokens.ts` (legacy, no importers) |

Each `_test.ts` moves with the module it tests.

¹ `recipeLookup` mixes the signed-in client (`createAuthedSupabase`, which belongs in core) with recipe and platform lookups. It moves to `core/` whole, and PIN-34 splits it. `quotas` and `remixUsage` know about extract and remix, but they are metering every billable function goes through, so they sit with `dailyAiUsage` in `core/`.

### 3. How to write a function

Every function is a thin `index.ts`: a config object and a handler, built with the wrapper in `core/handler.ts` (PIN-34 builds it). The wrapper does the repeated work, in this order:

1. CORS preflight and the method check
2. body size limit and JSON parsing
3. auth: `user` (sign-in required), `optional`, `admin` (`is_current_user_admin()`), `webhook` (the function checks the signature itself) or `none`
4. input validation with a zod schema (`npm:zod`, pinned)
5. calls the handler with `{ input, user, admin, requestId, log }`
6. maps errors to responses and logs one line per request

```ts
// translate-recipe/index.ts (target shape)
import { handler, HttpError } from '../_shared/core/handler.ts';
import { withDailyAiUsage } from '../_shared/core/dailyAiUsage.ts';
import { translateRecipe, TranslateInput } from '../_shared/recipes/translateRecipe.ts';

// handler() calls Deno.serve itself.
handler(
  { name: 'translate-recipe', auth: 'user', maxBodyBytes: 64_000, input: TranslateInput },
  async ({ input, user, admin, log }) => {
    const result = await withDailyAiUsage(admin, user.id, 'translation', 10, () => translateRecipe(input));
    if (!result.title) throw new HttpError(502, 'translation_empty', "Couldn't translate this recipe. Try again.");
    log.usage({ action: 'translate', usages: result.usages });
    return { status: 'ok', target_language: input.target_language, recipe: result.recipe };
  },
);
```

**Quotas and credits.** `withDailyAiUsage` and the credit helpers in `quotas` reserve before the work and refund automatically if it throws. Write no refund code in handlers.

**Errors.** Throw `HttpError(status, code, message)` for expected failures. Anything else is unexpected: the wrapper returns 500, logs it and reports it to Sentry. `code` is a stable snake_case string the app can switch on. `message` is what the user may see.

**Response shapes are a contract.** App builds stay in users' hands for weeks, so a response shape never changes in place:

- New functions answer `{ status: 'ok', ... }` or `{ status: 'failed', code, message }`.
- A function converted to the wrapper keeps its current shapes exactly, including the old `{ error }` bodies. The wrapper has a `legacyErrorShape` option for this.
- To change a shape, ship app support for both shapes first, and drop the old one only once no supported build depends on it.

### 4. Where data is accessed from

This writes down what the app already does:

- **Direct from the app, under row level security**: the user's own rows in simple CRUD tables (`recipes`, `collections`, `collection_recipes`, `shopping_list_items`, `profiles`, `recipe_translations`…). Every such table has RLS on, policies scoped to `auth.uid()`, and pgTAP tests.
- **Through an Edge Function**: anything that calls a model or a third-party API, uses a secret, costs money, or spends or grants credits.
- **Through a `security definer` RPC**: anything across users or privileged that needs no secret (admin screens, the Hub, in-app messages). Revoke every grant on the table and grant `execute` on the function. `revoke … from public` doesn't remove Supabase's own `anon` / `authenticated` grants, so revoke those by name and check with `has_function_privilege` in the pgTAP test.

The admin client (`createServiceSupabase`, which bypasses RLS) is used only inside Edge Functions, and only after the wrapper has checked auth.

### 5. Logging and error tracking

- `core/observe.ts`'s `serve('<name>', handler)` (PIN-37), which every function uses in place of `Deno.serve` and which the handler wrapper will build on, writes one JSON log line per request: `fn`, `request_id`, `user_id`, `status`, `code`, `duration_ms`. Feature code logs through `log`, not bare `console.log`, so every line carries the `request_id`.
- **Sentry, free tier** (`npm:@sentry/deno`), initialised in `core/`, with the DSN in the `SENTRY_DSN` secret. Only unexpected errors are reported, tagged with the function, request id and user id. No request bodies or recipe content. PIN-37 sets it up.
- `ai_usage_events` (`usageLog`) stays the record of AI cost per call. It's analytics, not error tracking.

### 6. Dependencies and tests

- Add new Deno dependencies as pinned `npm:` specifiers. Existing `https://esm.sh/` imports stay until their file is touched anyway.
- Modules in `core/`, `llm/`, `extraction/` and `recipes/` keep their logic out of `index.ts` so it can be unit tested with Deno. A handler needs no test of its own beyond what its modules have.
- A change to RLS, an RPC or a grant comes with a pgTAP test in `supabase/tests/`. CI runs both suites on every PR (`backend-tests.yml`).

## Considered options

- **Layers** (`http/`, `middleware/`, `domain/`, `integrations/`, `db/`), as first proposed in PIN-29. Rejected: one feature (extraction) would be spread over three or four folders, which costs more to navigate than it gives in separation at this size.
- **Keep `_shared` flat** and only add the wrapper. Rejected: the folder grows by a few files a week, and moving it later, with two people's branches open, costs merge conflicts every time.
- **A shared contracts package** (zod schemas used by both the app and the functions, PIN-33). Deferred. Deno can't import the app's `@/` paths, and the one hand-copied contract (`recipeEditTypes`) is manageable. Revisit when a third client or the second developer needs it.
- **Error tracking through Supabase logs only.** Rejected: no grouping and no alerts. Sentry's free tier costs nothing at this volume.

## Consequences

- PIN-113 (B4a) moves the files in one PR, before the second developer's first branch.
- PIN-34 (B4) builds `core/handler.ts` and converts functions as they're touched, starting with the largest: `extract-recipe`, `invent-recipe`, `repair-recipe`.
- PIN-37 (B7) adds Sentry and the per-request log line.
- New functions use the wrapper from the day it exists.
