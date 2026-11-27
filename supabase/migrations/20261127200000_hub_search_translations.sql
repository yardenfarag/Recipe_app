-- Hub search in every app language. Until now a search only matched a card's title as written, so "rice" found
-- "Chicken Curry with Crunchy Coconut Rice" while the same card, shown in Hebrew as "קארי עוף עם אורז קוקוס פריך",
-- couldn't be found by "אורז". A card now matches when the text is in its own title or in any of its translated titles
-- (recipe_card_translations, PIN-77). Any language, not only the app's: the search doesn't know what language was typed.
--
-- Hebrew geresh and gershayim (׳ ״) match the ' and " a keyboard types, on both sides.
--
-- Expand only: hub_cards_for_cook and hub_cards keep their signatures, so every app build gets the fix (1.0.11 still
-- calls hub_cards). hub_cards_count is new: the apps fall back to counting title matches without it.

create or replace function public.hub_card_matches_search(p_card_id uuid, p_title text, p_search text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $fn$
  with needle as (
    select '%' || translate(p_search, '׳״', '''"') || '%' as pattern
  )
  select coalesce(p_search, '') = ''
    or translate(p_title, '׳״', '''"') ilike (select pattern from needle)
    or exists (
      select 1
      from public.recipe_card_translations t
      where t.card_id = p_card_id
        and translate(t.title, '׳״', '''"') ilike (select pattern from needle)
    );
$fn$;

comment on function public.hub_card_matches_search(uuid, text, text) is
  'A Hub card''s title or one of its translated titles contains the (already cleaned) search text.';

create or replace function public.hub_cards_for_cook(
  p_diets text[] default null,
  p_allergens text[] default null,
  p_dislikes text[] default null,
  p_allergy_words text[] default null,
  p_dislike_words text[] default null,
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
      coalesce(p_allergens, '{}'::text[]) as allergens,
      coalesce(p_dislikes, '{}'::text[]) as dislikes,
      public.hub_avoid_words(p_allergy_words) as allergy_words,
      public.hub_avoid_words(p_dislike_words) as dislike_words,
      -- Same cleanup as the app: no LIKE wildcards, at most 80 characters.
      left(trim(regexp_replace(coalesce(p_search, ''), '[%_\\]', '', 'g')), 80) as search,
      coalesce(p_tags, '{}'::text[]) as tags,
      p_sort is not distinct from 'newest' as newest
  )
  select c.*
  from public.recipe_cards c
  cross join params p
  cross join lateral (
    -- The ingredient names, read only when the cook typed foods in.
    select case
      when cardinality(p.allergy_words) + cardinality(p.dislike_words) = 0 then ''
      else coalesce((
        select string_agg(lower(coalesce(e->>'name', '')), ' | ')
        from jsonb_array_elements(case when jsonb_typeof(c.ingredients) = 'array' then c.ingredients else '[]'::jsonb end) e
      ), '')
    end as names
  ) n
  where (
      p_platform is null
      or p_platform = 'all'
      or (p_platform in ('youtube', 'instagram', 'tiktok', 'facebook', 'web') and c.platform = p_platform)
    )
    and (p.search = '' or public.hub_card_matches_search(c.id, c.title, p.search))
    and (cardinality(p.tags) = 0 or c.tags && p.tags)
  order by
    -- 1. Anything from the cook's allergies goes last.
    (
      coalesce(c.contains && p.allergens, false)
      or (cardinality(p.allergy_words) > 0 and public.hub_words_found(n.names, p.allergy_words) > 0)
    ) asc,
    -- 2. Cards that fit more of the cook's diets first.
    cardinality(array(
      select d from unnest(coalesce(c.diets, '{}'::text[])) d where d = any(p.diets)
    )) desc,
    -- 3. Fewer foods the cook doesn't like first.
    (
      cardinality(array(
        select k from unnest(coalesce(c.contains, '{}'::text[])) k where k = any(p.dislikes)
      ))
      + case when cardinality(p.dislike_words) > 0 then public.hub_words_found(n.names, p.dislike_words) else 0 end
    ) asc,
    case when p.newest then null else c.save_count end desc nulls last,
    c.created_at desc,
    c.id asc
  offset greatest(coalesce(p_offset, 0), 0)
  -- The app asks for one row more than a page (up to 3 pages on refresh) to know if more exist.
  limit least(greatest(coalesce(p_limit, 40), 1), 121);
$fn$;

-- 20261122230000_hub_facebook, with the same search. Builds before PIN-180 (1.0.11) call this one.
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
    and (p.search = '' or public.hub_card_matches_search(c.id, c.title, p.search))
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

-- How many cards the search and filters find, so the Hub's total agrees with its list. Diets and the avoid list only
-- change the order, so they don't count here.
create or replace function public.hub_cards_count(
  p_platform text default null,
  p_search text default null,
  p_tags text[] default null
)
returns integer
language sql
stable
security invoker
set search_path = public
as $fn$
  with params as (
    select
      left(trim(regexp_replace(coalesce(p_search, ''), '[%_\\]', '', 'g')), 80) as search,
      coalesce(p_tags, '{}'::text[]) as tags
  )
  select count(*)::integer
  from public.recipe_cards c, params p
  where (
      p_platform is null
      or p_platform = 'all'
      or (p_platform in ('youtube', 'instagram', 'tiktok', 'facebook', 'web') and c.platform = p_platform)
    )
    and (p.search = '' or public.hub_card_matches_search(c.id, c.title, p.search))
    and (cardinality(p.tags) = 0 or c.tags && p.tags);
$fn$;

revoke all on function public.hub_card_matches_search(uuid, text, text) from public;
revoke all on function public.hub_cards_count(text, text, text[]) from public;
grant execute on function public.hub_card_matches_search(uuid, text, text) to anon, authenticated;
grant execute on function public.hub_cards_count(text, text, text[]) to anon, authenticated;
