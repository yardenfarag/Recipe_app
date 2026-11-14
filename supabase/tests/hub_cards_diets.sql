begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

-- Four cards. Popular order without diets: Steak (9 saves), Salad (5), Salmon (3), Pasta (1).
insert into public.recipe_cards (
  id, canonical_key, canonical_url, original_url, platform, title,
  ingredients, instructions, servings, extraction_status, extraction_source, tags,
  save_count, created_at, diets
)
values
  ('40000000-0000-4000-8000-000000000001', 'web:https://example.com/d-steak', 'https://example.com/d-steak',
   'https://example.com/d-steak', 'web', 'Diet Steak', '[]', '[]', 2, 'full', 'web', array['beef'],
   9, now() - interval '4 days', array['gluten_free', 'low_carb', 'keto']),
  ('40000000-0000-4000-8000-000000000002', 'web:https://example.com/d-salad', 'https://example.com/d-salad',
   'https://example.com/d-salad', 'web', 'Diet Salad', '[]', '[]', 2, 'full', 'web', array['salad'],
   5, now() - interval '3 days', array['vegan', 'vegetarian', 'pescatarian', 'dairy_free', 'gluten_free']),
  ('40000000-0000-4000-8000-000000000003', 'youtube:dsalmon', 'https://example.com/d-salmon',
   'https://example.com/d-salmon', 'youtube', 'Diet Salmon', '[]', '[]', 2, 'full', 'youtube', array['fish'],
   3, now() - interval '2 days', array['pescatarian', 'gluten_free']),
  ('40000000-0000-4000-8000-000000000004', 'web:https://example.com/d-pasta', 'https://example.com/d-pasta',
   'https://example.com/d-pasta', 'web', 'Diet Pasta', '[]', '[]', 2, 'full', 'web', array['pasta'],
   1, now() - interval '1 day', null);

create temp table diet_ids as
select '40000000-0000-4000-8000-00000000000' || n as id from generate_series(1, 4) n;
grant select on diet_ids to anon;

set local role anon;

select is(
  array(select title from public.hub_cards(null) where id::text in (select id from diet_ids)),
  array['Diet Steak', 'Diet Salad', 'Diet Salmon', 'Diet Pasta'],
  'no diets: popular order is unchanged'
);

select is(
  array(select title from public.hub_cards(null, p_sort => 'newest') where id::text in (select id from diet_ids)),
  array['Diet Pasta', 'Diet Salmon', 'Diet Salad', 'Diet Steak'],
  'no diets: newest order is unchanged'
);

select is(
  array(select title from public.hub_cards(array['pescatarian']) where id::text in (select id from diet_ids)),
  array['Diet Salad', 'Diet Salmon', 'Diet Steak', 'Diet Pasta'],
  'matching cards come first, popular order inside each group'
);

select is(
  array(select title from public.hub_cards(array['pescatarian'], p_sort => 'newest') where id::text in (select id from diet_ids)),
  array['Diet Salmon', 'Diet Salad', 'Diet Pasta', 'Diet Steak'],
  'matching cards come first, newest order inside each group'
);

select is(
  array(select title from public.hub_cards(array['gluten_free', 'pescatarian']) where id::text in (select id from diet_ids)),
  array['Diet Salad', 'Diet Salmon', 'Diet Steak', 'Diet Pasta'],
  'cards that fit more of the viewer''s diets rank higher'
);

select is(
  array(select title from public.hub_cards(array['healthier']) where id::text in (select id from diet_ids)),
  array['Diet Steak', 'Diet Salad', 'Diet Salmon', 'Diet Pasta'],
  'a diet no card has changes nothing'
);

select is(
  array(select title from public.hub_cards(array['vegan'], p_platform => 'youtube') where id::text in (select id from diet_ids)),
  array['Diet Salmon'],
  'the platform filter still applies'
);

select is(
  array(select title from public.hub_cards(array['vegan'], p_search => 'sal%', p_tags => array['fish', 'salad']) where id::text in (select id from diet_ids)),
  array['Diet Salad', 'Diet Salmon'],
  'search (wildcards stripped) and tag filters still apply'
);

reset role;

select throws_ok(
  $$update public.recipe_cards set diets = array_fill('vegan'::text, array[17])
    where id = '40000000-0000-4000-8000-000000000004'$$,
  '23514',
  null,
  'diets is capped at 16 entries'
);

select * from finish();
rollback;
