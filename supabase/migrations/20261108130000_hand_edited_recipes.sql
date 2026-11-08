-- Hand-edited and written recipes (PIN-79, ADR 018).
--
-- 1. 'manual' extraction source for a written recipe (no URL, platform 'unknown').
-- 2. recipes.locked_fields: the AI-derived fields the user set by hand. Pinch never
--    recalculates a locked field.
-- 3. CHECK constraints for the hard limits. They are the backstop for writes that skip the
--    save-recipe-edit Edge Function, and must match src/lib and _shared limits code.
-- 4. 'recipe_edit' kind in ai_usage_daily for the 40-a-day recalculation cap.
--
-- No Hub trigger changes: the insert trigger already skips rows with a null URL, and no
-- trigger runs on update, so an edit never touches a Hub card.
--
-- Live data checked on 2026-11-08 (117 recipes, 98 Hub cards, 1 share): everything passes except
-- a cooking time of 0 on 5 recipes and 4 cards, which section 3 clears to unknown.
--
-- Before applying, writers must stay inside the limits, or a save fails with 23514:
--   - deploy extract-recipe, invent-recipe, repair-recipe, transform-recipe and
--     suggest-substitution, which fit their output with _shared/recipeLimits.ts. Before that,
--     extraction returned 0 minutes when the model had no estimate, and tags up to 40 characters.
--   - guest recipes and backups made before this migration can hold the same values, and are
--     inserted by the client (migrateGuestRecipes, recipeBackup restore). A trigger in section 3
--     stores an out-of-range cooking time or calorie count as unknown. A tag over 30 characters
--     from that old data still fails; none of the live rows has one (longest 18).

-- 1. Written recipes ---------------------------------------------------------------------------

alter table public.recipes drop constraint if exists recipes_extraction_source_check;
alter table public.recipes add constraint recipes_extraction_source_check check (
  extraction_source is null
  or extraction_source in (
    'description', 'comments', 'captions', 'video', 'web', 'photo', 'invented', 'manual'
  )
);

-- 2. Locked fields -----------------------------------------------------------------------------

alter table public.recipes
  add column if not exists locked_fields text[] not null default '{}';

comment on column public.recipes.locked_fields is
  'AI-derived fields the user set by hand (ADR 018). Pinch never recalculates these until the user resets them.';

alter table public.recipes drop constraint if exists recipes_locked_fields_known;
alter table public.recipes add constraint recipes_locked_fields_known check (
  locked_fields <@ array[
    'calories', 'estimated_time_minutes', 'effort_level', 'cost_estimate', 'tags', 'appliances'
  ]::text[]
);

-- 3. Hard limits -------------------------------------------------------------------------------

-- Extraction sometimes stored 0 minutes when the model had no estimate (5 recipes and 4 Hub cards
-- on 2026-11-08). 0 is not a cooking time, so store it as unknown like every other missing estimate.
update public.recipes
set estimated_time_minutes = null
where estimated_time_minutes is not null
  and (estimated_time_minutes < 1 or estimated_time_minutes > 2880);

update public.recipe_cards
set estimated_time_minutes = null
where estimated_time_minutes is not null
  and (estimated_time_minutes < 1 or estimated_time_minutes > 2880);

-- Guest recipes and backups made before this migration can still carry an out-of-range estimate,
-- and app builds already in the stores insert them as they are. An estimate outside its range is
-- no estimate, so store it as unknown instead of failing the save (same rule as
-- fitRecipeToLimits). Runs before the CHECKs below. The editor rejects these values before Save,
-- so this never silently changes what a user typed in the editor.
create or replace function public.clear_out_of_range_recipe_estimates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estimated_time_minutes is not null
     and (new.estimated_time_minutes < 1 or new.estimated_time_minutes > 2880) then
    new.estimated_time_minutes := null;
  end if;
  if new.calories is not null and (new.calories < 0 or new.calories > 10000) then
    new.calories := null;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_out_of_range_recipe_estimates() from public;

drop trigger if exists recipes_clear_out_of_range_estimates on public.recipes;
create trigger recipes_clear_out_of_range_estimates
  before insert or update of estimated_time_minutes, calories on public.recipes
  for each row execute function public.clear_out_of_range_recipe_estimates();

-- PL/pgSQL rather than SQL so each guard runs before the cast it protects: a crafted
-- {"quantity":"abc"} must fail the CHECK (23514), not raise a cast error.
-- p_require_one: a full recipe needs at least one item; a partial one may be missing the list
-- (ADR 004, the "incomplete" banner).
create or replace function public.recipe_ingredients_within_limits(
  p_items jsonb,
  p_require_one boolean
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  quantity numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return false; end if;
  if jsonb_array_length(p_items) > 60 then return false; end if;
  if p_require_one and jsonb_array_length(p_items) < 1 then return false; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if jsonb_typeof(item -> 'name') is distinct from 'string' then return false; end if;
    if char_length(item ->> 'name') > 100 then return false; end if;
    if jsonb_typeof(item -> 'quantity') is distinct from 'number' then return false; end if;
    quantity := (item ->> 'quantity')::numeric;
    if quantity < 0 or quantity > 10000 then return false; end if;
  end loop;

  return true;
end;
$$;

create or replace function public.recipe_steps_within_limits(
  p_items jsonb,
  p_require_one boolean
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return false; end if;
  if jsonb_array_length(p_items) > 40 then return false; end if;
  if p_require_one and jsonb_array_length(p_items) < 1 then return false; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if jsonb_typeof(item -> 'text') is distinct from 'string' then return false; end if;
    if char_length(item ->> 'text') > 800 then return false; end if;
  end loop;

  return true;
end;
$$;

-- A CHECK can't hold a subquery, so the per-tag length lives in a function too.
create or replace function public.recipe_tags_within_limits(p_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tags is not null
    and cardinality(p_tags) <= 10
    and not exists (select 1 from unnest(p_tags) as t where t is null or char_length(t) > 30);
$$;

-- A CHECK runs its functions as the writing role, and 0043 removed the default client EXECUTE.
revoke all on function public.recipe_ingredients_within_limits(jsonb, boolean) from public;
revoke all on function public.recipe_steps_within_limits(jsonb, boolean) from public;
revoke all on function public.recipe_tags_within_limits(text[]) from public;
grant execute on function public.recipe_ingredients_within_limits(jsonb, boolean)
  to authenticated, service_role;
grant execute on function public.recipe_steps_within_limits(jsonb, boolean)
  to authenticated, service_role;
grant execute on function public.recipe_tags_within_limits(text[])
  to authenticated, service_role;

alter table public.recipes drop constraint if exists recipes_title_len;
alter table public.recipes add constraint recipes_title_len check (char_length(title) <= 120);

alter table public.recipes drop constraint if exists recipes_ingredients_limits;
alter table public.recipes add constraint recipes_ingredients_limits check (
  public.recipe_ingredients_within_limits(ingredients, extraction_status = 'full')
);

alter table public.recipes drop constraint if exists recipes_instructions_limits;
alter table public.recipes add constraint recipes_instructions_limits check (
  public.recipe_steps_within_limits(instructions, extraction_status = 'full')
);

alter table public.recipes drop constraint if exists recipes_tags_limits;
alter table public.recipes add constraint recipes_tags_limits check (
  public.recipe_tags_within_limits(tags)
);

alter table public.recipes drop constraint if exists recipes_servings_range;
alter table public.recipes add constraint recipes_servings_range check (servings between 1 and 100);

alter table public.recipes drop constraint if exists recipes_time_range;
alter table public.recipes add constraint recipes_time_range check (
  estimated_time_minutes is null or estimated_time_minutes between 1 and 2880
);

alter table public.recipes drop constraint if exists recipes_calories_range;
alter table public.recipes add constraint recipes_calories_range check (
  calories is null or calories between 0 and 10000
);

-- recipes_cook_note_len (160 characters) already exists and is unchanged.

-- 4. Recalculation cap -------------------------------------------------------------------------

alter table public.ai_usage_daily
  drop constraint if exists ai_usage_daily_action_check;

alter table public.ai_usage_daily
  add constraint ai_usage_daily_action_check
  check (action in (
    'substitution', 'translation', 'fridge_match', 'content_gate', 'remix', 'extract_attempt',
    'recipe_edit'
  ));

-- Same body as 20261102140000 plus 'recipe_edit'. CREATE OR REPLACE keeps the grants.
create or replace function public.reserve_daily_ai_usage(
  p_user_id uuid,
  p_action text,
  p_usage_date date,
  p_limit int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  if p_action not in (
    'substitution',
    'translation',
    'fridge_match',
    'content_gate',
    'remix',
    'extract_attempt',
    'recipe_edit'
  ) then
    raise exception 'invalid_action';
  end if;
  if p_usage_date is null then raise exception 'invalid_usage_date'; end if;
  if p_limit is null or p_limit < 1 then raise exception 'invalid_limit'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile_not_found';
  end if;

  insert into public.ai_usage_daily (user_id, action, usage_date, usage_count, updated_at)
  values (p_user_id, p_action, p_usage_date, 1, now())
  on conflict (user_id, action, usage_date) do update
    set usage_count = public.ai_usage_daily.usage_count + 1,
        updated_at = now()
    where public.ai_usage_daily.usage_count < p_limit
  returning usage_count into new_count;

  return coalesce(new_count, -1);
end;
$$;
