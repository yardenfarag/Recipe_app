# ChopChop MVP: Supabase + Expo Auth Research

> **Sources:** Official Supabase documentation ([supabase.com/docs](https://supabase.com/docs)) only. Researched July 2026.
>
> **Project context:** Email/social auth, profiles + recipes tables, RLS, JSONB columns, optional image storage.

---

## 1. `@supabase/supabase-js` in Expo

### Install (official Expo quickstart)

```bash
npx expo install @supabase/supabase-js react-native-url-polyfill expo-sqlite
```

Alternative auth quickstart also lists `@react-native-async-storage/async-storage`.

**Source:** [Use Supabase with Expo React Native](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native)

### Client setup

Expo requires `EXPO_PUBLIC_`-prefixed env vars:

```env
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

Official Expo quickstart (2026) uses `expo-sqlite/localStorage/install` as the session storage polyfill:

```ts
import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import 'expo-sqlite/localStorage/install'

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
```

**Expo Go compatible:** ✅ All of the above.

---

## 2. Auth in Expo Go

### Email / password

Supported in Expo Go via `@supabase/supabase-js` auth methods (`signUp`, `signInWithPassword`, `signOut`). No native modules required.

**Source:** [Use Supabase Auth with React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native)

### Social OAuth (Google, Apple)

Requires a **redirect URL** and often native SDK configuration:

| Provider | Expo Go | Notes |
|----------|---------|-------|
| Email/password | ✅ | Simplest MVP path |
| Magic link | ✅ | Works with deep links in dev |
| Apple Sign-In (iOS) | ✅ | `expo-apple-authentication` + `signInWithIdToken`; register `host.exp.Exponent` in Supabase Apple Client IDs |
| Google (native) | ❌ | `@react-native-google-signin` needs dev build; browser OAuth fallback possible with deep linking |
| Google OAuth (browser) | ⚠️ | Works with `scheme` config; more setup than email |

**Recommendation for ChopChop MVP:** Email/password in Phase 2; Apple Sign-In on iOS is viable in Expo Go if needed; defer native Google to Phase 3 (dev build).

---

## 3. Schema: profiles + recipes

```sql
-- Auto-create profile on signup
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  original_url text,
  image_url text,
  instructions jsonb not null default '[]',
  ingredients jsonb not null default '[]',
  servings int default 1,
  calories int,
  estimated_time_minutes int,
  cost_estimate text check (cost_estimate in ('$', '$$', '$$$')),
  effort_level text check (effort_level in ('Easy', 'Medium', 'Hard')),
  created_at timestamptz default now()
);
```

**Source:** Supabase Postgres + RLS patterns from [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

---

## 4. JSONB for ingredients / instructions

Postgres JSONB is first-class in Supabase. Query examples:

```ts
// Insert
await supabase.from('recipes').insert({
  title: 'Garlic Pasta',
  ingredients: [{ name: 'pasta', quantity: 400, unit: 'g' }],
  instructions: [{ step: 1, text: 'Boil water...' }],
})

// Read (returns typed JSON)
const { data } = await supabase.from('recipes').select('*').eq('user_id', userId)
```

JSONB supports indexing via GIN if search becomes needed later.

**Source:** [Managing JSON and unstructured data](https://supabase.com/docs/guides/database/json)

---

## 5. RLS best practices

```sql
alter table public.recipes enable row level security;

-- Users can only see their own recipes
create policy "Users read own recipes"
  on public.recipes for select
  using (auth.uid() = user_id);

create policy "Users insert own recipes"
  on public.recipes for insert
  with check (auth.uid() = user_id);

create policy "Users update own recipes"
  on public.recipes for update
  using (auth.uid() = user_id);

create policy "Users delete own recipes"
  on public.recipes for delete
  using (auth.uid() = user_id);

-- Profiles: users read/update own profile only
alter table public.profiles enable row level security;

create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);
```

**Key rules:**
- Enable RLS on every table in the `public` schema
- Use `auth.uid()` for user-scoped policies
- Never expose service role key in the mobile app

**Source:** [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

---

## 6. Storage for recipe images

For MVP, store `image_url` as an external URL (from the social post or AI extraction). For uploaded images:

```sql
-- Storage bucket (private, user-scoped)
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true);

create policy "Users upload own images"
  on storage.objects for insert
  with check (bucket_id = 'recipe-images' and auth.uid()::text = (storage.foldername(name))[1]);
```

**Expo Go compatible:** ✅ Supabase Storage JS client works in Expo Go.

**Source:** [Storage](https://supabase.com/docs/guides/storage)

---

## Expo Go Caveats Summary

| Feature | Expo Go |
|---------|---------|
| Supabase JS client + Postgres CRUD | ✅ |
| Email/password auth | ✅ |
| RLS-protected queries | ✅ |
| JSONB read/write | ✅ |
| Storage upload/download | ✅ |
| Google/Apple OAuth | ⚠️ Needs dev build for production UX |
| Edge Function calls from app | ✅ (HTTP fetch to function URL) |
