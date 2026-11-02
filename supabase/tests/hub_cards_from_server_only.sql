begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- PIN-67: a signed-in user inserting a crafted recipe through REST can't create
-- or change a public Hub card. Only extract-recipe (service role) publishes.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000671',
  'authenticated', 'authenticated', 'hub-spammer@pinch.invalid', '',
  now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

-- A card extract-recipe published, with no image yet.
insert into public.recipe_cards (id, canonical_key, canonical_url, original_url, platform, title,
                                 ingredients, instructions, servings, extraction_status, extraction_source)
values ('30000000-0000-4000-8000-000000000671', 'web:https://example.com/real-stew',
        'https://example.com/real-stew', 'https://example.com/real-stew', 'web', 'Real Stew',
        '[{"name":"beef","quantity":500,"unit":"g"},{"name":"carrot","quantity":2,"unit":""}]'::jsonb,
        '[{"step":1,"text":"Brown"},{"step":2,"text":"Simmer"}]'::jsonb, 2, 'full', 'web');

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000671"}';

-- Claim an unextracted popular URL with spam.
insert into public.recipes (user_id, title, original_url, platform, ingredients, instructions,
                            extraction_status, extraction_source, image_url)
values ('10000000-0000-4000-8000-000000000671', 'BUY CHEAP PILLS', 'https://example.com/popular-cake', 'web',
        '[{"name":"spam","quantity":1,"unit":""},{"name":"spam","quantity":2,"unit":""}]'::jsonb,
        '[{"step":1,"text":"Visit spam.example"},{"step":2,"text":"Now"}]'::jsonb,
        'full', 'web', 'https://tracker.example/pixel.gif');

-- Try to fill the real card's missing image and rewrite it.
insert into public.recipes (user_id, title, original_url, platform, ingredients, instructions,
                            extraction_status, extraction_source, image_url, appliances)
values ('10000000-0000-4000-8000-000000000671', 'Hijacked Stew', 'https://example.com/real-stew', 'web',
        '[{"name":"spam","quantity":1,"unit":""},{"name":"spam","quantity":2,"unit":""}]'::jsonb,
        '[{"step":1,"text":"Visit spam.example"},{"step":2,"text":"Now"}]'::jsonb,
        'full', 'web', 'https://tracker.example/pixel.gif',
        '[{"key":"oven","required":true,"steps":[1],"origin":"source"}]'::jsonb);

select throws_ok(
  $$insert into public.recipe_cards (canonical_key, canonical_url, original_url, platform, title,
                                     ingredients, instructions, servings, extraction_status)
    values ('web:https://example.com/direct', 'https://example.com/direct', 'https://example.com/direct',
            'web', 'Direct', '[]', '[]', 1, 'full')$$,
  '42501', null,
  'clients cannot insert hub cards directly'
);

reset role;

select is(
  (select count(*)::int from public.recipe_cards where canonical_key = 'web:https://example.com/popular-cake'),
  0,
  'a crafted save with no extraction creates no hub card'
);

select is(
  (select title from public.recipe_cards where id = '30000000-0000-4000-8000-000000000671'),
  'Real Stew',
  'a crafted save does not rewrite an existing card title'
);

select is(
  (select image_url from public.recipe_cards where id = '30000000-0000-4000-8000-000000000671'),
  null,
  'a crafted save does not fill a missing card image'
);

select is(
  (select appliances from public.recipe_cards where id = '30000000-0000-4000-8000-000000000671'),
  null,
  'a crafted save does not fill missing card appliances'
);

select is(
  (select ingredients->0->>'name' from public.recipe_cards where id = '30000000-0000-4000-8000-000000000671'),
  'beef',
  'a crafted save does not change card ingredients'
);

select is(
  (select save_count from public.recipe_cards where id = '30000000-0000-4000-8000-000000000671'),
  1,
  'the save still counts towards the existing card'
);

select * from finish();
rollback;
