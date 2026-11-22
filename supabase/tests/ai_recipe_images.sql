begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- Drawn pictures for recipes without a photo (20261122210000_ai_recipe_images.sql).

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000900',
        'authenticated', 'authenticated', 'ai-images@pinch.invalid', '',
        now(), '{}'::jsonb, '{}'::jsonb, now(), now());

select col_not_null('public', 'recipes', 'image_generated', 'recipes.image_generated is never null');
select col_default_is('public', 'recipes', 'image_generated', 'false', 'old app builds save recipes as photos');
select col_default_is('public', 'recipe_cards', 'image_generated', 'false', 'and cards default to photos too');

insert into public.recipe_cards (id, canonical_key, canonical_url, original_url, platform, title,
                                 image_url, image_generated, ingredients, instructions, servings,
                                 extraction_status, extraction_source)
values ('30000000-0000-4000-8000-000000000901', 'web:https://example.com/casserole',
        'https://example.com/casserole', 'https://example.com/casserole', 'web', 'Casserole',
        'https://project.supabase.co/storage/v1/object/public/recipe-thumbnails/ai/abc.jpg', true,
        '[{"name":"chicken","quantity":1,"unit":""},{"name":"zucchini","quantity":2,"unit":""}]'::jsonb,
        '[{"step":1,"text":"Layer"},{"step":2,"text":"Bake"}]'::jsonb, 4, 'full', 'web');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000900","role":"authenticated"}',
  true
);

create temp table claimed_casserole as
select public.claim_recipe_card('30000000-0000-4000-8000-000000000901') as id;

select is(
  (select row(image_url, image_generated)::text from public.recipes where id = (select id from claimed_casserole)),
  row('https://project.supabase.co/storage/v1/object/public/recipe-thumbnails/ai/abc.jpg', true)::text,
  'saving a Hub card with a drawn picture keeps the AI mark in the library'
);

insert into public.recipes (id, user_id, title, ingredients, instructions, servings)
values ('20000000-0000-4000-8000-000000000901', '10000000-0000-4000-8000-000000000900', 'Written',
        '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]', 1);

select is(
  (select image_generated from public.recipes where id = '20000000-0000-4000-8000-000000000901'),
  false,
  'a recipe saved without the column is a photo (or none)'
);

update public.recipes set recalc_pending = '{calories,image}'
where id = '20000000-0000-4000-8000-000000000901';

select is(
  (select recalc_pending from public.recipes where id = '20000000-0000-4000-8000-000000000901'),
  '{calories,image}'::text[],
  'a picture being drawn can be pending'
);

select throws_ok(
  $$update public.recipes set recalc_pending = '{photo}' where id = '20000000-0000-4000-8000-000000000901'$$,
  '23514', 'new row for relation "recipes" violates check constraint "recipes_recalc_pending_known"',
  'unknown pending fields are still refused'
);

select * from finish();
rollback;
