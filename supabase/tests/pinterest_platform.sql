begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

-- PIN-70: recipes imported from Pinterest pins save with platform 'pinterest'.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000700',
        'authenticated', 'authenticated', 'pinterest@pinch.invalid', '',
        now(), '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000700"}';

select lives_ok(
  $$insert into public.recipes (id, user_id, title, ingredients, instructions, servings, platform, original_url)
    values ('20000000-0000-4000-8000-000000000701', '10000000-0000-4000-8000-000000000700', 'Tortellini soup',
            '[{"name":"tortellini","quantity":14,"unit":"oz"}]', '[{"step":1,"text":"Simmer"}]', 6,
            'pinterest', 'https://www.pinterest.com/pin/452611831329517145/')$$,
  'a recipe from a Pinterest pin saves'
);

select lives_ok(
  $$insert into public.recipes (id, user_id, title, ingredients, instructions, servings, platform)
    values ('20000000-0000-4000-8000-000000000702', '10000000-0000-4000-8000-000000000700', 'Reel',
            '[{"name":"oats","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Blend"}]', 1, 'facebook')$$,
  'every platform allowed before still saves'
);

select throws_ok(
  $$insert into public.recipes (id, user_id, title, ingredients, instructions, servings, platform)
    values ('20000000-0000-4000-8000-000000000703', '10000000-0000-4000-8000-000000000700', 'Nope',
            '[{"name":"x","quantity":1,"unit":""}]', '[{"step":1,"text":"x"}]', 1, 'myspace')$$,
  '23514',
  null,
  'an unknown platform is still refused'
);

reset role;

select throws_ok(
  $$insert into public.recipe_cards
      (canonical_key, canonical_url, original_url, platform, title, ingredients, instructions, servings)
    values ('pinterest:452611831329517145', 'https://www.pinterest.com/pin/452611831329517145/',
            'https://www.pinterest.com/pin/452611831329517145/', 'pinterest', 'Tortellini soup',
            '[{"name":"tortellini","quantity":14,"unit":"oz"}]', '[{"step":1,"text":"Simmer"}]', 6)$$,
  '23514',
  null,
  'Pinterest recipes stay out of the Hub'
);

select * from finish();
rollback;
