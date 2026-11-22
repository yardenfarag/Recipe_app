-- AI pictures for recipes that have no photo (Hub cards whose site blocked the image download,
-- written recipes saved without a photo). The apps put a small "AI image" mark on them, so the
-- flag travels with the picture: from a Hub card into a library copy, and off again when the
-- user puts in a photo of their own.
--
-- Expand only: two columns with defaults, one more allowed value in recalc_pending, and
-- claim_recipe_card copying the new column. Older apps ignore all three.

alter table public.recipes
  add column if not exists image_generated boolean not null default false;
comment on column public.recipes.image_generated is
  'image_url is a picture Pinch drew with an image model, not a photo of the dish. The apps mark it.';

alter table public.recipe_cards
  add column if not exists image_generated boolean not null default false;
comment on column public.recipe_cards.image_generated is
  'image_url is a picture Pinch drew with an image model, not a photo of the dish. The apps mark it.';

-- 'image': save-recipe-edit is drawing a picture for a recipe saved without one. The recipe page
-- shows a loader in its place until it arrives (ADR 018's "Updating…" mechanism).
alter table public.recipes drop constraint if exists recipes_recalc_pending_known;
alter table public.recipes add constraint recipes_recalc_pending_known check (
  recalc_pending <@ array[
    'calories', 'estimated_time_minutes', 'effort_level', 'cost_estimate', 'tags', 'appliances',
    'ingredient_amounts', 'image'
  ]::text[]
);

-- Same as 20261122140000_recipe_nutrition.sql, plus image_generated.
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
    image_generated,
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
    card.image_generated,
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
