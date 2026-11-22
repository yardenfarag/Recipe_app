-- Facebook recipes in the Cooking Hub.
--
-- ADR 021 left Facebook out of the Hub until the SQL side was done. This is that work. Add-only:
-- every platform allowed before is still allowed, and every function keeps its signature.
--
-- extract-recipe publishes a Facebook card under 'facebook:<id>', where the id is the reel's
-- video id or the post id (extractFacebookId in _shared/extraction/platform.ts). The key function
-- below reads the same id from a saved recipe's original_url, so saves and deletes count towards
-- the right card.
--
-- Pinterest stays out on purpose (ADR 029: Pinterest's developer guidelines).

alter table public.recipe_cards
  drop constraint if exists recipe_cards_platform_check;

alter table public.recipe_cards
  add constraint recipe_cards_platform_check
  check (platform in ('youtube', 'instagram', 'tiktok', 'facebook', 'web'));

-- 0037_cooking_hub_fixes, plus the 'facebook' branch.
create or replace function public.recipe_card_canonical_key(p_platform text, p_url text)
returns text
language plpgsql
immutable
set search_path = public
as $fn$
declare
  youtube_id text;
  ig_id text;
  tt_id text;
  fb_id text;
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

  if p_platform = 'facebook' then
    -- Same order as extractFacebookId: the id in the path, then v, story_fbid or fbid.
    fb_id := coalesce(
      (regexp_match(p_url, '^[a-z]+://[^/?#]+[^?#]*/(reel|videos|posts|permalink)/([^/?#]+/)?(\d{5,})(/|[?#]|$)', 'i'))[3],
      (regexp_match(p_url, '[?&]v=(\d{5,})(&|#|$)'))[1],
      (regexp_match(p_url, '[?&]story_fbid=(\d{5,})(&|#|$)'))[1],
      (regexp_match(p_url, '[?&]fbid=(\d{5,})(&|#|$)'))[1]
    );
    if fb_id is null then
      return null;
    end if;
    return 'facebook:' || fb_id;
  end if;

  if p_platform = 'web' then
    web_url := public.recipe_card_canonical_web_url(p_url);
    if web_url is null then
      return null;
    end if;
    return 'web:' || web_url;
  end if;

  return null;
end;
$fn$;

revoke all on function public.recipe_card_canonical_key(text, text) from public;

-- 20261102190000_hub_cards_from_server_only, with 'facebook' in the platform list.
create or replace function public.bump_recipe_card_on_recipe_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  card_key text;
begin
  if new.original_url is null then
    return new;
  end if;
  if new.platform is null or new.platform not in ('youtube', 'instagram', 'tiktok', 'facebook', 'web') then
    return new;
  end if;
  if new.extraction_source is not distinct from 'invented' then
    return new;
  end if;
  if new.extraction_source is not distinct from 'photo' then
    return new;
  end if;

  card_key := public.recipe_card_canonical_key(new.platform, new.original_url);
  if card_key is not null then
    update public.recipe_cards
    set save_count = save_count + 1
    where canonical_key = card_key;
  end if;

  return new;
end;
$fn$;

revoke all on function public.bump_recipe_card_on_recipe_insert() from public, anon, authenticated;

-- 0037_cooking_hub_fixes, with 'facebook' in the platform list.
create or replace function public.drop_recipe_card_on_recipe_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  card_key text;
begin
  if old.original_url is null then
    return old;
  end if;
  if old.platform is null or old.platform not in ('youtube', 'instagram', 'tiktok', 'facebook', 'web') then
    return old;
  end if;
  if old.extraction_source is not distinct from 'invented' then
    return old;
  end if;
  if old.extraction_source is not distinct from 'photo' then
    return old;
  end if;

  card_key := public.recipe_card_canonical_key(old.platform, old.original_url);
  if card_key is null then
    return old;
  end if;

  update public.recipe_cards
  set save_count = greatest(save_count - 1, 0)
  where canonical_key = card_key;

  return old;
end;
$fn$;

-- 0037_cooking_hub_fixes, with 'facebook' in the source filter.
create or replace function public.hub_popular_tags(p_platform text default null, p_limit integer default 12)
returns table (tag text)
language sql
stable
security invoker
set search_path = public
as $fn$
  select t.tag
  from (
    select c.tags
    from public.recipe_cards c
    where p_platform is null
      or p_platform = 'all'
      or (
        p_platform in ('youtube', 'instagram', 'tiktok', 'facebook', 'web')
        and c.platform = p_platform
      )
    order by c.save_count desc, c.created_at desc, c.id asc
    limit 200
  ) popular
  cross join lateral unnest(popular.tags) as t(tag)
  where length(trim(t.tag)) > 0
  group by t.tag
  order by count(*) desc, t.tag
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$fn$;

revoke all on function public.hub_popular_tags(text, integer) from public;
grant execute on function public.hub_popular_tags(text, integer) to anon, authenticated;

-- 20261114120000_hub_cards_diets, with 'facebook' in the source filter.
create or replace function public.hub_cards(
  p_diets text[] default null,
  p_platform text default null,
  p_search text default null,
  p_tags text[] default null,
  p_sort text default 'popular',
  p_offset integer default 0,
  p_limit integer default 40
)
returns setof public.recipe_cards
language sql
stable
security invoker
set search_path = public
as $fn$
  with params as (
    select
      coalesce(p_diets, '{}'::text[]) as diets,
      -- Same cleanup as the app: no LIKE wildcards, at most 80 characters.
      left(trim(regexp_replace(coalesce(p_search, ''), '[%_\\]', '', 'g')), 80) as search,
      coalesce(p_tags, '{}'::text[]) as tags,
      p_sort is not distinct from 'newest' as newest
  )
  select c.*
  from public.recipe_cards c, params p
  where (
      p_platform is null
      or p_platform = 'all'
      or (p_platform in ('youtube', 'instagram', 'tiktok', 'facebook', 'web') and c.platform = p_platform)
    )
    and (p.search = '' or c.title ilike '%' || p.search || '%')
    and (cardinality(p.tags) = 0 or c.tags && p.tags)
  order by
    cardinality(array(
      select d from unnest(coalesce(c.diets, '{}'::text[])) d where d = any(p.diets)
    )) desc,
    case when p.newest then null else c.save_count end desc nulls last,
    c.created_at desc,
    c.id asc
  offset greatest(coalesce(p_offset, 0), 0)
  -- The app asks for one row more than a page (up to 3 pages on refresh) to know if more exist.
  limit least(greatest(coalesce(p_limit, 40), 1), 121);
$fn$;

revoke all on function public.hub_cards(text[], text, text, text[], text, integer, integer) from public;
grant execute on function public.hub_cards(text[], text, text, text[], text, integer, integer)
  to anon, authenticated;
