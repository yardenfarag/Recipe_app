-- Protein, carbs and fat next to calories (PIN-80).
--
-- nutrition is a JSON object {"protein_g": n, "carbs_g": n, "fat_g": n}: estimated grams for ALL
-- servings, the same way calories is the total for all servings. NULL means "not estimated" (every
-- row saved before this migration, and any recipe whose calories the user set by hand).
-- The model call that estimates calories returns these too; the values are normalised in code
-- (supabase/functions/_shared/recipes/nutrition.ts) and SQL only guards the shape and range.
--
-- Safe for app builds already in the stores: the column is nullable with no default. Old builds
-- never read it; when they save a recipe straight from an import response they pass it through.
-- Apply this before deploying any Edge Function that returns nutrition.

alter table public.recipes add column if not exists nutrition jsonb;
alter table public.recipe_cards add column if not exists nutrition jsonb;

comment on column public.recipes.nutrition is
  'Estimated grams for all servings: protein_g, carbs_g, fat_g (PIN-80). NULL = not estimated. Cleared whenever calories change without it.';
comment on column public.recipe_cards.nutrition is
  'Copied from the extraction that published the card (PIN-80). NULL = not estimated.';

-- 2,500 g of protein or carbs is 10,000 kcal, the calorie cap (recipes_calories_range).
-- PL/pgSQL so each type check runs before the cast it protects: a crafted {"fat_g":"abc"} must
-- fail the CHECK (23514), not raise a cast error.
create or replace function public.recipe_nutrition_valid(p_nutrition jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  key text;
  amount numeric;
begin
  if p_nutrition is null then return true; end if;
  if jsonb_typeof(p_nutrition) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_nutrition)) <> 3 then return false; end if;
  foreach key in array array['protein_g', 'carbs_g', 'fat_g'] loop
    if jsonb_typeof(p_nutrition -> key) is distinct from 'number' then return false; end if;
    amount := (p_nutrition ->> key)::numeric;
    if amount < 0 or amount > 2500 then return false; end if;
  end loop;
  return true;
end;
$$;

-- The CHECKs and the trigger run as the writer, like recipe_ingredients_within_limits.
revoke all on function public.recipe_nutrition_valid(jsonb) from public, anon, authenticated;
grant execute on function public.recipe_nutrition_valid(jsonb) to authenticated, service_role;

alter table public.recipes drop constraint if exists recipes_nutrition_shape;
alter table public.recipes add constraint recipes_nutrition_shape check (
  public.recipe_nutrition_valid(nutrition)
) not valid;
alter table public.recipes validate constraint recipes_nutrition_shape;

alter table public.recipe_cards drop constraint if exists recipe_cards_nutrition_shape;
alter table public.recipe_cards add constraint recipe_cards_nutrition_shape check (
  public.recipe_nutrition_valid(nutrition)
) not valid;
alter table public.recipe_cards validate constraint recipe_cards_nutrition_shape;

-- Same body as 20261108130000_hand_edited_recipes plus nutrition:
--   - an out-of-shape value is stored as unknown, like an out-of-range estimate;
--   - no calories means no macros (they are a split of the calorie estimate);
--   - calories that change without nutrition clear it. App builds already in the stores remix,
--     revert and repair by writing the new calories straight to the row; without this the old
--     recipe's macros would show next to the new calories.
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
  if new.nutrition is not null and not public.recipe_nutrition_valid(new.nutrition) then
    new.nutrition := null;
  end if;
  if new.calories is null then
    new.nutrition := null;
  end if;
  if tg_op = 'UPDATE'
     and new.calories is distinct from old.calories
     and new.nutrition is not distinct from old.nutrition then
    new.nutrition := null;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_out_of_range_recipe_estimates() from public;

drop trigger if exists recipes_clear_out_of_range_estimates on public.recipes;
create trigger recipes_clear_out_of_range_estimates
  before insert or update of estimated_time_minutes, calories, nutrition on public.recipes
  for each row execute function public.clear_out_of_range_recipe_estimates();

-- Claiming a Hub card copies its nutrition into the user's library.
-- Same body as 20261023180331_recipe_appliances plus nutrition. CREATE OR REPLACE keeps the grants.
create or replace function public.claim_recipe_card(p_card_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid;
  card public.recipe_cards%rowtype;
  existing_id uuid;
  new_id uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform public.ensure_user_profile(uid);

  select * into card
  from public.recipe_cards
  where id = p_card_id;

  if not found then
    raise exception 'card_not_found';
  end if;

  existing_id := public.find_library_recipe_id(uid, p_card_id);
  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.recipes (
    user_id,
    title,
    original_url,
    platform,
    image_url,
    source_video_url,
    ingredients,
    instructions,
    servings,
    calories,
    nutrition,
    estimated_time_minutes,
    cost_estimate,
    effort_level,
    extraction_status,
    extraction_source,
    tags,
    source_language,
    is_favorite,
    migrated_from_guest,
    appliances
  )
  values (
    uid,
    card.title,
    coalesce(card.canonical_url, card.original_url),
    card.platform,
    card.image_url,
    card.source_video_url,
    card.ingredients,
    card.instructions,
    card.servings,
    card.calories,
    card.nutrition,
    card.estimated_time_minutes,
    card.cost_estimate,
    card.effort_level,
    card.extraction_status,
    card.extraction_source,
    card.tags,
    coalesce(card.source_language, 'en'),
    false,
    false,
    card.appliances
  )
  returning id into new_id;

  return new_id;
end;
$fn$;
