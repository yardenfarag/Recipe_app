# ADR 001: MVP Scope and Architecture

**Status:** Accepted (grilling complete 2026-07-16)  
**Date:** 2026-07-16  
**Deciders:** Yarden (product), Cursor (engineering)

## Context

ChopChop is a React Native (Expo) mobile app that extracts structured recipes from social-media video URLs (TikTok, Instagram, YouTube) using Gemini AI, stores them in Supabase, and lets users scale servings and request ingredient substitutions.

The user wants to develop on a physical phone via **Expo Go** for the current session, while the long-term vision includes **Share Sheet integration** (tap Share → ChopChop icon in TikTok/IG/YT).

## Decision

### Phase 1 — Skeleton + Paste URL (this session)

Build the Expo project with NativeWind, Supabase client, and three screens using dummy data:

| Screen | Purpose |
|--------|---------|
| Home | Empty state → "Get Started" |
| AddRecipe | Paste URL + "Fork it!" button |
| RecipeDetail | Display AI result template (dummy data) |

Use **Expo SDK 54** (compatible with current Expo Go on physical devices). Default template includes Expo Router + TypeScript.

### Phase 2 — Auth + Library + Real Extraction

- Supabase email/password auth (social login deferred)
- Save/load recipes from Supabase with RLS
- Supabase Edge Function: scrape URL metadata → call Gemini → return JSON
- Gemini model: **`gemini-2.5-flash`** or **`gemini-3.5-flash`** (verify at implementation time; both support structured JSON output per [Google AI docs](https://ai.google.dev/gemini-api/docs/structured-output))

### Phase 3 — Share Sheet + Dev Build

- Migrate from Expo Go to **development build** (`expo-dev-client` + EAS Build)
- Add share extension via `expo-share-intent` or experimental `expo-sharing` (SDK 55+)
- Deep link handling for incoming shared URLs

## Architecture

```
┌─────────────────┐     paste URL      ┌──────────────────────┐
│  React Native   │ ─────────────────► │  Supabase Edge Fn    │
│  (Expo Go)      │                    │  1. Fetch URL meta   │
│                 │ ◄───────────────── │  2. Call Gemini API  │
│  Home           │   recipe JSON      │  3. Return structured│
│  AddRecipe      │                    │     recipe           │
│  RecipeDetail   │                    └──────────────────────┘
│                 │     CRUD           ┌──────────────────────┐
│                 │ ◄────────────────► │  Supabase Postgres   │
└─────────────────┘                    │  profiles + recipes  │
                                       └──────────────────────┘
```

**Why a server-side extraction step is required:**

1. Gemini cannot reliably scrape TikTok/IG/YT URLs directly — content must be fetched first ([Gemini URL context](https://ai.google.dev/gemini-api/docs) works for some URLs but not all social platforms).
2. API keys (Gemini, scraping services) must not ship in the mobile client.
3. CORS and platform ToS prevent client-side scraping.

## Consequences

### Positive

- Expo Go works for Phase 1–2 (paste URL flow)
- Edge Functions keep secrets server-side
- Clear phase boundaries reduce scope creep

### Negative / Trade-offs

- Share Sheet is **not available in Expo Go** — requires native code ([expo-share-intent docs](https://www.npmjs.com/package/expo-share-intent))
- URL scraping quality depends on platform; TikTok/IG may need third-party APIs (e.g., oEmbed, yt-dlp on server)
- "Gemini 3 Flash" in the vision maps to `gemini-3.5-flash` or `gemini-2.5-flash` in the API — exact model ID to be confirmed when API key is available

## Open Questions

All resolved in grilling session — see `docs/grilling/DECISION-MAP.md` and ADRs 002–008.
