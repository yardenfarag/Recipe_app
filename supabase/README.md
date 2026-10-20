# Pinch Supabase Setup

`npm install -g supabase` is **not supported** by the Supabase CLI — it's
already installed as a local dev dependency in this project (see
`package.json`). Run every command below with `npx supabase ...` instead of
`supabase ...`.

## One-time CLI setup

```bash
npx supabase login
npx supabase link --project-ref ccobefeofhnncpgifxel
```

`login` opens a browser to authenticate the CLI with your Supabase account.

## Run migrations (remote)

Pushes every pending file in `supabase/migrations/` to the linked project:

```bash
npx supabase db push
```

Preview without applying:

```bash
npx supabase db push --dry-run
```

### Manual alternative (SQL Editor)

You can also paste a single migration into the dashboard:

1. Go to **SQL Editor**
2. Open the migration file (e.g. `supabase/migrations/0016_monthly_free_quotas.sql`)
3. Paste the full contents and click **Run**

Fresh project: run `0001_init.sql` through the latest migration in order
(`0002` … `0016`, etc.).

## Redeploy Edge Functions

Deploy all app functions:

```bash
npx supabase functions deploy extract-recipe
npx supabase functions deploy invent-recipe
npx supabase functions deploy repair-recipe
npx supabase functions deploy match-fridge
npx supabase functions deploy backfill-thumbnails
npx supabase functions deploy suggest-substitution
npx supabase functions deploy transform-recipe
npx supabase functions deploy translate-recipe
npx supabase functions deploy delete-account
npx supabase functions deploy recipe-share
npx supabase functions deploy revenuecat-webhook
```

### Recipe share links (`recipe-share` + migration `0017`)

Outbound share creates an opaque token + recipe snapshot (so recipients don’t need access to the owner’s private row). Recipients open `…/share.html?t=TOKEN` → app deep link `pinch://s/TOKEN` → claim copies the snapshot into their library.

```bash
npx supabase db push
npx supabase functions deploy recipe-share
```

After the app is on the stores, set App Store / Play URLs in `legal/share.html` (`APP_STORE_URL` / `PLAY_STORE_URL`).

For the Free / Plus quota + remix-gating change, you only need:

```bash
npx supabase db push
npx supabase functions deploy extract-recipe
npx supabase functions deploy transform-recipe
npx supabase functions deploy revenuecat-webhook
```

### Recipe credits rollout (`0018`)

The production rollout commands are:

```bash
npx supabase db push
npx supabase functions deploy extract-recipe
npx supabase functions deploy transform-recipe
npx supabase functions deploy revenuecat-webhook
```

Migration `0018` defines credit reservations. Migration `0021` adds compensation
tracking and, when `pg_cron` is available, schedules
`select public.refund_stale_extraction_reservations();` every 10 minutes.
Local and restricted environments skip that schedule. After `npx supabase db push`,
verify in the production dashboard that the `pinch-refund-stale-extractions` job
exists (or create the equivalent schedule) and that a stale test reservation is
refunded. Repository deploy commands do not by themselves prove the scheduler is
active.

## Verifying schema

Run in SQL Editor:

```sql
select table_name from information_schema.tables where table_schema = 'public';
-- expect: profiles, recipes, extract_usage_monthly, …

select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- expect: rowsecurity = true for user tables
```

## Edge Function: `extract-recipe` (Step 2b)

Takes `{ url }`, detects the platform, fetches metadata (YouTube Data API / ScrapeCreators for
Instagram & TikTok), runs the content ladder (text first, then video) through OpenRouter, and returns structured JSON.
Returns `{ status, platform, recipe?, message? }`.

`status` is one of `full` | `partial` | `failed` | `coming_soon` (see ADR 003/004).
The function does **not** save — the app persists the result (local guest store or
Supabase) per ADR 002.

### Secrets

```bash
# Required — every model call (text, vision, video, Jev) goes through OpenRouter.
# OPEN_ROUTER_API_KEY is accepted as an alias.
npx supabase secrets set OPENROUTER_API_KEY=sk-or-v1-your_key

# Required for Instagram + TikTok extraction (ScrapeCreators)
npx supabase secrets set SCRAPECREATORS_API_KEY=your_scrapecreators_api_key

# Optional — enriches YouTube extraction with description + top 10 comments (ADR 004).
npx supabase secrets set YOUTUBE_API_KEY=your_youtube_data_api_key

# Optional — per-task model overrides. <KIND> is the upper-cased task kind:
# TEXT, VIDEO, PHOTO, REPAIR, INVENT_TEXT, INVENT_PHOTO, INVENT_VIDEO, TRANSLATE,
# TRANSFORM, SUBSTITUTION, FRIDGE_MATCH, CONTENT_GATE, REMIX_RELATED.
# Defaults are TASK_MODELS in functions/_shared/llmClient.ts (ADR 015).
# npx supabase secrets set OPENROUTER_MODEL_TEXT=openai/gpt-6-luna
# npx supabase secrets set OPENROUTER_FALLBACKS_TEXT=qwen/qwen3.8-flash   # comma list, or "none"
# npx supabase secrets set OPENROUTER_REASONING_TEXT=none                 # none | low | medium
# npx supabase secrets set JEV_MODEL=typesafe/jev-1.13   # extract gate + remix relatedness
```

`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FAST_MODEL`, `OPENROUTER_MODEL`, `OPENROUTER_FAST_MODEL`,
`OPENROUTER_FALLBACKS` and `OPENROUTER_FAST_FALLBACKS` are no longer read. Unset them after the
PIN-45 deploy: `npx supabase secrets unset GEMINI_API_KEY GEMINI_MODEL GEMINI_FAST_MODEL OPENROUTER_MODEL OPENROUTER_FAST_MODEL OPENROUTER_FALLBACKS OPENROUTER_FAST_FALLBACKS`.

### Per-task models (PIN-45)

Every function that calls a model shares `functions/_shared/llmClient.ts`. Deploy all of them together
when the router changes:

```bash
for f in extract-recipe invent-recipe repair-recipe match-fridge suggest-substitution transform-recipe translate-recipe; do
  npx supabase functions deploy $f
done
```

Check the default slugs still exist on OpenRouter before deploying (a retired slug fails the whole request):

```bash
npx deno test -A --no-lock --env-file=.env supabase/functions/_shared/llmClient_test.ts
```

Optional Apple token-revoke secrets (iOS account deletion, TN3194):

```bash
npx supabase secrets set APPLE_CLIENT_ID=com.pinch.myapp
npx supabase secrets set APPLE_TEAM_ID=your_team_id
npx supabase secrets set APPLE_KEY_ID=your_key_id
npx supabase secrets set APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
```


### Test it

```bash
curl -X POST \
  'https://ccobefeofhnncpgifxel.supabase.co/functions/v1/extract-recipe' \
  -H "Authorization: Bearer YOUR_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=SOME_RECIPE_VIDEO"}'
```

Expected: JSON with `status: "full"` and a `recipe` object. Try Instagram Reel or
TikTok URLs once `SCRAPECREATORS_API_KEY` is set in Supabase secrets.

## What's next (later Phase 2 steps)

- **Step 2c:** Wire the AddRecipe screen → `extract-recipe` → RecipeDetail
- **Step 2e:** Enable Apple + Google providers in **Authentication → Providers** in the dashboard

## Schema notes

- `extraction_status` and `missing_fields` support the partial-result UX from ADR 004
- `platform` supports the staged rollout from ADR 003 (`youtube` | `instagram` | `tiktok` | `unknown`)
- `migrated_from_guest` flags recipes that started as local guest saves (ADR 002)
- `cost_estimate` stays a plain `$`/`$$`/`$$$` tier — locale display mapping happens client-side (ADR 008), not in the DB
