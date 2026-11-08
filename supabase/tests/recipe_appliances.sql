begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

-- Two users: one saves recipes, one claims Hub cards.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000261',
   'authenticated', 'authenticated', 'appliances-saver@pinch.invalid', '',
   now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000262',
   'authenticated', 'authenticated', 'appliances-claimer@pinch.invalid', '',
   now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- Schema

select has_column('public', 'recipes', 'appliances', 'recipes have an appliances column');
select has_column('public', 'recipe_cards', 'appliances', 'hub cards have an appliances column');
select col_is_null('public', 'recipes', 'appliances', 'recipes.appliances is nullable (old app builds never send it)');

-- Shape constraint

insert into public.recipes (user_id, title, ingredients, instructions, extraction_status)
values ('10000000-0000-4000-8000-000000000261', 'Old-style save',
        '[{"name":"egg","quantity":1,"unit":""}]'::jsonb, '[{"step":1,"text":"Mix"}]'::jsonb, 'full');

select is(
  (select appliances from public.recipes where title = 'Old-style save'),
  null,
  'a save without appliances stores NULL (not analysed)'
);

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, extraction_status, appliances)
    values ('10000000-0000-4000-8000-000000000261', 'Salad', '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Toss"}]', 'full', '[]')$$,
  'an empty list is accepted (analysed, needs nothing)'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, extraction_status, appliances)
    values ('10000000-0000-4000-8000-000000000261', 'Bad object', '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]', 'full', '{"key":"oven"}')$$,
  '23514', null,
  'an object instead of a list is rejected'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, extraction_status, appliances)
    values ('10000000-0000-4000-8000-000000000261', 'Bad string', '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]', 'full', '"oven"')$$,
  '23514', null,
  'a string instead of a list is rejected'
);

select lives_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, extraction_status, appliances)
    select '10000000-0000-4000-8000-000000000261', 'Twelve', '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]', 'full',
           (select jsonb_agg(jsonb_build_object('key', 'oven')) from generate_series(1, 12))$$,
  'twelve items are accepted'
);

select throws_ok(
  $$insert into public.recipes (user_id, title, ingredients, instructions, extraction_status, appliances)
    select '10000000-0000-4000-8000-000000000261', 'Thirteen', '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]', 'full',
           (select jsonb_agg(jsonb_build_object('key', 'oven')) from generate_series(1, 13))$$,
  '23514', null,
  'more than twelve items are rejected'
);

select throws_ok(
  $$insert into public.recipe_cards (canonical_key, canonical_url, original_url, platform, title,
                                     ingredients, instructions, servings, extraction_status, appliances)
    values ('web:https://example.com/bad-card', 'https://example.com/bad-card', 'https://example.com/bad-card',
            'web', 'Bad card', '[]', '[]', 1, 'full', '{"key":"oven"}')$$,
  '23514', null,
  'hub cards reject a non-list too'
);

-- Saving never writes Hub card content (PIN-67): extract-recipe publishes cards server-side.

insert into public.recipes (user_id, title, original_url, platform, ingredients, instructions,
                            extraction_status, extraction_source, appliances)
values ('10000000-0000-4000-8000-000000000261', 'Unpublished Soup', 'https://example.com/unpublished-soup', 'web',
        '[{"name":"tomato","quantity":4,"unit":""},{"name":"salt","quantity":1,"unit":"tsp"}]'::jsonb,
        '[{"step":1,"text":"Simmer"},{"step":2,"text":"Blend until smooth"}]'::jsonb,
        'full', 'web',
        '[{"key":"blender","required":true,"steps":[2],"origin":"source"}]'::jsonb);

select is(
  (select count(*)::int from public.recipe_cards where canonical_key = 'web:https://example.com/unpublished-soup'),
  0,
  'saving a public extract does not create a hub card'
);

-- The card extract-recipe published for Blender Soup, for the claim tests below.
insert into public.recipe_cards (canonical_key, canonical_url, original_url, platform, title,
                                 ingredients, instructions, servings, extraction_status, extraction_source, appliances)
values ('web:https://example.com/blender-soup', 'https://example.com/blender-soup',
        'https://example.com/blender-soup', 'web', 'Blender Soup',
        '[{"name":"tomato","quantity":4,"unit":""},{"name":"salt","quantity":1,"unit":"tsp"}]'::jsonb,
        '[{"step":1,"text":"Simmer"},{"step":2,"text":"Blend until smooth"}]'::jsonb, 1, 'full', 'web',
        '[{"key":"stovetop","required":true,"steps":[1],"origin":"source"},{"key":"blender","required":true,"steps":[2],"origin":"source"}]'::jsonb);

-- A card without appliances stays that way after a save; only the server fills it.
insert into public.recipe_cards (id, canonical_key, canonical_url, original_url, platform, title,
                                 ingredients, instructions, servings, extraction_status, extraction_source)
values ('30000000-0000-4000-8000-000000000261', 'web:https://example.com/old-card',
        'https://example.com/old-card', 'https://example.com/old-card', 'web', 'Old Card',
        '[{"name":"a","quantity":1,"unit":""},{"name":"b","quantity":1,"unit":""}]'::jsonb,
        '[{"step":1,"text":"Bake"},{"step":2,"text":"Serve"}]'::jsonb, 1, 'full', 'web');

insert into public.recipes (user_id, title, original_url, platform, ingredients, instructions,
                            extraction_status, extraction_source, appliances)
values ('10000000-0000-4000-8000-000000000261', 'Old Card', 'https://example.com/old-card', 'web',
        '[{"name":"a","quantity":1,"unit":""},{"name":"b","quantity":1,"unit":""}]'::jsonb,
        '[{"step":1,"text":"Bake"},{"step":2,"text":"Serve"}]'::jsonb,
        'full', 'web', '[{"key":"oven","required":true,"steps":[1],"origin":"source"}]'::jsonb);

select is(
  (select appliances from public.recipe_cards where id = '30000000-0000-4000-8000-000000000261'),
  null,
  'a save does not fill appliances on a hub card'
);

select is(
  (select save_count from public.recipe_cards where id = '30000000-0000-4000-8000-000000000261'),
  1,
  'a save still counts towards the existing hub card'
);

-- Claiming a Hub card

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000262","role":"authenticated"}',
  true
);

-- Claim in its own statement: a SELECT can't see rows inserted by a function it calls.
create temp table claimed_soup as
select public.claim_recipe_card(
  (select id from public.recipe_cards where canonical_key = 'web:https://example.com/blender-soup')
) as id;

select is(
  (select appliances from public.recipes where id = (select id from claimed_soup)),
  '[{"key":"stovetop","required":true,"steps":[1],"origin":"source"},{"key":"blender","required":true,"steps":[2],"origin":"source"}]'::jsonb,
  'claiming a hub card copies its appliances into the library'
);

insert into public.recipe_cards (id, canonical_key, canonical_url, original_url, platform, title,
                                 ingredients, instructions, servings, extraction_status, extraction_source)
values ('30000000-0000-4000-8000-000000000262', 'web:https://example.com/unanalysed',
        'https://example.com/unanalysed', 'https://example.com/unanalysed', 'web', 'Unanalysed',
        '[{"name":"egg","quantity":1,"unit":""}]'::jsonb, '[{"step":1,"text":"Boil"}]'::jsonb, 1, 'full', 'web');

create temp table claimed_unanalysed as
select public.claim_recipe_card('30000000-0000-4000-8000-000000000262') as id;

select is(
  (select appliances from public.recipes where id = (select id from claimed_unanalysed)),
  null,
  'claiming a card without appliances leaves the library copy not analysed'
);

select ok(
  has_function_privilege('authenticated', 'public.claim_recipe_card(uuid)', 'execute'),
  'signed-in users can still claim hub cards after the function is replaced'
);

select * from finish();
rollback;
