-- Kitchen appliances on recipes and Hub cards (PIN-26, ADR 017).
--
-- appliances is a JSON array of { key, required, benefit?, alternative?, steps, origin }.
-- NULL means "not analysed" (every row saved before this migration; the app shows nothing).
-- [] means "analysed, needs no appliances".
-- Item contents are validated in code (src/lib/appliances.ts, sanitizeRecipeAppliances) so the
-- appliance catalog lives in one place; SQL only guards the shape and size.
--
-- Safe for app builds already in the stores: the column is nullable with no default, and they
-- never read or write it.
-- Apply this before deploying any Edge Function or app code that writes appliances.

alter table public.recipes add column if not exists appliances jsonb;
alter table public.recipe_cards add column if not exists appliances jsonb;

comment on column public.recipes.appliances is
  'Kitchen appliances the recipe uses (ADR 017). NULL = not analysed, [] = none needed. Validated by sanitizeRecipeAppliances.';
comment on column public.recipe_cards.appliances is
  'Copied from the recipe that published the card (ADR 017). NULL = not analysed, [] = none needed.';

-- A client can write its own recipes through RLS, and a recipe's appliances are copied to the
-- public Hub, so cap the shape and size here as well as in code. 12 = MAX_RECIPE_APPLIANCES.
-- NOT VALID + VALIDATE avoids holding a long lock while existing rows are checked.
alter table public.recipes drop constraint if exists recipes_appliances_shape;
alter table public.recipes add constraint recipes_appliances_shape check (
  appliances is null
  or (jsonb_typeof(appliances) = 'array' and jsonb_array_length(appliances) <= 12)
) not valid;
alter table public.recipes validate constraint recipes_appliances_shape;

alter table public.recipe_cards drop constraint if exists recipe_cards_appliances_shape;
alter table public.recipe_cards add constraint recipe_cards_appliances_shape check (
  appliances is null
  or (jsonb_typeof(appliances) = 'array' and jsonb_array_length(appliances) <= 12)
) not valid;
alter table public.recipe_cards validate constraint recipe_cards_appliances_shape;

-- No index: nothing filters by appliance yet (ADR 017 decision 1).

-- Claiming a Hub card copies its appliances into the user's library.
-- Same body as 0037 plus appliances. CREATE OR REPLACE keeps the grants from 0043.
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

-- Publishing a saved recipe to the Hub carries its appliances. When the card already exists,
-- fill appliances only if the card has none yet, the same way image_url is handled.
-- Same body as 0037 plus appliances.
create or replace function public.bump_recipe_card_on_recipe_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  card_key text;
  card_url text;
  hub_opt_in boolean;
  can_publish boolean;
begin
  if new.original_url is null then
    return new;
  end if;
  if new.platform is null or new.platform not in ('youtube', 'instagram', 'tiktok', 'web') then
    return new;
  end if;
  if new.extraction_source is not distinct from 'invented' then
    return new;
  end if;
  if new.extraction_source is not distinct from 'photo' then
    return new;
  end if;

  hub_opt_in := coalesce(
    (
      select p.contribute_to_hub
      from public.profiles as p
      where p.id = new.user_id
    ),
    true
  );

  card_key := public.recipe_card_canonical_key(new.platform, new.original_url);
  card_url := public.recipe_card_canonical_url(new.platform, new.original_url);
  can_publish :=
    hub_opt_in
    and card_key is not null
    and card_url is not null
    and new.extraction_status = 'full'
    and length(trim(new.title)) > 0
    and jsonb_typeof(new.ingredients) = 'array'
    and jsonb_typeof(new.instructions) = 'array'
    and jsonb_array_length(new.ingredients) >= 2
    and jsonb_array_length(new.instructions) >= 2;

  if can_publish then
    insert into public.recipe_cards (
      canonical_key,
      canonical_url,
      original_url,
      platform,
      title,
      image_url,
      source_video_url,
      ingredients,
      instructions,
      servings,
      calories,
      estimated_time_minutes,
      cost_estimate,
      effort_level,
      extraction_status,
      extraction_source,
      tags,
      source_language,
      save_count,
      updated_at,
      appliances
    )
    values (
      card_key,
      card_url,
      card_url,
      new.platform,
      trim(new.title),
      new.image_url,
      new.source_video_url,
      new.ingredients,
      new.instructions,
      greatest(coalesce(new.servings, 1), 1),
      new.calories,
      new.estimated_time_minutes,
      case
        when new.cost_estimate in (chr(36), chr(36) || chr(36), chr(36) || chr(36) || chr(36))
        then new.cost_estimate
      end,
      case when new.effort_level in ('Easy', 'Medium', 'Hard') then new.effort_level end,
      'full',
      new.extraction_source,
      coalesce(new.tags, '{}'),
      coalesce(new.source_language, 'en'),
      0,
      now(),
      new.appliances
    )
    on conflict (canonical_key) do update
      set
        image_url = coalesce(public.recipe_cards.image_url, excluded.image_url),
        appliances = coalesce(public.recipe_cards.appliances, excluded.appliances),
        updated_at = now();
  end if;

  if card_key is not null then
    update public.recipe_cards
    set save_count = save_count + 1
    where canonical_key = card_key;
  end if;

  return new;
end;
$fn$;
