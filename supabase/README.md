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
Instagram & TikTok), runs the Gemini content ladder, and returns structured JSON.
Returns `{ status, platform, recipe?, message? }`.

`status` is one of `full` | `partial` | `failed` | `coming_soon` (see ADR 003/004).
The function does **not** save — the app persists the result (local guest store or
Supabase) per ADR 002.

### Secrets

```bash
# Required — Gemini API key (server-side only, never shipped to the app)
npx supabase secrets set GEMINI_API_KEY=your_gemini_key

# Optional — enriches extraction with description + top 10 comments (ADR 004).
# Without it, extraction still works from the video alone.
npx supabase secrets set YOUTUBE_API_KEY=your_youtube_data_api_key

# Optional — override models (defaults shown)
# Text / translate / remix / swap → Flash-Lite (fast + cheap)
npx supabase secrets set GEMINI_FAST_MODEL=gemini-3.1-flash-lite
# Video extract → 3.5 Flash (stronger multimodal)
npx supabase secrets set GEMINI_MODEL=gemini-3.5-flash

# Required for Instagram + TikTok extraction (ScrapeCreators)
npx supabase secrets set SCRAPECREATORS_API_KEY=your_scrapecreators_api_key
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
