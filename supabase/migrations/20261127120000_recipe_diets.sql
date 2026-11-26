-- PIN-77: the diets a Library recipe fits as written, so the meal plan can leave out a recipe that doesn't fit a
-- strict diet (a beef stew for a vegetarian) the way it already does for Hub cards (recipe_cards.diets, PIN-83).
--   * recipes.diets: kitchen-profile diet keys, filled by the backfill-diets admin function (target "recipes")
--     with the same check the Hub uses. Null = not checked yet; the planner then treats the recipe as unknown,
--     as before.
--   * A change to the ingredients makes the answer stale, so it goes back to null and is checked again.
--
-- Expand only: a new nullable column. Old builds don't read it.

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
