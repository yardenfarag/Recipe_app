-- Cooking Hub fixes: one card per web URL, idempotent claims, stable pages.
-- Paste in the SQL Editor after 0032_publish_hub_on_save.sql. No CLI.

create or replace function public.recipe_card_canonical_web_url(p_url text)
returns text
language plpgsql
immutable
set search_path = public
as $fn$
declare
  raw text := trim(p_url);
  hashless text;
  base text;
  query text;
  scheme text;
  rest text;
  host text;
  path text;
  slash int;
  scheme_end int;
  pair text;
  eq int;
  key text;
  val text;
  kept text := '';
  qpos int;
begin
  if raw is null or length(raw) = 0 then
    return null;
  end if;

  hashless := split_part(raw, '#', 1);
  qpos := position('?' in hashless);
  if qpos > 0 then
    base := substr(hashless, 1, qpos - 1);
    query := substr(hashless, qpos + 1);
  else
    base := hashless;
    query := null;
  end if;

  scheme_end := position('://' in lower(base));
  if scheme_end = 0 then
    return null;
  end if;
  scheme := lower(substr(base, 1, scheme_end - 1));
  rest := substr(base, scheme_end + 3);
  if scheme not in ('http', 'https') or rest is null or length(rest) = 0 then
    return null;
  end if;

  slash := position('/' in rest);
  if slash = 0 then
    host := rest;
    path := '/';
  else
    host := substr(rest, 1, slash - 1);
    path := substr(rest, slash);
  end if;

  host := lower(host);
  if scheme = 'https' and right(host, 4) = ':443' then
    host := left(host, length(host) - 4);
  elsif scheme = 'http' and right(host, 3) = ':80' then
    host := left(host, length(host) - 3);
  end if;
  if left(host, 4) = 'www.' then
    host := substr(host, 5);
  end if;
  if length(host) = 0 then
    return null;
  end if;

  if path is null or length(path) = 0 then
    path := '/';
  elsif length(path) > 1 and right(path, 1) = '/' then
    path := left(path, length(path) - 1);
  end if;

  while query is not null and length(query) > 0 loop
    if position('&' in query) > 0 then
      pair := split_part(query, '&', 1);
      query := substr(query, length(pair) + 2);
    else
      pair := query;
      query := '';
    end if;
    if pair is null or length(pair) = 0 then
      continue;
    end if;
    eq := position('=' in pair);
    if eq = 0 then
      key := pair;
      val := '';
    else
      key := substr(pair, 1, eq - 1);
      val := substr(pair, eq + 1);
    end if;
    if length(key) = 0 then
      continue;
    end if;
    if lower(key) = 'ref'
       or left(lower(key), 4) = 'utm_'
       or left(lower(key), 6) = 'fbclid'
       or left(lower(key), 5) = 'gclid'
       or left(lower(key), 3) = 'mc_' then
      continue;
    end if;
    if length(kept) = 0 then
      kept := key || '=' || val;
    else
      kept := kept || '&' || key || '=' || val;
    end if;
  end loop;

  if length(kept) = 0 then
    return scheme || '://' || host || path;
  end if;
  return scheme || '://' || host || path || '?' || kept;
end;
$fn$;

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
    web_url := public.recipe_card_canonical_web_url(p_url);
    if web_url is null then
      return null;
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
set search_path = public
as $fn$
declare
  key text;
  content_id text;
begin
  key := public.recipe_card_canonical_key(p_platform, p_url);
  if key is null then
    return null;
  end if;
  if p_platform = 'web' then
    return substr(key, 5);
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
  return null;
end;
$fn$;

revoke all on function public.recipe_card_canonical_web_url(text) from public;
revoke all on function public.recipe_card_canonical_key(text, text) from public;
revoke all on function public.recipe_card_canonical_url(text, text) from public;

-- Collapse cards that the old web canonicalizer split apart.
drop table if exists recipe_card_rekey;

create temp table recipe_card_rekey as
select
  id,
  save_count,
  extract_hit_count,
  image_url,
  created_at,
  public.recipe_card_canonical_key(platform, coalesce(canonical_url, original_url)) as new_key,
  public.recipe_card_canonical_url(platform, coalesce(canonical_url, original_url)) as new_url
from public.recipe_cards;

update public.recipe_cards c
set canonical_key = 'rekey:' || c.id::text
from recipe_card_rekey r
where c.id = r.id
  and r.new_key is not null;

delete from public.recipe_cards c
using (
  select
    id,
    row_number() over (
      partition by new_key
      order by created_at asc, id asc
    ) as rn
  from recipe_card_rekey
  where new_key is not null
) ranked
where c.id = ranked.id
  and ranked.rn > 1;

update public.recipe_cards c
set
  canonical_key = k.new_key,
  canonical_url = coalesce(k.new_url, c.canonical_url),
  save_count = k.total_saves,
  extract_hit_count = k.total_hits,
  image_url = coalesce(c.image_url, k.any_image),
  updated_at = now()
from (
  select
    id,
    new_key,
    new_url,
    sum(save_count) over (partition by new_key) as total_saves,
    sum(extract_hit_count) over (partition by new_key) as total_hits,
    first_value(image_url) over (
      partition by new_key
      order by (image_url is not null and length(image_url) > 0) desc
      rows between unbounded preceding and unbounded following
    ) as any_image,
    row_number() over (
      partition by new_key
      order by created_at asc, id asc
    ) as rn
  from recipe_card_rekey
  where new_key is not null
) k
where c.id = k.id
  and k.rn = 1;

drop table if exists recipe_card_rekey;

create or replace function public.find_library_recipe_id(p_user_id uuid, p_card_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  card public.recipe_cards%rowtype;
  card_key text;
  existing_id uuid;
begin
  if p_user_id is null or p_card_id is null then
    return null;
  end if;

  select * into card
  from public.recipe_cards
  where id = p_card_id;

  if not found then
    return null;
  end if;

  card_key := public.recipe_card_canonical_key(
    card.platform,
    coalesce(card.canonical_url, card.original_url)
  );

  select r.id into existing_id
  from public.recipes r
  where r.user_id = p_user_id
    and r.extraction_source is distinct from 'invented'
    and r.extraction_source is distinct from 'photo'
    and (
      (
        card_key is not null
        and public.recipe_card_canonical_key(r.platform, r.original_url) = card_key
      )
      or (
        card_key is null
        and r.original_url = card.original_url
      )
    )
  order by r.created_at asc, r.id asc
  limit 1;

  return existing_id;
end;
$fn$;

revoke all on function public.find_library_recipe_id(uuid, uuid) from public;

create or replace function public.library_recipe_for_card(p_card_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null then
    return null;
  end if;
  return public.find_library_recipe_id(auth.uid(), p_card_id);
end;
$fn$;

revoke all on function public.library_recipe_for_card(uuid) from public;
grant execute on function public.library_recipe_for_card(uuid) to authenticated;

create or replace function public.library_recipe_for_url(p_platform text, p_url text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  uid uuid;
  card_key text;
  existing_id uuid;
begin
  uid := auth.uid();
  if uid is null or p_url is null or length(trim(p_url)) = 0 then
    return null;
  end if;

  card_key := public.recipe_card_canonical_key(p_platform, p_url);

  select r.id into existing_id
  from public.recipes r
  where r.user_id = uid
    and r.extraction_source is distinct from 'invented'
    and r.extraction_source is distinct from 'photo'
    and (
      (
        card_key is not null
        and public.recipe_card_canonical_key(r.platform, r.original_url) = card_key
      )
      or (
        card_key is null
        and r.original_url = trim(p_url)
      )
    )
  order by r.created_at asc, r.id asc
  limit 1;

  return existing_id;
end;
$fn$;

revoke all on function public.library_recipe_for_url(text, text) from public;
grant execute on function public.library_recipe_for_url(text, text) to authenticated;

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
    migrated_from_guest
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
    false
  )
  returning id into new_id;

  return new_id;
end;
$fn$;

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

  if card_key is not null then
    update public.recipe_cards
    set save_count = save_count + 1
    where canonical_key = card_key;
  end if;

  return new;
end;
$fn$;

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
  if old.platform is null or old.platform not in ('youtube', 'instagram', 'tiktok', 'web') then
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

drop trigger if exists recipes_drop_recipe_card_save_count on public.recipes;
create trigger recipes_drop_recipe_card_save_count
  after delete on public.recipes
  for each row execute procedure public.drop_recipe_card_on_recipe_delete();

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
        p_platform in ('youtube', 'instagram', 'tiktok', 'web')
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

drop index if exists public.recipe_cards_popularity_idx;
create index recipe_cards_popularity_idx
  on public.recipe_cards (save_count desc, created_at desc, id asc);

create index if not exists recipe_cards_newest_idx
  on public.recipe_cards (created_at desc, id asc);

do $trgm$
declare
  opclass text;
begin
  create extension if not exists pg_trgm;
  select n.nspname || '.gin_trgm_ops'
    into opclass
  from pg_opclass c
  join pg_namespace n on n.oid = c.opcnamespace
  where c.opcname = 'gin_trgm_ops'
  limit 1;
  if opclass is null then
    raise exception 'gin_trgm_ops is not available';
  end if;
  execute format(
    'create index if not exists recipe_cards_title_trgm_idx on public.recipe_cards using gin (title %s)',
    opclass
  );
end
$trgm$;
