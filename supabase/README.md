# ChopChop Supabase Setup

## Running the migration

You don't need the Supabase CLI for this step. In your Supabase project dashboard:

1. Go to **SQL Editor**
2. Open `supabase/migrations/0001_init.sql` from this repo
3. Paste the full contents and click **Run**

This creates:
- `profiles` table + auto-create trigger on signup
- `recipes` table with RLS (users can only read/write their own rows)
- Indexes and check constraints matching `docs/plan/MVP-PLAN.md`

Run `0002_profile_avatar.sql` through `0006_recipe_thumbnails.sql`
after `0001_init.sql` when setting up a fresh project or catching up an existing database.

## Verifying it worked

Run in SQL Editor:

```sql
select table_name from information_schema.tables where table_schema = 'public';
-- expect: profiles, recipes

select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- expect: rowsecurity = true for both
```

## Edge Function: `extract-recipe` (Step 2b)

Takes `{ url }`, detects the platform, fetches metadata (YouTube Data API / ScrapeCreators for
Instagram & TikTok), runs the Gemini content ladder, and returns structured JSON.
Returns `{ status, platform, recipe?, message? }`.

`status` is one of `full` | `partial` | `failed` | `coming_soon` (see ADR 003/004).
The function does **not** save — the app persists the result (local guest store or
Supabase) per ADR 002.

### One-time setup

`npm install -g supabase` is **not supported** by the Supabase CLI — it's
already installed as a local dev dependency in this project (see
`package.json`). Run every command below with `npx supabase ...` instead of
`supabase ...`.

```bash
npx supabase login
npx supabase link --project-ref ccobefeofhnncpgifxel
```

`login` opens a browser to authenticate the CLI with your Supabase account.

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

### Deploy

```bash
npx supabase functions deploy extract-recipe
npx supabase functions deploy backfill-thumbnails
npx supabase functions deploy suggest-substitution
npx supabase functions deploy transform-recipe
npx supabase functions deploy translate-recipe
npx supabase functions deploy delete-account
```

Optional Apple token-revoke secrets (iOS account deletion, TN3194):

```bash
npx supabase secrets set APPLE_CLIENT_ID=com.pinch.app
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
