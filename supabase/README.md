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

## Deploying to production

**Merging to `master` deploys the backend.** The `Deploy backend` workflow
(`.github/workflows/deploy-backend.yml`) runs on every merge that touches
`supabase/`:

1. Backend tests (pgTAP + Deno).
2. Migration history check: it stops the deploy if production has a migration
   the repo doesn't, or if a new migration is older than the latest applied one
   (`db push` would run it out of order).
3. `supabase db push` for the new migrations.
4. Deploy of every function from `master`, so production always matches the repo.
5. Smoke check: every function must boot.

Nobody runs `db push`, `functions deploy` or migration SQL against production
from a laptop. The one exception is GitHub Actions being down during an
incident: deploy by hand, tell the other developer, and merge the same change
right after. The workflow also has a manual "Run workflow" button that
redeploys `master`.

Setup: the workflow needs one repo secret, `SUPABASE_ACCESS_TOKEN` (a personal
access token from Supabase → Account → Access Tokens). It needs no database
password.

The feature rollout notes further down list the `db push` / `functions deploy`
commands from before CI. Today, merging runs them. The manual checks in those
notes (pg_cron jobs, SQL verification queries) still apply after the deploy.

## Testing backend changes

There is **no staging environment** (decided 2026-11-18, cost). Production is
the only remote project, so test a change in one of these ways before merging:

### 1. Locally (the default)

Needs Docker Desktop running.

```bash
npx supabase start                                          # local Postgres, Auth, Storage on :54321
npx supabase db reset                                       # replays every migration from zero
npx supabase test db                                        # pgTAP tests
npx supabase functions serve --env-file supabase/.env.local # functions with hot reload
```

`supabase/.env.local` (git-ignored) holds the function secrets: real
`OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `SCRAPECREATORS_API_KEY` and so on (ask
for keys with a spending cap). AI calls and scraping are real; the database is
local.

To point the app at it, set these in `.env` and restart Metro:
`EXPO_PUBLIC_SUPABASE_URL=http://<your LAN IP>:54321` (a phone can't reach
`localhost`) and `EXPO_PUBLIC_SUPABASE_KEY` = the anon key from
`npx supabase status`. Switch back to the production values when done.

### 2. Preview function (real production data)

Use it when a function change only shows up with real data, for example a
specific user's recipes or a production-only integration:

```bash
gh workflow run deploy-function-preview.yml --ref <your-branch> -f function=extract-recipe
```

This deploys your branch's copy as `extract-recipe-preview` next to the real
one. Users never call it. To use it from a **dev build**, add
`EXPO_PUBLIC_FUNCTION_PREVIEWS=extract-recipe` (comma-separated for several) to
`.env` and restart Metro. `src/lib/supabase/functionPreview.ts` reroutes those
calls; production builds ignore the variable.

- It runs against the production database with production secrets. Sign in
  with a test account; credits and usage are real.
- Functions only. Test migrations locally (below).
- Delete it when done:
  `gh workflow run deploy-function-preview.yml -f function=extract-recipe -f action=delete`

### 3. Migrations

- Test locally: `supabase db reset` + `supabase test db` must pass.
- Regenerate the database types: `npm run db:types` (with local Supabase
  started) rewrites `supabase/functions/_shared/core/database.types.ts`, which
  both the app and the functions use. Commit it with the migration; CI fails
  when it doesn't match the migrations. At the boundary between those types and
  the app's own (`Recipe`, JSON columns, RPC arguments that are SQL null), use
  the helpers in `src/lib/supabase/dbTypes.ts` and `_shared/core/supabaseAdmin.ts`.
- Name new files with a `YYYYMMDDHHMMSS_` prefix newer than every existing
  migration, or the deploy check stops them.
- **Expand, then contract.** Functions deploy right after migrations, and app
  builds in users' hands stay old for weeks. Add the new column, table or
  function first and ship code that uses it. Drop or rename the old one in a
  later migration, once nothing calls it.

### 4. Webhooks (Polar, RevenueCat, Paddle)

Use the provider's sandbox and send its webhooks to your local function
through a tunnel:

```bash
cloudflared tunnel --url http://localhost:54321
# webhook URL in the sandbox dashboard: https://<tunnel>.trycloudflare.com/functions/v1/polar-webhook
```

Put the sandbox webhook secret in `supabase/.env.local`.

## Errors and logs

Every function starts with `serve('<name>', handler)` from
`_shared/core/observe.ts` instead of `Deno.serve`. A new function does the same.

- **Request id.** Each request gets one, returned in the `x-request-id`
  response header (or taken from that request header when the caller sends
  one). Ask a user or the app for it when tracing a failure.
- **One JSON log line per request** (Supabase → Edge Functions → Logs):
  `fn`, `request_id`, `user_id`, `status`, `code`, `duration_ms`. Search the logs
  by request id.
- **Sentry** (org `pinch-mv`, free tier) gets crashes the function didn't
  catch, every 5xx response, and every `console.error(..., err)` that includes
  an `Error`, each tagged with function, request id, user id and environment
  (`production`, or `preview` for `-preview` copies). It sends no request bodies,
  headers or recipe content, and no tracing. The `SENTRY_DSN` function secret
  turns it on.
- **Checking the pipeline:** deploy a preview (see above) and call it with the
  header `x-observe-test: error`. Only `-preview` copies throw on it. A
  "Observability test error" should appear in Sentry within a minute.

### Recipe share links (`recipe-share` + migration `0017`)

Outbound share creates an opaque token + recipe snapshot (so recipients don’t need access to the owner’s private row). Recipients open `…/share.html?t=TOKEN` → app deep link `pinch://s/TOKEN` → claim copies the snapshot into their library.

```bash
npx supabase db push
npx supabase functions deploy recipe-share
```

The App Store and Google Play URLs are set in `legal/share.html` (`APP_STORE_URL` / `PLAY_STORE_URL`) and `workers/share-page/src/render.ts`.

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

### In-app messages (PIN-106, migration `20261116120000`)

Admins send popups, announcements and update prompts from Settings → Admin → Messages (ADR 023). It needs one migration and no Edge Function and no secret:

```bash
npx supabase db push
```

The migration creates `in_app_messages` and `in_app_message_receipts` (row level security on, every grant revoked), the functions `get_in_app_messages`, `record_in_app_message_event` and `admin_list_in_app_messages` / `admin_save_in_app_message` / `admin_set_in_app_message_status` / `admin_delete_in_app_message`, and a storage policy that lets only admins write under `in-app-messages/` in the existing `recipe-thumbnails` bucket (no new bucket). Or paste the file into the SQL Editor and run it.

Deploy it by hand before releasing a build that has the feature: an app without the migration simply never gets a message (a failed fetch is silent). After the push, check in the SQL Editor:

```sql
select proname from pg_proc where proname like '%in_app_message%';
-- expect the six functions above (plus some small validation helpers, `in_app_message_*_valid` and `in_app_message_targets`)
select tablename, rowsecurity from pg_tables where tablename like 'in_app_message%';
-- expect rowsecurity = true for both
```

Then sign in as an admin, open Settings → Admin → Messages and use "Send to me only" to see a message on your own account before sending it to anyone. Message images upload to `recipe-thumbnails/in-app-messages/`; deleting a message leaves its image in storage.

Local test: `npx supabase test db supabase/tests/in_app_messages.sql` runs the pgTAP file (60 assertions).

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
Instagram, TikTok & Facebook), runs the content ladder (text first, then video) through OpenRouter, and returns structured JSON.
Returns `{ status, platform, recipe?, message? }`.

`status` is one of `full` | `partial` | `failed` | `coming_soon` (see ADR 003/004).
The function does **not** save — the app persists the result (local guest store or
Supabase) per ADR 002.

### Secrets

```bash
# Required — every model call (text, vision, video, Jev) goes through OpenRouter.
# OPEN_ROUTER_API_KEY is accepted as an alias.
npx supabase secrets set OPENROUTER_API_KEY=sk-or-v1-your_key

# Required for Instagram, TikTok and Facebook extraction (ScrapeCreators)
npx supabase secrets set SCRAPECREATORS_API_KEY=your_scrapecreators_api_key

# Optional — enriches YouTube extraction with description + top 10 comments (ADR 004).
npx supabase secrets set YOUTUBE_API_KEY=your_youtube_data_api_key

# Optional — per-task model overrides. <KIND> is the upper-cased task kind:
# TEXT, VIDEO, PHOTO, REPAIR, INVENT_TEXT, INVENT_PHOTO, INVENT_VIDEO, TRANSLATE,
# TRANSFORM, SUBSTITUTION, FRIDGE_MATCH, CONTENT_GATE, REMIX_RELATED.
# Defaults are TASK_MODELS in functions/_shared/llm/llmClient.ts (ADR 015).
# npx supabase secrets set OPENROUTER_MODEL_TEXT=openai/gpt-6-luna
# npx supabase secrets set OPENROUTER_FALLBACKS_TEXT=qwen/qwen3.8-flash   # comma list, or "none"
# npx supabase secrets set OPENROUTER_REASONING_TEXT=none                 # none | low | medium
# npx supabase secrets set JEV_MODEL=openai/gpt-6-luna-decisions   # extract gate + remix relatedness
```

`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FAST_MODEL`, `OPENROUTER_MODEL`, `OPENROUTER_FAST_MODEL`,
`OPENROUTER_FALLBACKS` and `OPENROUTER_FAST_FALLBACKS` are no longer read. Unset them after the
PIN-45 deploy: `npx supabase secrets unset GEMINI_API_KEY GEMINI_MODEL GEMINI_FAST_MODEL OPENROUTER_MODEL OPENROUTER_FAST_MODEL OPENROUTER_FALLBACKS OPENROUTER_FAST_FALLBACKS`.

### Per-task models (PIN-45)

Every function that calls a model shares `functions/_shared/llm/llmClient.ts`. Deploy all of them together
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
