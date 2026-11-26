-- PIN-77: the meal plan. Each person plans their own week (breakfast, lunch, dinner and optional snacks) from
-- their Library; Hub recipes are saved to the Library before they go into the plan, so every entry points at
-- one of the person's own recipes.
--   * meal_plan_entries: one recipe per person, day and meal. A leftover entry points at the entry it comes
--     from (cook once, eat twice; a snack batch). Their own rows, under RLS. A plan belongs to one person even
--     in a household that shares the list and pantry (ADR 034).
--   * profiles.meal_plan_prefs: the choices "Plan my week" remembers (snacks a day, meals, whether to add Hub
--     recipes). The apps clean it; the check only stops a runaway client.
--
-- Expand only: new table and a new column with a default. Nothing reads them in old builds.

create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  -- The cook's own calendar day, not a timestamp: a plan doesn't move when they travel.
  plan_date date not null,
  meal text not null check (meal in ('breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner')),
  -- What gets cooked. For leftovers, the same recipe as the entry they come from.
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  -- Leftovers or a snack batch: the meal that makes them. Removing that meal removes these too.
  leftover_of uuid references public.meal_plan_entries(id) on delete cascade,
  servings smallint not null default 2 check (servings between 1 and 48),
  -- Filling and reshuffling never replace a locked meal.
  locked boolean not null default false,
  cooked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date, meal),
  check (leftover_of is null or leftover_of <> id)
);

comment on table public.meal_plan_entries is
  'PIN-77: a person''s meal plan, one recipe per day and meal. Leftovers point at the meal that makes them.';

create index meal_plan_entries_leftover_idx on public.meal_plan_entries (leftover_of) where leftover_of is not null;
create index meal_plan_entries_recipe_idx on public.meal_plan_entries (recipe_id);

alter table public.meal_plan_entries enable row level security;

create policy "Users read own meal plan"
  on public.meal_plan_entries for select
  using ((select auth.uid()) = user_id);
create policy "Users add to own meal plan"
  on public.meal_plan_entries for insert
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid()))
  );
create policy "Users change own meal plan"
  on public.meal_plan_entries for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid()))
  );
create policy "Users remove from own meal plan"
  on public.meal_plan_entries for delete
  using ((select auth.uid()) = user_id);

revoke all on public.meal_plan_entries from anon;
grant select, insert, update, delete on public.meal_plan_entries to authenticated;

-- A leftover belongs to the same person, comes from an earlier meal and is the same recipe.
create or replace function public.meal_plan_entries_check_leftover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source public.meal_plan_entries;
begin
  new.updated_at := now();
  if new.leftover_of is null then
    return new;
  end if;
  select * into source from public.meal_plan_entries where id = new.leftover_of;
  if source.id is null or source.user_id <> new.user_id then
    raise exception 'leftover_source_missing' using errcode = 'foreign_key_violation';
  end if;
  if source.leftover_of is not null then
    raise exception 'leftover_of_leftover' using errcode = 'check_violation';
  end if;
  if source.plan_date > new.plan_date then
    raise exception 'leftover_before_source' using errcode = 'check_violation';
  end if;
  new.recipe_id := source.recipe_id;
  return new;
end;
$$;

revoke all on function public.meal_plan_entries_check_leftover() from public, anon, authenticated;

create trigger meal_plan_entries_check_leftover
  before insert or update on public.meal_plan_entries
  for each row execute function public.meal_plan_entries_check_leftover();

-- Two weeks ahead and a few weeks back is a few hundred rows; this stops a runaway client, not a person.
create or replace function public.meal_plan_entries_within_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.meal_plan_entries where user_id = new.user_id) >= 2000 then
    raise exception 'meal_plan_full' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.meal_plan_entries_within_limit() from public, anon, authenticated;

create trigger meal_plan_entries_within_limit
  before insert on public.meal_plan_entries
  for each row execute function public.meal_plan_entries_within_limit();

-- ── What "Plan my week" remembers ──────────────────────────────────────────
alter table public.profiles
  add column if not exists meal_plan_prefs jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_meal_plan_prefs_shape;
alter table public.profiles
  add constraint profiles_meal_plan_prefs_shape
  check (jsonb_typeof(meal_plan_prefs) = 'object' and pg_column_size(meal_plan_prefs) <= 2048);

-- Column grants: the person writes this one column of their own row (the profiles RLS policy already limits rows).
grant update (meal_plan_prefs) on public.profiles to authenticated;

comment on column public.profiles.meal_plan_prefs is
  'PIN-77: choices "Plan my week" remembers ({snacksPerDay, meals, useHub}). Cleaned by shared/lib/mealPlan/prefs.ts.';
