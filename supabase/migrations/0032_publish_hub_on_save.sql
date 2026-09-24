-- Publish eligible library saves into the Cooking Hub.
-- Paste in the SQL Editor after 0030 and 0031. No CLI.

alter table public.profiles
  add column if not exists contribute_to_hub boolean not null default true;

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
      updated_at
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
      now()
    )
    on conflict (canonical_key) do update
      set
        image_url = coalesce(public.recipe_cards.image_url, excluded.image_url),
        updated_at = now();
  end if;

  update public.recipe_cards
  set save_count = save_count + 1
  where original_url = new.original_url
     or canonical_url = new.original_url
     or (card_key is not null and canonical_key = card_key);

  return new;
end;
$fn$;
