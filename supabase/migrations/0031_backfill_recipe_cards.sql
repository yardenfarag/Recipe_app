-- Backfill Cooking Hub cards from existing private library extracts.
-- Safe to re-run. Does not copy invented recipes, photo snaps, or partials.
-- Paste this whole file in the SQL Editor after 0030_cooking_hub.sql.

create or replace function public.recipe_card_canonical_key(p_platform text, p_url text)
returns text
language plpgsql
immutable
as $fn$
declare
  youtube_id text;
  ig_id text;
  tt_id text;
  web_url text;
begin
  if p_platform is null or p_url is null or length(trim(p_url)) = 0 then
    return null;
  end if;

  if p_platform = 'youtube' then
    youtube_id := coalesce(
      (regexp_match(p_url, '[?&]v=([A-Za-z0-9_-]{11})'))[1],
      (regexp_match(p_url, 'youtu\.be/([A-Za-z0-9_-]{11})'))[1],
      (regexp_match(p_url, '/(shorts|embed)/([A-Za-z0-9_-]{11})'))[2]
    );
    if youtube_id is null then
      return null;
    end if;
    return 'youtube:' || youtube_id;
  end if;

  if p_platform = 'instagram' then
    ig_id := (regexp_match(p_url, '/(reel|reels|p|tv)/([A-Za-z0-9_-]+)'))[2];
    if ig_id is null then
      return null;
    end if;
    return 'instagram:' || ig_id;
  end if;

  if p_platform = 'tiktok' then
    tt_id := (regexp_match(p_url, '/video/(\d+)'))[1];
    if tt_id is null then
      return null;
    end if;
    return 'tiktok:' || tt_id;
  end if;

  if p_platform = 'web' then
    web_url := trim(p_url);
    web_url := split_part(web_url, '#', 1);
    web_url := regexp_replace(web_url, '[?&](utm_[^=&]+|fbclid|gclid|mc_[^=&]+|ref)=[^&]*', '', 'gi');
    web_url := regexp_replace(web_url, '[?&]$', '');
    web_url := regexp_replace(web_url, '^(https?://)www\.', '\1', 'i');
    if length(web_url) > 1 and right(web_url, 1) = '/' then
      web_url := left(web_url, length(web_url) - 1);
    end if;
    return 'web:' || web_url;
  end if;

  return null;
end;
$fn$;

create or replace function public.recipe_card_canonical_url(p_platform text, p_url text)
returns text
language plpgsql
immutable
as $fn$
declare
  key text;
  content_id text;
begin
  key := public.recipe_card_canonical_key(p_platform, p_url);
  if key is null then
    return null;
  end if;
  content_id := split_part(key, ':', 2);
  if p_platform = 'youtube' then
    return 'https://www.youtube.com/watch?v=' || content_id;
  end if;
  if p_platform = 'instagram' then
    return 'https://www.instagram.com/p/' || content_id || '/';
  end if;
  if p_platform = 'tiktok' then
    return 'https://www.tiktok.com/video/' || content_id;
  end if;
  return p_url;
end;
$fn$;

create or replace function public.backfill_recipe_cards()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  before_count integer := 0;
  after_count integer := 0;
begin
  select count(*)::int into before_count from public.recipe_cards;

  with eligible as (
    select
      r.*,
      public.recipe_card_canonical_key(r.platform, r.original_url) as canonical_key,
      public.recipe_card_canonical_url(r.platform, r.original_url) as canonical_url
    from public.recipes r
    where r.platform in ('youtube', 'instagram', 'tiktok', 'web')
      and r.extraction_status = 'full'
      and r.extraction_source is distinct from 'invented'
      and r.extraction_source is distinct from 'photo'
      and r.original_url is not null
      and length(trim(r.title)) > 0
      and jsonb_typeof(r.ingredients) = 'array'
      and jsonb_typeof(r.instructions) = 'array'
      and jsonb_array_length(r.ingredients) >= 2
      and jsonb_array_length(r.instructions) >= 2
  ),
  keyed as (
    select *
    from eligible
    where canonical_key is not null
  ),
  ranked as (
    select
      *,
      row_number() over (
        partition by canonical_key
        order by
          (image_url is not null and length(image_url) > 0) desc,
          created_at asc nulls last,
          id asc
      ) as pick_rank
    from keyed
  ),
  picked as (
    select * from ranked where pick_rank = 1
  ),
  counts as (
    select canonical_key, count(*)::int as save_count
    from keyed
    group by canonical_key
  )
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
  select
    p.canonical_key,
    p.canonical_url,
    p.canonical_url,
    p.platform,
    trim(p.title),
    p.image_url,
    p.source_video_url,
    p.ingredients,
    p.instructions,
    greatest(coalesce(p.servings, 1), 1),
    p.calories,
    p.estimated_time_minutes,
    case
      when p.cost_estimate in (chr(36), chr(36) || chr(36), chr(36) || chr(36) || chr(36))
      then p.cost_estimate
    end,
    case when p.effort_level in ('Easy', 'Medium', 'Hard') then p.effort_level end,
    'full',
    p.extraction_source,
    coalesce(p.tags, '{}'),
    coalesce(p.source_language, 'en'),
    c.save_count,
    now()
  from picked p
  join counts c using (canonical_key)
  on conflict (canonical_key) do update
    set
      save_count = excluded.save_count,
      image_url = coalesce(public.recipe_cards.image_url, excluded.image_url),
      updated_at = now();

  select count(*)::int into after_count from public.recipe_cards;
  return greatest(after_count - before_count, 0);
end;
$fn$;

comment on function public.backfill_recipe_cards() is
  'Copies eligible public-link extracts into recipe_cards. Idempotent.';

revoke all on function public.backfill_recipe_cards() from public;
revoke all on function public.recipe_card_canonical_key(text, text) from public;
revoke all on function public.recipe_card_canonical_url(text, text) from public;

select public.backfill_recipe_cards() as hub_cards_inserted;
