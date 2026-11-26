begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- PIN-77 (migration 20261127120000_recipe_diets): a Library recipe's checked diets go stale, and back to null,
-- when its ingredients change; other edits and the backfill's own write keep them.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000ad001',
        'authenticated', 'authenticated', 'diets-a@pinch.invalid', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, email) values ('10000000-0000-4000-8000-0000000ad001', 'diets-a@pinch.invalid')
on conflict (id) do nothing;

insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-0000000ad001', '10000000-0000-4000-8000-0000000ad001', 'Dal',
        '[{"name":"red lentils","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Simmer"}]');

-- The backfill writes the answer.
update public.recipes set diets = array['vegetarian', 'vegan'] where id = '20000000-0000-4000-8000-0000000ad001';
select is((select diets from public.recipes where id = '20000000-0000-4000-8000-0000000ad001'),
          array['vegetarian', 'vegan'], 'the backfill''s answer is kept');

update public.recipes set title = 'Red lentil dal' where id = '20000000-0000-4000-8000-0000000ad001';
select is((select diets from public.recipes where id = '20000000-0000-4000-8000-0000000ad001'),
          array['vegetarian', 'vegan'], 'renaming keeps it');

update public.recipes set ingredients = '[{"name":"red lentils","quantity":1,"unit":"cup"},{"name":"bacon","quantity":2,"unit":"slices"}]'
where id = '20000000-0000-4000-8000-0000000ad001';
select is((select diets from public.recipes where id = '20000000-0000-4000-8000-0000000ad001'),
          null::text[], 'new ingredients make it stale: not checked again yet');

select throws_ok(
  $$ update public.recipes set diets = array['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q']
     where id = '20000000-0000-4000-8000-0000000ad001' $$,
  '23514', null, 'at most 16 diets'
);

-- Labelled when saved -----------------------------------------------------------
-- 1. The extraction's answer arrives first; the save picks it up.
select is(
  public.remember_recipe_diets('10000000-0000-4000-8000-0000000ad001',
    '[{"name":"Chickpeas"},{"name":"spinach"}]', array['vegan', 'vegetarian']),
  0, 'nothing saved yet: the answer waits'
);
insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-0000000ad002', '10000000-0000-4000-8000-0000000ad001', 'Curry',
        '[{"name":"chickpeas ","quantity":1,"unit":"can"},{"name":"Spinach","quantity":2,"unit":"cups"}]', '[{"step":1,"text":"Cook"}]');
select is((select diets from public.recipes where id = '20000000-0000-4000-8000-0000000ad002'),
          array['vegan', 'vegetarian'], 'the save takes the waiting answer (names compared ignoring case and spaces)');

-- 2. The recipe is saved first; the answer labels it when it arrives.
insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-0000000ad003', '10000000-0000-4000-8000-0000000ad001', 'Steak',
        '[{"name":"beef","quantity":1,"unit":"lb"}]', '[{"step":1,"text":"Cook"}]');
select is((select diets from public.recipes where id = '20000000-0000-4000-8000-0000000ad003'), null::text[], 'saved before the answer');
select is(public.remember_recipe_diets('10000000-0000-4000-8000-0000000ad001', '[{"name":"beef"}]', array['halal']),
          1, 'the late answer labels the saved copy');

-- 3. Other ingredients are another recipe: not labelled.
insert into public.recipes (id, user_id, title, ingredients, instructions)
values ('20000000-0000-4000-8000-0000000ad004', '10000000-0000-4000-8000-0000000ad001', 'Steak and eggs',
        '[{"name":"beef","quantity":1,"unit":"lb"},{"name":"eggs","quantity":2,"unit":""}]', '[{"step":1,"text":"Cook"}]');
select is((select diets from public.recipes where id = '20000000-0000-4000-8000-0000000ad004'), null::text[],
          'different ingredients don''t take the answer');

-- 4. Saved from the Hub: the card's diets come along.
insert into public.recipe_cards (canonical_key, canonical_url, original_url, platform, title, ingredients, diets)
values (public.recipe_card_canonical_key('web', 'https://e2e-diets.example/dal'), 'https://e2e-diets.example/dal',
        'https://e2e-diets.example/dal', 'web', 'Dal', '[{"name":"red lentils"}]', array['vegan']);
insert into public.recipes (id, user_id, title, ingredients, instructions, platform, original_url)
values ('20000000-0000-4000-8000-0000000ad005', '10000000-0000-4000-8000-0000000ad001', 'Dal',
        '[{"name":"red lentils","quantity":1,"unit":"cup"}]', '[{"step":1,"text":"Cook"}]', 'web', 'https://e2e-diets.example/dal');
select is((select diets from public.recipes where id = '20000000-0000-4000-8000-0000000ad005'), array['vegan'],
          'a recipe from a Hub card takes the card''s diets');

select ok(
  not has_function_privilege('authenticated', 'public.remember_recipe_diets(uuid, jsonb, text[])', 'execute'),
  'only the server labels recipes'
);

select * from finish();
rollback;
