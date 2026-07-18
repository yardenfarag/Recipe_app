# Pinch — Workflows & Product Guide

**Last updated:** 2026-07-17  
**Audience:** Anyone joining the project, or revisiting after time away.

This document explains **every major workflow** in Pinch: what happens, which pieces of code own it, and **why it exists**. For product vocabulary, see [`GLOSSARY.md`](./GLOSSARY.md). For decision history, see [`adr/`](./adr/).

> **Name note:** Early docs and the Supabase project still say “ChopChop.” The shipping product UI is **Pinch**. Same app.

---

## 1. What Pinch is

Pinch turns a social cooking video into a clean, usable recipe.

1. User pastes (or shares) a YouTube / Instagram / TikTok link  
2. A Supabase Edge Function fetches platform content and asks Gemini to extract a structured recipe  
3. User previews, optionally remixes (scale servings, swap ingredients, dietary variants), then saves  
4. Saved recipes live in a personal library — locally for guests, in Supabase when signed in  

**Vision (one line):** Snap a recipe from social media → get a clean, structured, scalable recipe with smart substitutions.

---

## 2. Tech stack (why these tools)

| Layer | Tool | Why |
|-------|------|-----|
| Mobile app | **Expo SDK 54** + Expo Router | Cross-platform iOS/Android; file-based screens; Expo Go for fast iteration |
| UI | **React Native** + **NativeWind v4** | Familiar React patterns; Tailwind-style styling |
| Backend / DB | **Supabase** (Postgres + Auth + Storage + Edge Functions) | Auth, RLS-protected recipes, serverless AI pipeline without a custom server |
| AI | **Google Gemini** (Flash-class model) | Structured JSON recipe extraction, substitutions, dietary remixes |
| Platform metadata | **YouTube Data API** (optional) + **ScrapeCreators** (IG/TikTok) | Gemini cannot reliably scrape social URLs alone; keys must stay server-side |
| Local guest data | **AsyncStorage** | Try the product before signing up (ADR 002) |
| Share-into-app | **expo-share-intent** (dev build) | “Share → Pinch” from other apps (ADR 010); disabled in Expo Go |

```
┌──────────────────────────┐     URL / share      ┌─────────────────────────────┐
│  Pinch (Expo)            │ ──────────────────►  │  Supabase Edge Functions    │
│  Library · Snap · Favs   │                      │  extract-recipe             │
│  Settings · Recipe views │ ◄──────────────────  │  suggest-substitution       │
│                          │   recipe JSON        │  transform-recipe           │
│                          │                      │  backfill-thumbnails        │
│                          │     CRUD / auth      ├─────────────────────────────┤
│                          │ ◄──────────────────► │  Postgres + Auth + Storage  │
└──────────────────────────┘                      └─────────────────────────────┘
```

**Why extraction is server-side (ADR 001):**

1. Social platforms need dedicated fetchers — Gemini URL context is not enough  
2. API keys (Gemini, YouTube, ScrapeCreators) must never ship in the app  
3. Client-side scraping hits CORS / ToS walls  

---

## 3. App map (screens & routes)

| Route | Screen | Job |
|-------|--------|-----|
| `/(tabs)/` (`index`) | **Library** | Personal recipe list: search, sort, favorite, delete |
| `/(tabs)/favorites` | **Favorites** | Hearted recipes only |
| `/(tabs)/add` | **Snap** | Paste URL → “Fork it!” → extraction |
| `/(tabs)/settings` | **Settings** | Account, avatar, theme, migration retry |
| `/recipe/preview` | **Preview** | Unsaved extraction result + Save |
| `/recipe/[id]` | **Recipe detail** | Saved recipe (guest id `guest-…` or Supabase uuid) |
| `/auth` | **Welcome** (modal) | Email / Apple / Google sign-in & sign-up |

Root wiring (`src/app/_layout.tsx`): theme → error boundary → auth → share-intent router → stack navigator.

Tabs: `src/components/app-tabs.tsx` (Library, Favorites, Snap, Settings).

---

## 4. Core workflows

### 4.1 Snap a recipe (paste URL)

**User story:** “I saw a cooking video. I want the ingredients and steps without scrubbing the video.”

**Flow:**

1. Open **Snap** (`src/app/(tabs)/add.tsx`)  
2. Paste a YouTube, Instagram, or TikTok URL  
3. Tap **Fork it!**  
4. App calls `extractRecipe()` → Edge Function `extract-recipe`  
5. Outcomes:
   - **Cached hit** (signed-in, same URL already saved) → open existing recipe  
   - **Guest duplicate** (local match) → open existing guest recipe  
   - **`coming_soon` / `failed`** → banner message, no save  
   - **`full` / `partial`** → stash draft (`recipeDraft`) → navigate to **Preview**  

**Why:** This is the product’s primary loop. Paste-URL works in Expo Go; Share Sheet is additive (below).

**Key files:** `add.tsx`, `src/lib/supabase/extractRecipe.ts`, `supabase/functions/extract-recipe/`

---

### 4.2 Share Sheet → Snap (dev build)

**User story:** “I’m in TikTok/YouTube — Share → Pinch — done.”

**Flow:**

1. OS share targets Pinch (`expo-share-intent`)  
2. `ShareIntentRouter` sends the user to `/add` if they aren’t already there  
3. Snap screen reads the shared URL and auto-runs **Fork it!**  

**Why:** Removes copy-paste friction. Native share requires a **development/production build**, not Expo Go (ADR 009 / 010). Provider is disabled in Expo Go to avoid noise.

**Key files:** `_layout.tsx`, `useShareIntentRouter.tsx`, `add.tsx`

---

### 4.3 Extraction pipeline (Edge Function)

**User story:** “Turn messy social content into a real recipe.”

**Flow (`extract-recipe`):**

1. Parse `{ url }`  
2. **Detect platform** (`youtube` | `instagram` | `tiktok` | `unknown`)  
3. If platform not in `LIVE_PLATFORMS` → `coming_soon` (ADR 003)  
4. If signed in → **dedupe** against user’s library (canonical URL / video id) → return `cached: true`  
5. **Fetch platform meta:**
   - YouTube: Data API (description, comments) + thumbnail helpers  
   - Instagram / TikTok: ScrapeCreators  
6. Run **content ladder** with Gemini (ADR 004): description → comments → captions → video context  
7. **Classify:** `full` | `partial` | `failed`  
8. Return structured recipe JSON (**does not save** — client owns persistence)

**Why:** Recipes on social live in captions, comments (“recipe?”), and spoken audio. A single source misses most of them. Partial results still give value (e.g. ingredients without perfect steps). Saving stays on the client so guests can use AsyncStorage and signed-in users can preview before commit.

**Key files:** `supabase/functions/extract-recipe/index.ts`, `_shared/gemini.ts`, `_shared/platform.ts`, `_shared/youtube.ts`, `_shared/instagram.ts`, `_shared/tiktok.ts`, `_shared/scrapecreators.ts`, `_shared/recipeLookup.ts`

---

### 4.4 Preview → Save

**User story:** “Show me what you found before I keep it.”

**Flow:**

1. Preview reads in-memory draft (`src/lib/recipeDraft.ts`)  
2. `RecipeView` lets the user scale servings, swap ingredients, or apply dietary variants **before** save  
3. **Save recipe:**
   - **Guest:** `saveGuestRecipe` (max 3 — ADR 002); quota exceeded → sign-up prompt  
   - **Signed in:** `saveRecipe` → Supabase `recipes` table  

**Why:** Extraction is imperfect; preview builds trust. Guest quota proves value before auth friction. Remix-before-save means the saved copy matches what they want to cook.

**Key files:** `recipe/preview.tsx`, `guestRecipes.ts`, `supabase/recipes.ts`, `RecipeView.tsx`

---

### 4.5 Guest mode & migration

**User story:** “Let me try Pinch without an account — then keep my recipes when I sign up.”

**Flow:**

| Step | Behavior |
|------|----------|
| Browse / Snap | Works without auth |
| Save | Up to **3** recipes in AsyncStorage (`pinch:guest-recipes`) |
| 4th save | Alert → Sign up |
| Sign in / Sign up | `AuthProvider` runs `migrateGuestRecipesToSupabase` |
| Success | Rows inserted with `migrated_from_guest: true`; local store cleared |
| Failure | Local recipes kept; Settings shows retry |

**Why:** Low-friction onboarding + a natural conversion moment. Cloud recipes always have `user_id`, so RLS stays simple (ADR 002).

**Key files:** `guestRecipes.ts`, `migrateGuestRecipes.ts`, `useAuth.tsx`, Settings migration banner

---

### 4.6 Auth

**User story:** “Sync my library across devices / unlock unlimited saves.”

**Providers (ADR 007):**

- Email + password  
- Apple Sign In (when available)  
- Google OAuth  

Session lives in AsyncStorage via the Supabase client. Profile row is created by a DB trigger on signup (`0001_init.sql`).

**Why:** Email is enough for Expo Go testing; Apple/Google match mobile expectations. Auth gates cloud sync and unlimited saves — not the first Snap.

**Key files:** `auth.tsx`, `lib/supabase/auth.ts`, `useAuth.tsx`

---

### 4.7 Recipe Library

**User story:** “Show me everything I’ve snapped, find one fast, remove junk.”

**Flow:**

1. `useRecipes` loads guest list **or** Supabase list based on auth  
2. Optional **thumbnail backfill** for older YouTube `hqdefault`/`sddefault` images  
3. `RecipeLibraryToolbar`: search + sort (`newest`, etc.) via `recipeListQuery`  
4. Tap row → detail; ♥ → favorite; long-press → delete  

**Why:** List rows (not a grid) prioritize title/meta for cooking decisions (ADR 006). Search/sort matter once the library grows. Focus-refresh keeps the list current after save/sign-in.

**Key files:** `(tabs)/index.tsx`, `useRecipes.ts`, `RecipeLibraryToolbar.tsx`, `RecipeListRow.tsx`, `recipeListQuery.ts`

---

### 4.8 Favorites

**User story:** “Pin the recipes I actually cook.”

**Flow:** Heart on a row or detail → `toggleRecipeFavorite` (guest: AsyncStorage field; signed-in: DB column from `0004_recipe_favorites.sql`). Favorites tab filters with `getFavoriteRecipes`.

**Why:** Library will fill with experiments; Favorites is the short list for weeknight cooking.

**Key files:** `(tabs)/favorites.tsx`, `recipeFavorites.ts`

---

### 4.9 Recipe detail & cooking helpers

**User story:** “I’m cooking — adjust portions, swap what I don’t have, remix for my diet.”

Shared UI: `RecipeView` (preview + detail).

| Feature | How | Why |
|---------|-----|-----|
| **Serving scale** | Client math on quantities | Instant, free, no AI needed |
| **Calories display** | Scaled with servings (`recipeCalories`) | Honest numbers when portions change |
| **Cost / effort / time** | From extraction; cost symbols localized (ADR 008) | Quick “is this worth it tonight?” signals |
| **Substitution (Swap)** | Modal → `suggest-substitution` Edge Fn → 2–3 alternatives | Missing one ingredient shouldn’t kill the cook (ADR 005) |
| **Dietary variants** | Modal → `transform-recipe` (healthier, vegan, GF, …) | Whole-recipe remix without re-extracting the video |
| **Favorite** | Detail header heart | Same as library pin |
| **Partial banner** | When `extraction_status === 'partial'` | Honest about incomplete extraction |

**Key files:** `RecipeView.tsx`, `SubstitutionModal.tsx`, `RecipeVariantModal.tsx`, `suggestSubstitution.ts`, `transformRecipe.ts`, edge functions under `supabase/functions/`

---

### 4.10 Duplicate / “already saved” detection

**User story:** “Don’t make me extract the same video twice.”

- **Signed in:** Edge Function looks up by canonical URL / platform id (`recipeLookup`, unique URL migration `0005`)  
- **Guest:** `findExistingGuestRecipe` before calling extract  

**Why:** Saves money (Gemini/API), time, and library clutter.

---

### 4.11 Thumbnail backfill

**User story:** “My old YouTube recipes look blurry / broken in the list.”

When the library loads, recipes with weak YouTube thumbnails call `backfill-thumbnails`, then persist updated `image_url` (guest or Supabase). Session cache avoids repeat calls.

**Why:** Early extractions used lower-quality defaults; backfill upgrades without re-running full extraction.

**Key files:** `backfillRecipeThumbnails.ts`, `backfill-thumbnails/`, `recipeImageSource.ts`, `RecipeImage.tsx`

---

### 4.12 Settings & profile

**User story:** “Account, looks, and fixing a failed sync.”

- Sign in / Sign out  
- Avatar upload (camera or library → Supabase Storage)  
- Light / dark / system theme  
- Retry guest → cloud migration if it failed  

**Why:** Identity + comfort + recovery for the one-time migration path.

**Key files:** `settings.tsx`, `useProfile.ts`, `ThemeToggle`, `uploadAvatar`

---

### 4.13 Error boundary

Root `ErrorBoundary` catches render crashes so one bad recipe screen doesn’t white-screen the whole app.

**Why:** Mobile resilience; clearer recovery than a blank screen.

---

## 5. Data model (mental model)

**Recipe** (`src/types/recipe.ts`) mirrors the `recipes` table:

- Source: `title`, `original_url`, `platform`, `image_url`  
- Content: `ingredients[]`, `instructions[]`, `servings`  
- Estimates: `calories`, `estimated_time_minutes`, `cost_estimate`, `effort_level`  
- Extraction meta: `extraction_status`, `extraction_source`, `missing_fields`, `calories_reasoning`  
- Product flags: `is_favorite`, `migrated_from_guest`  

**Migrations:**

| File | Adds |
|------|------|
| `0001_init.sql` | profiles, recipes, RLS |
| `0002_profile_avatar.sql` | avatar storage path |
| `0003_extraction_metadata.sql` | extraction source / reasoning fields |
| `0004_recipe_favorites.sql` | `is_favorite` |
| `0005_unique_recipe_url.sql` | per-user unique URL constraint |

Guests use the same shape with ids like `guest-<timestamp>-…` and no `user_id`.

---

## 6. Edge Functions cheat sheet

| Function | Input | Output | Why it exists |
|----------|-------|--------|---------------|
| `extract-recipe` | `{ url }` | `{ status, platform, recipe?, message?, cached? }` | Core Snap pipeline |
| `suggest-substitution` | ingredient + recipe context | 2–3 alternatives + rationale | Per-ingredient Swap |
| `transform-recipe` | `{ variant, recipe }` | remixed recipe + summary | Dietary / lifestyle remix |
| `backfill-thumbnails` | `{ videoIds, recipeIds }` | updated thumbnail URLs | Upgrade legacy YouTube images |

Secrets (server only): `GEMINI_API_KEY`, optional `YOUTUBE_API_KEY`, `SCRAPECREATORS_API_KEY`, optional `GEMINI_MODEL`. Setup: [`supabase/README.md`](../supabase/README.md).

---

## 7. Client library map

| Module | Role |
|--------|------|
| `guestRecipes.ts` | Local guest CRUD + 3-save quota |
| `migrateGuestRecipes.ts` | Guest → Supabase on sign-in |
| `recipeDraft.ts` | In-memory handoff Snap → Preview |
| `findExistingRecipe.ts` | Guest duplicate check |
| `recipeFavorites.ts` | Normalize + toggle favorite |
| `recipeListQuery.ts` | Search / sort / favorites filter |
| `recipeVariants.ts` | Variant keys & labels for remix UI |
| `recipeCalories.ts` | Display calories for scaled servings |
| `recipeImageSource.ts` | Resolve displayable image URI |
| `platformUrls.ts` / `youtube.ts` | URL / id helpers on the client |
| `formatQuantity.ts` / `formatCostEstimate.ts` | Display formatting |
| `backfillRecipeThumbnails.ts` | Client orchestrator for thumbnail upgrades |
| `supabase/*` | Auth, recipes CRUD, edge-function clients |

---

## 8. End-to-end journeys (happy paths)

### A. First-time guest

Empty Library → Get started → Snap YouTube URL → Fork it! → Preview → Save (1 of 3) → Library shows recipe → cook with scale/swap.

### B. Hit the free limit

Save #4 as guest → “Free limit reached” → Sign up → migration runs → unlimited cloud library.

### C. Signed-in re-snap

Paste a URL already in the library → Edge Function returns `cached` → opens the existing recipe (no Gemini spend).

### D. Share from another app (dev build)

Share link → Pinch → Snap auto-fills and Forks → Preview / cached recipe.

### E. Dietary remix while cooking

Open recipe → Remix → “Vegan” → `transform-recipe` → ingredients & steps update in the session (preview can save the remixed version; detail remix is session-local unless you re-save elsewhere).

---

## 9. What is intentionally out of scope (for now)

These are useful to know so workflows aren’t expected where they don’t exist yet:

- Full recipe editor (manual rewrite of every field)  
- Manual paste-fallback when extraction fails (ADR 004)  
- Multi-user / shared cookbooks  
- Precise grocery pricing (cost is `$` / `$$` / `$$$` tiers only)  

---

## 10. Related docs

| Doc | Use when |
|-----|----------|
| [`GLOSSARY.md`](./GLOSSARY.md) | Naming (Snap, Fork it!, content ladder, …) |
| [`plan/MVP-PLAN.md`](./plan/MVP-PLAN.md) | Original phased plan |
| [`adr/001`–`010`](./adr/) | Why decisions were made |
| [`grilling/DECISION-MAP.md`](./grilling/DECISION-MAP.md) | Locked product decisions + build checklist |
| [`supabase/README.md`](../supabase/README.md) | Migrations, secrets, deploy |

---

*When you add a new user-facing flow, add a short section here: what / why / key files.*
