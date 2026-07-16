-- ChopChop initial schema
-- Run this in the Supabase SQL Editor (or via `supabase db push` once the CLI is linked)

-- ============================================================
-- 1. profiles
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2. recipes
-- ============================================================

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- Source
  title text not null,
  original_url text,
  platform text check (platform in ('youtube', 'instagram', 'tiktok', 'unknown')),
  image_url text,

  -- Recipe content (JSONB per ADR 001)
  ingredients jsonb not null default '[]',    -- [{ name, quantity, unit }]
  instructions jsonb not null default '[]',   -- [{ step, text }]
  servings int not null default 1,

  -- AI-estimated insights
  calories int,
  estimated_time_minutes int,
  cost_estimate text check (cost_estimate in ('$', '$$', '$$$')),
  effort_level text check (effort_level in ('Easy', 'Medium', 'Hard')),

  -- Extraction metadata (ADR 004 — content ladder & partial results)
  extraction_status text not null default 'full' check (extraction_status in ('full', 'partial')),
  missing_fields text[],

  -- Guest migration tracking (ADR 002)
  migrated_from_guest boolean not null default false,

  created_at timestamptz not null default now()
);

create index recipes_user_id_idx on public.recipes(user_id);

alter table public.recipes enable row level security;

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
