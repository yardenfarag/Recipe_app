# ChopChop MVP Plan

**Developer:** Yarden  
**Stack:** Expo SDK 54 · NativeWind v4 · Supabase · Gemini Flash  
**Target:** iOS + Android via Expo Go (Phase 1–2), Dev Build (Phase 3)

---

## Vision (one line)

Snap a recipe from social media → get a clean, structured, scalable recipe with smart substitutions.

---

## Phased Delivery

### Phase 1 — Skeleton UI *(this session)*

| # | Task | Output |
|---|------|--------|
| 1 | `npx create-expo-app@latest ChopChop --template default` | Expo Router + TS project |
| 2 | Install & configure NativeWind v4 | `tailwind.config.js`, `global.css`, `metro.config.js`, `babel.config.js` |
| 3 | Folder structure | `src/components`, `src/screens`, `src/lib/supabase`, `src/hooks` |
| 4 | Supabase client stub | `src/lib/supabase/client.ts` + `.env.example` |
| 5 | **Home** screen | Empty state: "You have no recipes yet" + "Get Started" |
| 6 | **AddRecipe** screen | URL text input + "Fork it!" button |
| 7 | **RecipeDetail** screen | Dummy recipe data (title, image, ingredients, steps, calories, cost, effort, time) |
| 8 | Navigation wiring | Expo Router file-based routes |

**Expo Go compatible:** ✅ All of Phase 1.

### Phase 2 — Auth, Library, Real AI

| # | Task | Notes |
|---|------|-------|
| 9 | Supabase project setup | `profiles` + `recipes` tables, RLS |
| 10 | Email/password auth | `@supabase/supabase-js` + AsyncStorage session |
| 11 | Recipe Library | FlatList gallery from Supabase |
| 12 | Edge Function: `extract-recipe` | Fetch URL content → Gemini structured JSON → return |
| 13 | Wire AddRecipe → Edge Function → save to DB | Loading/error states |
| 14 | Serving scale logic | Pure client math on ingredient quantities |
| 15 | Substitution button | Per-ingredient AI call via Edge Function |

**Expo Go compatible:** ✅ All of Phase 2.

### Phase 3 — Share Sheet + Polish

| # | Task | Notes |
|---|------|-------|
| 16 | Switch to dev build | `expo-dev-client` + EAS Build |
| 17 | Share extension | `expo-share-intent` or `expo-sharing` (SDK 55 experimental) |
| 18 | Deep link handler | Auto-populate AddRecipe from shared URL |
| 19 | Social auth | Google + Apple sign-in |
| 20 | Recipe image upload | Supabase Storage |

**Expo Go compatible:** ❌ Requires dev build.

---

## Database Schema

```sql
-- profiles (auto-created on signup via trigger)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);

-- recipes
create table recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  original_url text,
  image_url text,
  instructions jsonb not null default '[]',   -- [{ step: 1, text: "..." }]
  ingredients jsonb not null default '[]',     -- [{ name, quantity, unit }]
  servings int default 1,
  calories int,
  estimated_time_minutes int,
  cost_estimate text check (cost_estimate in ('$', '$$', '$$$')),
  effort_level text check (effort_level in ('Easy', 'Medium', 'Hard')),
  created_at timestamptz default now()
);

-- RLS: users can only CRUD their own recipes
alter table recipes enable row level security;
create policy "Users manage own recipes" on recipes
  for all using (auth.uid() = user_id);
```

---

## AI Extraction Contract

**System prompt:**
> You are a master chef. Analyze the following social media content and extract a precise recipe. Include ingredients with measurements, step-by-step instructions, total calorie estimates, a cost score from 1-3 dollar signs, estimated time in minutes, and effort level (Easy/Medium/Hard). If information is missing, use your culinary knowledge to provide the most accurate estimate possible. Return ONLY valid JSON.

**Expected JSON schema:**

```json
{
  "title": "string",
  "image_url": "string | null",
  "servings": 4,
  "ingredients": [
    { "name": "chicken breast", "quantity": 2, "unit": "lbs" }
  ],
  "instructions": [
    { "step": 1, "text": "Season chicken..." }
  ],
  "calories": 450,
  "estimated_time_minutes": 30,
  "cost_estimate": "$$",
  "effort_level": "Medium"
}
```

Use Gemini [structured output](https://ai.google.dev/gemini-api/docs/structured-output) with `responseMimeType: "application/json"`.

---

## Folder Structure

```
ChopChop/
├── app/                          # Expo Router screens
│   ├── (tabs)/
│   │   ├── index.tsx             # Home (Recipe Library)
│   │   └── add.tsx               # AddRecipe
│   ├── recipe/[id].tsx           # RecipeDetail
│   └── _layout.tsx
├── src/
│   ├── components/               # Reusable UI (RecipeCard, IngredientRow, etc.)
│   ├── screens/                  # Screen logic (if separated from app/ routes)
│   ├── lib/
│   │   └── supabase/
│   │       └── client.ts
│   ├── hooks/                    # useRecipes, useAuth, useScaleServings
│   ├── services/                 # gemini.ts (Edge Function client wrapper)
│   └── types/                    # Recipe, Ingredient, etc.
├── docs/
│   ├── GLOSSARY.md
│   ├── adr/
│   └── research/
├── .env.example
├── global.css
├── tailwind.config.js
└── nativewind-env.d.ts
```

---

## Environment Variables

```env
# .env (never commit)
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# Gemini key lives ONLY in Supabase Edge Function secrets, not in the app
```

---

## Key Constraints (from doc research)

| Constraint | Impact | Mitigation |
|-----------|--------|------------|
| Share Sheet needs native code | Not in Expo Go | Phase 3; paste URL works in Phase 1–2 |
| Gemini can't scrape social URLs directly | Need server-side fetch | Supabase Edge Function |
| API keys in mobile app | Security risk | Edge Function holds Gemini key |
| TikTok/IG scraping is fragile | Extraction quality varies | Start with YouTube (transcripts available); iterate |
| NativeWind v4 for production stability | Avoid v5 preview | Use v4.1 + Tailwind CSS v3 |

---

## What You Need to Provide

Before Phase 2 implementation:

1. **Supabase URL + Anon Key** (from supabase.com → project "recipe_app")
2. **Gemini API Key** (from Google AI Studio) — goes into Edge Function secrets only
3. Answers to the grilling questions below

---

## Next Step

Grilling session (see chat) → then scaffold Phase 1.
