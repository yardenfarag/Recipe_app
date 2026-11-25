begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

-- Five cards. Popular order with no cook: Burger (9 saves), Shrimp (7), Salad (5), Stew (3), Toast (1).
insert into public.recipe_cards (
  id, canonical_key, canonical_url, original_url, platform, title,
  ingredients, instructions, servings, extraction_status, extraction_source, tags,
  save_count, created_at, diets, contains
)
values
  ('41000000-0000-4000-8000-000000000001', 'web:https://example.com/c-burger', 'https://example.com/c-burger',
   'https://example.com/c-burger', 'web', 'Cook Burger',
   '[{"name": "beef patty"}, {"name": "cheddar"}, {"name": "onion"}, {"name": "bun"}]', '[]', 2, 'full', 'web',
   array['beef'], 9, now() - interval '5 days', array['halal'], array['milk', 'gluten', 'onion']),
  ('41000000-0000-4000-8000-000000000002', 'web:https://example.com/c-shrimp', 'https://example.com/c-shrimp',
   'https://example.com/c-shrimp', 'web', 'Cook Shrimp',
   '[{"name": "shrimp"}, {"name": "spaghetti"}, {"name": "garlic"}]', '[]', 2, 'full', 'web',
   array['pasta'], 7, now() - interval '4 days', array['pescatarian', 'halal'], array['shellfish', 'gluten', 'garlic']),
  ('41000000-0000-4000-8000-000000000003', 'web:https://example.com/c-salad', 'https://example.com/c-salad',
   'https://example.com/c-salad', 'web', 'Cook Salad',
   '[{"name": "cucumber"}, {"name": "Kalamata olives"}, {"name": "olive oil"}]', '[]', 2, 'full', 'web',
   array['salad'], 5, now() - interval '3 days', array['vegan', 'halal', 'kosher'], array['olives']),
  ('41000000-0000-4000-8000-000000000004', 'web:https://example.com/c-stew', 'https://example.com/c-stew',
   'https://example.com/c-stew', 'web', 'Cook Stew',
   '[{"name": "beef"}, {"name": "red wine"}, {"name": "כוסברה טרייה"}]', '[]', 2, 'full', 'web',
   array['beef'], 3, now() - interval '2 days', array['kosher'], array['cilantro']),
  ('41000000-0000-4000-8000-000000000005', 'web:https://example.com/c-toast', 'https://example.com/c-toast',
   'https://example.com/c-toast', 'web', 'Cook Toast',
   '[{"name": "bread"}, {"name": "avocado"}, {"name": "peppercorns"}]', '[]', 2, 'full', 'web',
   array['bread'], 1, now() - interval '1 day', null, null);

create temp table cook_ids as
select '41000000-0000-4000-8000-00000000000' || n as id from generate_series(1, 5) n;
grant select on cook_ids to anon;

set local role anon;

select is(
  array(select title from public.hub_cards_for_cook() where id::text in (select id from cook_ids)),
  array['Cook Burger', 'Cook Shrimp', 'Cook Salad', 'Cook Stew', 'Cook Toast'],
  'no cook: the popular order is unchanged'
);

select is(
  array(select title from public.hub_cards_for_cook(p_sort => 'newest') where id::text in (select id from cook_ids)),
  array['Cook Toast', 'Cook Stew', 'Cook Salad', 'Cook Shrimp', 'Cook Burger'],
  'no cook: the newest order is unchanged'
);

select is(
  array(select title from public.hub_cards_for_cook(array['kosher']) where id::text in (select id from cook_ids)),
  array['Cook Salad', 'Cook Stew', 'Cook Burger', 'Cook Shrimp', 'Cook Toast'],
  'kosher cards come first, like any diet'
);

select is(
  array(select title from public.hub_cards_for_cook(p_allergens => array['shellfish']) where id::text in (select id from cook_ids)),
  array['Cook Burger', 'Cook Salad', 'Cook Stew', 'Cook Toast', 'Cook Shrimp'],
  'a card with an allergen goes last'
);

select is(
  array(select title from public.hub_cards_for_cook(array['halal'], p_allergens => array['gluten']) where id::text in (select id from cook_ids)),
  array['Cook Salad', 'Cook Stew', 'Cook Toast', 'Cook Burger', 'Cook Shrimp'],
  'allergens outrank diets: a halal card with gluten still goes after every card without it'
);

select is(
  array(select title from public.hub_cards_for_cook(p_dislikes => array['onion', 'garlic']) where id::text in (select id from cook_ids)),
  array['Cook Salad', 'Cook Stew', 'Cook Toast', 'Cook Burger', 'Cook Shrimp'],
  'cards with a disliked food come lower'
);

select is(
  array(select title from public.hub_cards_for_cook(array['halal'], p_dislikes => array['olives']) where id::text in (select id from cook_ids)),
  array['Cook Burger', 'Cook Shrimp', 'Cook Salad', 'Cook Stew', 'Cook Toast'],
  'diets outrank dislikes: a disliked food only reorders cards that fit as many diets'
);

select is(
  array(select title from public.hub_cards_for_cook(p_allergy_words => array['  Avocado '], p_sort => 'newest') where id::text in (select id from cook_ids)),
  array['Cook Stew', 'Cook Salad', 'Cook Shrimp', 'Cook Burger', 'Cook Toast'],
  'a typed allergy matches an ingredient name, even on a card that was never checked'
);

select is(
  array(select title from public.hub_cards_for_cook(p_dislike_words => array['corn', 'live'], p_sort => 'newest') where id::text in (select id from cook_ids)),
  array['Cook Toast', 'Cook Stew', 'Cook Salad', 'Cook Shrimp', 'Cook Burger'],
  'Latin words match only at the start of a word: corn is not peppercorns, live is not olives'
);

select is(
  array(select title from public.hub_cards_for_cook(p_dislike_words => array['כוסברה']) where id::text in (select id from cook_ids)),
  array['Cook Burger', 'Cook Shrimp', 'Cook Salad', 'Cook Toast', 'Cook Stew'],
  'a Hebrew typed dislike matches inside the ingredient name'
);

select is(
  array(select title from public.hub_cards_for_cook(p_allergens => array['milk'], p_platform => 'youtube') where id::text in (select id from cook_ids)),
  '{}'::text[],
  'the platform filter still applies'
);

reset role;

select throws_ok(
  $$update public.recipe_cards set contains = array_fill('milk'::text, array[33])
    where id = '41000000-0000-4000-8000-000000000005'$$,
  '23514',
  null,
  'contains is capped at 32 entries'
);

select * from finish();
rollback;
