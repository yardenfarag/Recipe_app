-- Show Hub recipes that fit the user's diets first (PIN-83).
--
-- recipe_cards.diets lists the kitchen-profile diets a card already fits as written
-- (vegan, keto, ...). NULL means "not checked yet". Only the service role writes it:
-- extract-recipe after it publishes a card, and the backfill-diets admin function.
--
-- hub_cards() is the Hub's list query. It filters like the old PostgREST query and
-- orders by how many of the viewer's diets a card fits, then by the chosen sort.
-- With no diets passed, the order is exactly the old one. Diets come from the
-- caller because guests keep their kitchen profile on the device.

alter table public.recipe_cards
  add column if not exists diets text[];

alter table public.recipe_cards
  drop constraint if exists recipe_cards_diets_size;
alter table public.recipe_cards
  add constraint recipe_cards_diets_size check (diets is null or cardinality(diets) <= 16);

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
      or (p_platform in ('youtube', 'instagram', 'tiktok', 'web') and c.platform = p_platform)
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
