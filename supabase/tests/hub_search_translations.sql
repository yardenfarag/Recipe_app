begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- Two cards written in English; the curry has a Hebrew and a Spanish translation, the soup none.
insert into public.recipe_cards (
  id, canonical_key, canonical_url, original_url, platform, title,
  ingredients, instructions, servings, extraction_status, extraction_source, tags, save_count
)
values
  ('42000000-0000-4000-8000-000000000001', 'web:https://example.com/s-curry', 'https://example.com/s-curry',
   'https://example.com/s-curry', 'web', 'Search Curry with Coconut Rice',
   '[{"name": "rice"}]', '[{"step": 1, "text": "Cook."}]', 2, 'full', 'web', array['curry'], 2),
  ('42000000-0000-4000-8000-000000000002', 'web:https://example.com/s-soup', 'https://example.com/s-soup',
   'https://example.com/s-soup', 'web', 'Search Tomato Soup',
   '[{"name": "tomatoes"}]', '[{"step": 1, "text": "Cook."}]', 2, 'full', 'web', array['soup'], 1);

insert into public.recipe_card_translations (card_id, language_code, title, translation_version)
values
  ('42000000-0000-4000-8000-000000000001', 'he', 'קארי צ׳יפוטלה עם אורז קוקוס', 1),
  ('42000000-0000-4000-8000-000000000001', 'es', 'Curry con arroz de coco', 1);

create temp table search_ids as
select '42000000-0000-4000-8000-00000000000' || n as id from generate_series(1, 2) n;
grant select on search_ids to anon;

set local role anon;

select is(
  array(select title from public.hub_cards_for_cook(p_search => 'rice') where id::text in (select id from search_ids)),
  array['Search Curry with Coconut Rice'],
  'the title as written still matches'
);

select is(
  array(select title from public.hub_cards_for_cook(p_search => 'אורז') where id::text in (select id from search_ids)),
  array['Search Curry with Coconut Rice'],
  'a Hebrew word finds the card by its Hebrew title'
);

select is(
  array(select title from public.hub_cards_for_cook(p_search => 'ARROZ') where id::text in (select id from search_ids)),
  array['Search Curry with Coconut Rice'],
  'any translation counts, in any case'
);

select is(
  array(select title from public.hub_cards_for_cook(p_search => 'צ''יפוטלה') where id::text in (select id from search_ids)),
  array['Search Curry with Coconut Rice'],
  'a typed apostrophe matches a Hebrew geresh'
);

select is(
  array(select title from public.hub_cards_for_cook(p_search => 'מרק') where id::text in (select id from search_ids)),
  '{}'::text[],
  'a word in no title finds nothing'
);

select is(
  array(select title from public.hub_cards(p_search => 'אורז') where id::text in (select id from search_ids)),
  array['Search Curry with Coconut Rice'],
  'hub_cards (older app builds) searches the translations too'
);

select cmp_ok(
  public.hub_cards_count(p_search => 'קוקוס', p_tags => array['curry']),
  '>=',
  1,
  'hub_cards_count counts a card found by its translation'
);

select is(
  public.hub_cards_count(p_search => 'קוקוס', p_tags => array['soup']),
  0,
  'hub_cards_count still applies the tag filter'
);

reset role;

select * from finish();
rollback;
