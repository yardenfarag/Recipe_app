# ChopChop MVP: Gemini + URL Extraction Research

> **Sources:** Official Google AI documentation ([ai.google.dev](https://ai.google.dev)) only. Researched July 2026.
>
> **Project context:** Extract recipes from TikTok/Instagram/YouTube URLs via Gemini Flash.

---

## 1. Gemini API — Models & Structured Output

### Current Flash models (July 2026)

| Model ID | Structured Output | URL Context |
|----------|-------------------|-------------|
| `gemini-3.5-flash` | ✅ | ✅ |
| `gemini-2.5-flash` | ✅ | ✅ |
| `gemini-3.1-flash-lite` | ✅ | ✅ |

**Note:** "Gemini 3 Flash" in the product vision maps to `gemini-3.5-flash` in the API.

**Source:** [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [URL context](https://ai.google.dev/gemini-api/docs/url-context)

### Structured JSON output

Use `responseMimeType: "application/json"` with a JSON Schema:

```ts
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: prompt,
  config: {
    responseMimeType: 'application/json',
    responseSchema: recipeSchema,
  },
})
```

**Source:** [Structured outputs — Generate Content API](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)

### API endpoint

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
Header: x-goog-api-key: $GEMINI_API_KEY
```

Or Interactions API: `POST https://generativelanguage.googleapis.com/v1beta/interactions`

---

## 2. Can Gemini Accept a URL Directly?

**Partially.** Gemini has a **URL Context** tool that fetches page content:

```ts
tools: [{ type: 'url_context' }]
```

### What works

- Public recipe websites (Food Network, AllRecipes, etc.)
- Text/HTML pages, PDFs, images

### What does NOT work (critical for ChopChop)

| URL type | Supported? |
|----------|------------|
| YouTube videos | ❌ Use [Video Understanding API](https://ai.google.dev/gemini-api/docs/video-understanding) instead |
| TikTok | ❌ Not reliably accessible (login walls, JS-rendered) |
| Instagram | ❌ Login required, not publicly indexable |
| Paywalled content | ❌ |

**Source:** [URL context — Limitations](https://ai.google.dev/gemini-api/docs/url-context#limitations)

### Implication

ChopChop **must scrape/fetch content server-side** before sending text to Gemini. URL Context alone is insufficient for TikTok/IG/YT.

---

## 3. Architecture Options

### Option A: Client → Gemini directly

❌ **Rejected.** API key exposed in mobile bundle; can't scrape social URLs from client.

### Option B: Supabase Edge Function (recommended MVP)

```
Mobile app → Edge Function → [scrape URL] → Gemini → JSON → save to DB
```

| Step | Tool |
|------|------|
| Receive URL | Edge Function HTTP handler |
| Fetch content | Server-side fetch / yt-dlp / third-party API |
| Extract recipe | Gemini with structured output |
| Store result | Supabase Postgres |

**Why Edge Function:**
- Keeps `GEMINI_API_KEY` in Supabase secrets
- No CORS issues
- Co-located with database
- Deno runtime supports `fetch()` natively

**Source:** [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

### Option C: Separate backend (Node/Python)

Valid for production scale but over-engineered for MVP. Edge Functions suffice.

### Platform-specific content extraction

| Platform | MVP approach |
|----------|-------------|
| **YouTube** | Gemini Video Understanding API or YouTube Data API for description + captions |
| **TikTok** | oEmbed API (limited) or third-party scraper on Edge Function |
| **Instagram** | oEmbed (public posts only) or manual description paste fallback |

**MVP recommendation:** Start with YouTube (best transcript access), add TikTok/IG incrementally.

---

## 4. Legal / ToS (brief)

- Scraping social platforms may violate their Terms of Service
- TikTok and Meta actively block unauthorized scraping
- MVP mitigations:
  - Process only URLs the user explicitly shares (user-initiated)
  - Store `original_url` for attribution
  - Don't redistribute video content — extract text/recipe data only
  - Consider official APIs where available (YouTube Data API)

---

## 5. MVP Flow: Paste URL vs Share Sheet

| Flow | Phase | Expo Go? |
|------|-------|----------|
| Paste URL on AddRecipe screen | Phase 1–2 | ✅ |
| Share → ChopChop from TikTok/IG | Phase 3 | ❌ Dev build |

**Recommended MVP:** Paste URL first. Share Sheet deferred until dev build.

When Share Sheet arrives, the deep-linked URL feeds the same Edge Function — no architecture change.

---

## 6. Serving Scale — App Logic, Not AI

Ingredient scaling is pure client-side math:

```ts
function scaleIngredients(ingredients, originalServings, targetServings) {
  const factor = targetServings / originalServings
  return ingredients.map(i => ({
    ...i,
    quantity: Math.round(i.quantity * factor * 100) / 100,
  }))
}
```

AI extracts the base recipe at `servings: N`. The app recalculates on slider/stepper change. No additional Gemini call needed.

Substitutions remain on-demand AI calls (one ingredient at a time).

---

## Recommended MVP Architecture

```
┌──────────────┐   POST /extract-recipe    ┌─────────────────────────┐
│  Expo Go     │ ─────────────────────────► │  Supabase Edge Function │
│  AddRecipe   │   { url: "..." }          │                         │
│              │                           │  1. fetch URL content   │
│              │ ◄───────────────────────── │  2. build prompt        │
│  RecipeDetail│   { recipe: {...} }       │  3. Gemini structured   │
│              │                           │  4. return JSON         │
│              │   INSERT recipes          └─────────────────────────┘
│              │ ─────────────────────────► Supabase Postgres (RLS)
└──────────────┘
```

**Gemini model:** `gemini-2.5-flash` (stable) or `gemini-3.5-flash` (latest)  
**Secrets:** `GEMINI_API_KEY` in Edge Function env only  
**Fallback:** If scrape fails, show error + let user paste description manually (Phase 2+)
