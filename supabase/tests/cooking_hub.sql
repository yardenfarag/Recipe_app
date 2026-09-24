begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000011',
  'authenticated',
  'authenticated',
  'hub-test@pinch.invalid',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

select is(
  (select contribute_to_hub from public.profiles
   where id = '10000000-0000-4000-8000-000000000011'),
  true,
  'new profiles contribute to the hub by default'
);

insert into public.recipe_cards (
  id,
  canonical_key,
  canonical_url,
  original_url,
  platform,
  title,
  ingredients,
  instructions,
  servings,
  extraction_status,
  extraction_source,
  tags
)
values (
  '30000000-0000-4000-8000-000000000001',
  'web:https://example.com/hub-pasta',
  'https://example.com/hub-pasta',
  'https://example.com/hub-pasta',
  'web',
  'Hub Pasta',
  '[{"name":"pasta","quantity":200,"unit":"g"},{"name":"salt","quantity":1,"unit":"tsp"}]'::jsonb,
  '[{"step":1,"text":"Boil"},{"step":2,"text":"Salt"}]'::jsonb,
  2,
  'full',
  'web',
  array['pasta']
);

insert into public.recipes (
  user_id,
  title,
  original_url,
  platform,
  ingredients,
  instructions,
  extraction_status,
  extraction_source
)
values (
  '10000000-0000-4000-8000-000000000011',
  'Hub Pasta',
  'https://example.com/hub-pasta',
  'web',
  '[{"name":"pasta","quantity":200,"unit":"g"}]'::jsonb,
  '[{"step":1,"text":"Boil"}]'::jsonb,
  'full',
  'web'
);

select is(
  (select save_count from public.recipe_cards
   where id = '30000000-0000-4000-8000-000000000001'),
  1,
  'saving an extracted public URL bumps hub save_count'
);

insert into public.recipes (
  user_id,
  title,
  original_url,
  platform,
  ingredients,
  instructions,
  extraction_status,
  extraction_source
)
values (
  '10000000-0000-4000-8000-000000000011',
  'Invented pasta',
  'https://example.com/hub-pasta',
  'web',
  '[{"name":"pasta","quantity":200,"unit":"g"}]'::jsonb,
  '[{"step":1,"text":"Boil"}]'::jsonb,
  'full',
  'invented'
);

select is(
  (select save_count from public.recipe_cards
   where id = '30000000-0000-4000-8000-000000000001'),
  1,
  'invented recipes do not bump hub save_count'
);

select public.touch_recipe_card_hit('30000000-0000-4000-8000-000000000001');
select is(
  (select extract_hit_count from public.recipe_cards
   where id = '30000000-0000-4000-8000-000000000001'),
  1,
  'hub cache hits increment extract_hit_count'
);

select throws_ok(
  $$select public.claim_recipe_card('30000000-0000-4000-8000-000000000001')$$,
  'not_authenticated',
  'claiming a hub card requires a signed-in user'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recipe_cards'
      and policyname = 'Anyone can read cooking hub cards'
  ),
  'hub cards are publicly readable'
);

select is(
  (select count(*)::int from public.recipe_cards
   where canonical_key = 'web:https://example.com/hub-pasta'),
  1,
  'canonical_key stays unique'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'contribute_to_hub'
  ),
  'profiles expose the hub contribution flag'
);

select is(
  public.recipe_card_canonical_key(
    'youtube',
    'https://youtu.be/dQw4w9WgXcQ?si=abc'
  ),
  'youtube:dQw4w9WgXcQ',
  'backfill keys YouTube shorts-style links'
);

insert into public.recipes (
  user_id,
  title,
  original_url,
  platform,
  ingredients,
  instructions,
  extraction_status,
  extraction_source
)
values (
  '10000000-0000-4000-8000-000000000011',
  'Backfill Soup',
  'https://www.youtube.com/watch?v=abcdefghijk',
  'youtube',
  '[{"name":"onion","quantity":1,"unit":"count"},{"name":"water","quantity":1,"unit":"cup"}]'::jsonb,
  '[{"step":1,"text":"Chop"},{"step":2,"text":"Simmer"}]'::jsonb,
  'full',
  'description'
);

select is(
  public.backfill_recipe_cards() >= 1,
  true,
  'backfill inserts eligible public extracts'
);

select ok(
  exists (
    select 1 from public.recipe_cards
    where canonical_key = 'youtube:abcdefghijk'
      and title = 'Backfill Soup'
  ),
  'backfill creates a hub card from a library extract'
);

select * from finish();
rollback;
