-- PIN-77: the diets a Library recipe fits as written, so the meal plan can leave out a recipe that doesn't fit a
-- strict diet (a beef stew for a vegetarian) the way it already does for Hub cards (recipe_cards.diets, PIN-83).
--   * recipes.diets: kitchen-profile diet keys, filled by the backfill-diets admin function (target "recipes")
--     with the same check the Hub uses. Null = not checked yet; the planner then treats the recipe as unknown,
--     as before.
--   * A change to the ingredients makes the answer stale, so it goes back to null and is checked again.
--
-- Expand only: a new nullable column, a helper table and triggers. Old builds don't read any of it.

alter table public.recipes
  add column if not exists diets text[];

alter table public.recipes
  drop constraint if exists recipes_diets_size;
alter table public.recipes
  add constraint recipes_diets_size check (diets is null or cardinality(diets) <= 16);

comment on column public.recipes.diets is
  'PIN-77: kitchen-profile diets the recipe fits as written (the Hub''s check). Null = not checked; cleared when the ingredients change.';

create or replace function public.recipes_clear_stale_diets()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ingredients is distinct from old.ingredients and new.diets is not distinct from old.diets then
    new.diets := null;
  end if;
  return new;
end;
$$;

revoke all on function public.recipes_clear_stale_diets() from public, anon, authenticated;

drop trigger if exists recipes_clear_stale_diets on public.recipes;
create trigger recipes_clear_stale_diets
  before update of ingredients on public.recipes
  for each row execute function public.recipes_clear_stale_diets();

-- The backfill reads the recipes still to check in id order.
create index if not exists recipes_diets_pending_idx on public.recipes (id) where diets is null;

-- ── Labelled when saved ────────────────────────────────────────────────────
-- An extraction checks the recipe's diets in the background, after it has answered the app (the Hub card's check,
-- or one of its own when no card is published). The app saves the cook's copy separately, so the two meet here, in
-- either order:
--   * the answer is kept in recipe_diets_pending, by cook and ingredient names, and the save picks it up;
--   * if the recipe was saved first, remember_recipe_diets labels it straight away.
-- A recipe saved from the Hub (claim_recipe_card) takes its card's diets the same way, through the card's key.

-- The ingredient names in order, lower case: what makes two copies of a recipe "the same" here.
create or replace function public.recipe_ingredient_key(p_ingredients jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(coalesce(string_agg(lower(btrim(coalesce(item.value ->> 'name', ''))), E'\n' order by item.ordinality), ''))
  from jsonb_array_elements(case when jsonb_typeof(p_ingredients) = 'array' then p_ingredients else '[]'::jsonb end)
    with ordinality as item(value, ordinality);
$$;

revoke all on function public.recipe_ingredient_key(jsonb) from public, anon, authenticated;

create table if not exists public.recipe_diets_pending (
  user_id uuid not null references public.profiles(id) on delete cascade,
  ingredient_key text not null,
  diets text[] not null check (cardinality(diets) <= 16),
  created_at timestamptz not null default now(),
  primary key (user_id, ingredient_key)
);

comment on table public.recipe_diets_pending is
  'PIN-77: diets an extraction found, waiting for the cook to save the recipe (picked up by the recipes insert trigger). Kept a day.';

alter table public.recipe_diets_pending enable row level security;
-- No policies: only the functions below and extract-recipe (service role) touch it.
revoke all on public.recipe_diets_pending from anon, authenticated;

create or replace function public.recipes_fill_diets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  found_diets text[];
begin
  if new.diets is not null then
    return new;
  end if;
  v_key := public.recipe_ingredient_key(new.ingredients);

  select p.diets into found_diets
  from public.recipe_diets_pending p
  where p.user_id = new.user_id and p.ingredient_key = v_key and p.created_at > now() - interval '1 day';

  if found_diets is null and new.original_url is not null then
    select c.diets into found_diets
    from public.recipe_cards c
    where c.diets is not null
      and c.canonical_key = public.recipe_card_canonical_key(new.platform, new.original_url)
      and public.recipe_ingredient_key(c.ingredients) = v_key
    limit 1;
  end if;

  new.diets := found_diets;
  return new;
end;
$$;

revoke all on function public.recipes_fill_diets() from public, anon, authenticated;

drop trigger if exists recipes_fill_diets on public.recipes;
create trigger recipes_fill_diets
  before insert on public.recipes
  for each row execute function public.recipes_fill_diets();

-- extract-recipe (service role) after its diet check: keep the answer for the save, and label a copy saved already.
create or replace function public.remember_recipe_diets(p_user_id uuid, p_ingredients jsonb, p_diets text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := public.recipe_ingredient_key(p_ingredients);
  labelled integer;
begin
  if p_user_id is null or p_diets is null or cardinality(p_diets) > 16 then
    return 0;
  end if;
  delete from public.recipe_diets_pending where user_id = p_user_id and created_at <= now() - interval '1 day';
  insert into public.recipe_diets_pending (user_id, ingredient_key, diets)
  values (p_user_id, v_key, p_diets)
  on conflict (user_id, ingredient_key) do update set diets = excluded.diets, created_at = now();

  update public.recipes r
  set diets = p_diets
  where r.user_id = p_user_id
    and r.diets is null
    and r.created_at > now() - interval '1 day'
    and public.recipe_ingredient_key(r.ingredients) = v_key;
  get diagnostics labelled = row_count;
  return labelled;
end;
$$;

revoke all on function public.remember_recipe_diets(uuid, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.remember_recipe_diets(uuid, jsonb, text[]) to service_role;
