-- A Hub sorted for each cook (PIN-180): their diets first, as before (PIN-83), recipes with foods they
-- don't like lower, and recipes with their allergies last. Add-only: hub_cards stays as it is for the
-- app builds that still call it; drop it once no supported build does.
--
-- recipe_cards.contains lists the foods a card has as written: the avoid list's allergens and its
-- one-tap dislikes (the keys in shared/lib/avoidList.ts). NULL means "not checked yet". Only the
-- service role writes it, in the same model call as `diets`: extract-recipe after it publishes a
-- card, and the backfill-diets admin function, which re-checks every card whose `contains` is NULL.
--
-- Foods a cook typed in themselves have no key. For those the query looks for the word in the card's
-- ingredient names: at the start of a word for Latin letters, anywhere for other scripts (Hebrew and
-- Arabic attach prefixes to words). It only changes the order, so a loose match costs little.
--
-- Matching can miss an ingredient, so the order never promises a recipe is safe. The apps still flag
-- allergens inside every recipe.

alter table public.recipe_cards
  add column if not exists contains text[];

alter table public.recipe_cards
  drop constraint if exists recipe_cards_contains_size;

alter table public.recipe_cards
  add constraint recipe_cards_contains_size check (contains is null or cardinality(contains) <= 32);

comment on column public.recipe_cards.contains is
  'Allergen and common-dislike keys the card has as written (PIN-180). NULL = not checked yet.';

-- Typed foods, cleaned the way the app cleans them: lower case, at most 30 characters, at least 2,
-- no repeats, at most 20.
create or replace function public.hub_avoid_words(p_words text[])
returns text[]
language sql
immutable
set search_path = public
as $fn$
  select coalesce(array_agg(word), '{}'::text[])
  from (
    select distinct lower(left(trim(w), 30)) as word
    from unnest(coalesce(p_words, '{}'::text[])) w
    where char_length(trim(coalesce(w, ''))) >= 2
    limit 20
  ) words;
$fn$;

-- How many of the words appear in the text (the card's ingredient names, lower case).
create or replace function public.hub_words_found(p_text text, p_words text[])
returns integer
language sql
immutable
set search_path = public
as $fn$
  select count(*)::integer
  from unnest(coalesce(p_words, '{}'::text[])) w
  where case
    when w ~ '^[a-z0-9 ''-]+$'
      then p_text ~ ('(^|[^[:alpha:]])' || regexp_replace(w, '([^[:alnum:] ])', '\\\1', 'g'))
    else position(w in p_text) > 0
  end;
$fn$;

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
    and (p.search = '' or c.title ilike '%' || p.search || '%')
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

revoke all on function public.hub_avoid_words(text[]) from public;
revoke all on function public.hub_words_found(text, text[]) from public;
revoke all on function public.hub_cards_for_cook(text[], text[], text[], text[], text[], text, text, text[], text, integer, integer)
  from public;
grant execute on function public.hub_avoid_words(text[]) to anon, authenticated;
grant execute on function public.hub_words_found(text, text[]) to anon, authenticated;
grant execute on function public.hub_cards_for_cook(text[], text[], text[], text[], text[], text, text, text[], text, integer, integer)
  to anon, authenticated;
